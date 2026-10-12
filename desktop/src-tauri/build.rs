fn main() {
    // Declares the app's own commands so capabilities can allow them by name
    // (allow-activity-poll / allow-list-new-files / allow-focus-window) — nothing else is reachable.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["activity_poll", "list_new_files", "focus_window"])),
    )
    .expect("failed to run tauri-build");
}
