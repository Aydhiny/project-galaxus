// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The window itself (URL, size, title) is declared in tauri.conf.json — this
// shell just hosts the live web app, so updates ship with every web deploy
// and the installer never needs re-downloading for new features.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Galaxus");
}
