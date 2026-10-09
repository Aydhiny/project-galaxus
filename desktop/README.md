# Galaxus desktop (Tauri)

A ~10 MB native shell for **Windows (.exe)** and **macOS (.dmg, Apple Silicon + Intel)** that opens
`https://project-galaxus.vercel.app` in its own app window. New features ship with every web
deploy — the installer only needs rebuilding to change the shell itself (icon, window size, name).

## Releasing
Push a tag and GitHub Actions builds both installers and attaches them to a public Release:

```bash
git tag desktop-v0.1.1 && git push origin desktop-v0.1.1
```

Bump `version` in `src-tauri/tauri.conf.json` first. The `/install` page links to the latest release
automatically.

## Signing (removes the first-launch warnings)
Builds are unsigned by default, so macOS shows "Apple cannot check this app" (System Settings →
Privacy & Security → **Open Anyway**, once) and Windows shows SmartScreen (**More info → Run anyway**).
To sign + notarize on macOS, add these repo secrets (Apple Developer Program, $99/yr):
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`. The workflow picks them up automatically.

## Local build (needs Rust: https://rustup.rs)
```bash
cd desktop && npm install && npm run icons && npm run build
```
