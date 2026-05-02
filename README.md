# TickNest

TickNest is a macOS-first local notes app built with Tauri + React.

## Features

- Local-only storage (SQLite) with no cloud sync
- Main and child notes hierarchy
- Pinning, color tags, markdown edit/preview
- Local title/content search
- macOS menu bar quick note action
- Markdown export with selectable main/child notes
- Storage modes: app sandbox (default) or custom vault folder

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Rust backend check:

```bash
cd src-tauri
cargo check
```
