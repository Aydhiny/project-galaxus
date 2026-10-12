// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The window itself (URL, size, title) is declared in tauri.conf.json — this
// shell hosts the live web app, so features ship with every web deploy.
//
// On top of that, two small native helpers the web app can call (and nothing
// else — see capabilities/default.json):
//   • activity_poll  — which app you were actively using, minute by minute
//                      (only while you touch mouse/keyboard). Window titles
//                      NEVER leave this process: a browser title is reduced to
//                      a single word ("youtube", "instagram", …) or nothing.
//   • list_new_files — names + times of new project files (e.g. FL Studio
//                      .flp) in one folder you choose, so finished beats can be
//                      logged automatically.
//   • focus_window   — bring this window to the front (doomscroll guard).
// Closing the window hides it to the tray so tracking keeps running.

use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};

const SAMPLE_SECS: u64 = 5;
const IDLE_LIMIT_SECS: u64 = 90; // no input for 90 s → you're away, nothing is counted
const MAX_MINUTES_KEPT: usize = 60 * 24 * 3; // never hold more than ~3 days if the web side is asleep

#[derive(Serialize, Clone)]
struct Sample {
    minute: u64, // unix minute
    app: String,
    site: Option<String>,
    secs: u64,
}

#[derive(Serialize)]
struct Poll {
    samples: Vec<Sample>,
    idle_secs: u64,
}

#[derive(Serialize)]
struct FileInfo {
    name: String,
    modified_ms: u64,
}

#[derive(Default)]
struct Tracker {
    // minute → (app, site) → seconds active
    minutes: BTreeMap<u64, HashMap<(String, Option<String>), u64>>,
}

type Shared = Arc<Mutex<Tracker>>;

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn idle_secs() -> u64 {
    user_idle::UserIdle::get_time().map(|i| i.as_seconds()).unwrap_or(0)
}

/// A browser tab title → one known word, or None. The title itself is dropped here.
fn site_of(title: &str) -> Option<String> {
    let t = title.to_lowercase();
    for (needle, site) in [
        ("youtube", "youtube"),
        ("instagram", "instagram"),
        ("tiktok", "tiktok"),
        ("facebook", "facebook"),
        ("/ x", "x"),
        ("twitter", "x"),
        ("netflix", "netflix"),
        ("twitch", "twitch"),
    ] {
        if t.contains(needle) {
            return Some(site.to_string());
        }
    }
    None
}

fn sample(tracker: &Shared) {
    let idle = idle_secs();
    if idle > IDLE_LIMIT_SECS {
        return;
    }
    let win = match active_win_pos_rs::get_active_window() {
        Ok(w) => w,
        Err(_) => return,
    };
    let app = win.app_name.trim().to_string();
    if app.is_empty() {
        return;
    }
    let site = site_of(&win.title);
    let minute = now_secs() / 60;
    if let Ok(mut t) = tracker.lock() {
        *t.minutes.entry(minute).or_default().entry((app, site)).or_insert(0) += SAMPLE_SECS;
        while t.minutes.len() > MAX_MINUTES_KEPT {
            let first = *t.minutes.keys().next().unwrap();
            t.minutes.remove(&first);
        }
    }
}

#[tauri::command]
fn activity_poll(state: tauri::State<'_, Shared>) -> Poll {
    let mut samples = Vec::new();
    if let Ok(mut t) = state.lock() {
        let current = now_secs() / 60;
        // Hand over every finished minute; keep the one still being filled.
        let done: Vec<u64> = t.minutes.keys().copied().filter(|m| *m < current).collect();
        for m in done {
            if let Some(apps) = t.minutes.remove(&m) {
                for ((app, site), secs) in apps {
                    samples.push(Sample { minute: m, app, site, secs });
                }
            }
        }
    }
    Poll { samples, idle_secs: idle_secs() }
}

/// New files with one of a few project extensions, up to 3 folders deep. Names only.
#[tauri::command]
fn list_new_files(dir: String, ext: String, since_ms: u64) -> Result<Vec<FileInfo>, String> {
    let ext = ext.to_lowercase();
    if !["flp", "als", "logicx", "rpp", "ptx"].contains(&ext.as_str()) {
        return Err("Unsupported file type".into());
    }
    let root = Path::new(&dir);
    if !root.is_dir() {
        return Err("Folder not found".into());
    }
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0u8)];
    let mut seen = 0u32;
    while let Some((path, depth)) = stack.pop() {
        let entries = match std::fs::read_dir(&path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            seen += 1;
            if seen > 20_000 {
                return Ok(out);
            }
            let p = entry.path();
            if p.is_dir() {
                if depth < 3 {
                    stack.push((p, depth + 1));
                }
                continue;
            }
            let matches = p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase() == ext).unwrap_or(false);
            if !matches {
                continue;
            }
            let modified_ms = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if modified_ms > since_ms {
                let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                if !name.is_empty() {
                    out.push(FileInfo { name, modified_ms });
                }
            }
        }
    }
    Ok(out)
}

/// The doomscroll guard brings Galaxus to the front (it can't do anything else to the window).
#[tauri::command]
fn focus_window(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn main() {
    let tracker: Shared = Arc::new(Mutex::new(Tracker::default()));
    let sampler = tracker.clone();
    thread::spawn(move || loop {
        sample(&sampler);
        thread::sleep(Duration::from_secs(SAMPLE_SECS));
    });

    tauri::Builder::default()
        .manage(tracker)
        .invoke_handler(tauri::generate_handler![activity_poll, list_new_files, focus_window])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Open Galaxus", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Galaxus", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new().tooltip("Galaxus").menu(&menu).on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        // Closing the window keeps Galaxus in the tray, so tracking continues. Quit from the tray menu.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Galaxus");
}
