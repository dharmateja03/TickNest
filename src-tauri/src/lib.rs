use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::Manager;

struct AppState {
    conn: Mutex<Connection>,
    current_db_path: Mutex<PathBuf>,
}

#[derive(Serialize, Deserialize)]
struct Note {
    id: i64,
    parent_id: Option<i64>,
    title: String,
    content: String,
    is_markdown: bool,
    pinned: bool,
    color: Option<String>,
    text_color: Option<String>,
    note_opacity: Option<f64>,
    font_family: Option<String>,
    font_size: Option<f64>,
    shadow_level: Option<f64>,
    tilt_deg: Option<f64>,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
struct NewNote {
    parent_id: Option<i64>,
    title: String,
    content: String,
    is_markdown: bool,
    pinned: bool,
    color: Option<String>,
    text_color: Option<String>,
    note_opacity: Option<f64>,
    font_family: Option<String>,
    font_size: Option<f64>,
    shadow_level: Option<f64>,
    tilt_deg: Option<f64>,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
}

#[derive(Serialize, Deserialize)]
struct UpdateNote {
    id: i64,
    parent_id: Option<i64>,
    title: String,
    content: String,
    is_markdown: bool,
    pinned: bool,
    color: Option<String>,
    text_color: Option<String>,
    note_opacity: Option<f64>,
    font_family: Option<String>,
    font_size: Option<f64>,
    shadow_level: Option<f64>,
    tilt_deg: Option<f64>,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
}

#[derive(Serialize, Deserialize)]
struct AppSettings {
    storage_mode: String,
    custom_vault_path: Option<String>,
    export_include_metadata: bool,
    markdown_preview_default: bool,
}

#[derive(Serialize, Deserialize)]
struct ExportSelection {
    note_ids: Vec<i64>,
}

#[derive(Serialize, Deserialize)]
struct ExportOptions {
    include_metadata: bool,
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_id INTEGER,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          is_markdown INTEGER NOT NULL DEFAULT 1,
          pinned INTEGER NOT NULL DEFAULT 0,
          color TEXT,
          text_color TEXT,
          note_opacity REAL,
          font_family TEXT,
          font_size REAL,
          shadow_level REAL,
          tilt_deg REAL,
          pos_x REAL,
          pos_y REAL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes(parent_id);
        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN pos_x REAL", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN pos_y REAL", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN text_color TEXT", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN note_opacity REAL", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN font_family TEXT", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN font_size REAL", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN shadow_level REAL", []);
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN tilt_deg REAL", []);

    conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('storage_mode', 'sandbox')", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('export_include_metadata', 'true')",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('markdown_preview_default', 'true')",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("ticknest.db"))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        is_markdown: row.get::<_, i64>(4)? == 1,
        pinned: row.get::<_, i64>(5)? == 1,
        color: row.get(6)?,
        text_color: row.get(7)?,
        note_opacity: row.get(8)?,
        font_family: row.get(9)?,
        font_size: row.get(10)?,
        shadow_level: row.get(11)?,
        tilt_deg: row.get(12)?,
        pos_x: row.get(13)?,
        pos_y: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

#[tauri::command]
fn create_note(state: tauri::State<AppState>, payload: NewNote) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    let ts = now_iso();
    conn.execute(
        "INSERT INTO notes (parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            payload.parent_id,
            payload.title,
            payload.content,
            if payload.is_markdown { 1 } else { 0 },
            if payload.pinned { 1 } else { 0 },
            payload.color,
            payload.text_color,
            payload.note_opacity,
            payload.font_family,
            payload.font_size,
            payload.shadow_level,
            payload.tilt_deg,
            payload.pos_x,
            payload.pos_y,
            ts,
            ts
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn
        .prepare("SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([id], row_to_note).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_note(state: tauri::State<AppState>, payload: UpdateNote) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    conn.execute(
        "UPDATE notes
         SET parent_id = ?1, title = ?2, content = ?3, is_markdown = ?4, pinned = ?5, color = ?6, text_color = ?7, note_opacity = ?8, font_family = ?9, font_size = ?10, shadow_level = ?11, tilt_deg = ?12, pos_x = ?13, pos_y = ?14, updated_at = ?15
         WHERE id = ?16",
        params![
            payload.parent_id,
            payload.title,
            payload.content,
            if payload.is_markdown { 1 } else { 0 },
            if payload.pinned { 1 } else { 0 },
            payload.color,
            payload.text_color,
            payload.note_opacity,
            payload.font_family,
            payload.font_size,
            payload.shadow_level,
            payload.tilt_deg,
            payload.pos_x,
            payload.pos_y,
            now_iso(),
            payload.id
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([payload.id], row_to_note).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    conn.execute("DELETE FROM notes WHERE parent_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_notes(state: tauri::State<AppState>) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at
             FROM notes
             ORDER BY pinned DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], row_to_note)
        .map_err(|e| e.to_string())?;

    let notes: Result<Vec<Note>, _> = rows.collect();
    notes.map_err(|e| e.to_string())
}

#[tauri::command]
fn search_notes(state: tauri::State<AppState>, query: String) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    let q = query.trim().to_lowercase();
    let like = format!("%{}%", q);
    let mut stmt = conn
        .prepare(
            "SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at
             FROM notes
             WHERE lower(title) LIKE ?1 OR lower(content) LIKE ?1
             ORDER BY
               CASE WHEN lower(title) LIKE ?2 THEN 0 ELSE 1 END,
               pinned DESC,
               updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![like, like], row_to_note)
        .map_err(|e| e.to_string())?;
    let notes: Result<Vec<Note>, _> = rows.collect();
    notes.map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Result<AppSettings, String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;

    let storage_mode: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'storage_mode'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "sandbox".to_string());

    let custom_vault_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'custom_vault_path'",
            [],
            |row| row.get(0),
        )
        .ok();

    let export_include_metadata: bool = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'export_include_metadata'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v == "true")
        .unwrap_or(true);

    let markdown_preview_default: bool = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'markdown_preview_default'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v == "true")
        .unwrap_or(true);

    Ok(AppSettings {
        storage_mode,
        custom_vault_path,
        export_include_metadata,
        markdown_preview_default,
    })
}

#[tauri::command]
fn update_settings(state: tauri::State<AppState>, settings: AppSettings) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('storage_mode', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [settings.storage_mode],
    )
    .map_err(|e| e.to_string())?;

    if let Some(path) = settings.custom_vault_path {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('custom_vault_path', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [path],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('export_include_metadata', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [if settings.export_include_metadata { "true" } else { "false" }],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('markdown_preview_default', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [if settings.markdown_preview_default { "true" } else { "false" }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_storage_mode(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    mode: String,
    custom_vault_path: Option<String>,
) -> Result<(), String> {
    let next_path = if mode == "custom_vault" {
        let custom = custom_vault_path
            .clone()
            .ok_or_else(|| "custom_vault_path required".to_string())?;
        let dir = Path::new(&custom);
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        dir.join("ticknest.db")
    } else {
        db_path(&app)?
    };

    let new_conn = Connection::open(&next_path).map_err(|e| e.to_string())?;
    init_db(&new_conn)?;

    {
        let mut conn_lock = state.conn.lock().map_err(|_| "lock error".to_string())?;
        *conn_lock = new_conn;
    }
    {
        let mut path_lock = state.current_db_path.lock().map_err(|_| "lock error".to_string())?;
        *path_lock = next_path;
    }

    let settings = AppSettings {
        storage_mode: mode,
        custom_vault_path,
        export_include_metadata: true,
        markdown_preview_default: true,
    };
    update_settings(state, settings)
}

#[tauri::command]
fn export_notes(
    state: tauri::State<AppState>,
    selection: ExportSelection,
    mode: String,
    destination_path: String,
    options: ExportOptions,
) -> Result<(), String> {
    if selection.note_ids.is_empty() {
        return Err("Select at least one note to export".to_string());
    }

    let conn = state.conn.lock().map_err(|_| "lock error".to_string())?;
    let destination = PathBuf::from(destination_path);
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;

    let mut combined = String::new();

    for note_id in selection.note_ids {
        let note: Note = conn
            .query_row(
                "SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at FROM notes WHERE id = ?1",
                [note_id],
                row_to_note,
            )
            .map_err(|e| e.to_string())?;

        let mut note_md = String::new();
        note_md.push_str(&format!("# {}\n\n", note.title));
        if options.include_metadata {
            note_md.push_str(&format!("- Created: {}\n- Updated: {}\n\n", note.created_at, note.updated_at));
        }
        note_md.push_str(&note.content);
        note_md.push_str("\n\n");

        let mut child_stmt = conn
            .prepare(
                "SELECT id, parent_id, title, content, is_markdown, pinned, color, text_color, note_opacity, font_family, font_size, shadow_level, tilt_deg, pos_x, pos_y, created_at, updated_at
                 FROM notes WHERE parent_id = ?1 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let child_rows = child_stmt
            .query_map([note.id], row_to_note)
            .map_err(|e| e.to_string())?;

        for child in child_rows {
            let child = child.map_err(|e| e.to_string())?;
            note_md.push_str(&format!("## {}\n\n{}\n\n", child.title, child.content));
        }

        if mode == "single_file" {
            combined.push_str(&note_md);
            combined.push_str("---\n\n");
        } else {
            let safe_title = note.title.replace('/', "-").replace(':', "-");
            let file_path = destination.join(format!("{}.md", safe_title));
            fs::write(file_path, note_md).map_err(|e| e.to_string())?;
        }
    }

    if mode == "single_file" {
        fs::write(destination.join("ticknest-export.md"), combined).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn quick_note(state: tauri::State<AppState>) -> Result<Note, String> {
    create_note(
        state,
        NewNote {
            parent_id: None,
            title: format!("Quick Note {}", Utc::now().format("%Y-%m-%d %H:%M")),
            content: String::new(),
            is_markdown: true,
            pinned: false,
            color: Some("#fff9c4".to_string()),
            text_color: Some("#2f2a19".to_string()),
            note_opacity: Some(1.0),
            font_family: Some("Marker Felt".to_string()),
            font_size: Some(16.0),
            shadow_level: Some(0.35),
            tilt_deg: Some(0.0),
            pos_x: None,
            pos_y: None,
        },
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let initial_path = db_path(app.handle())?;
            let conn = Connection::open(&initial_path).map_err(|e| e.to_string())?;
            init_db(&conn)?;

            app.manage(AppState {
                conn: Mutex::new(conn),
                current_db_path: Mutex::new(initial_path),
            });

            let quick = MenuItem::with_id(app, "quick_note", "Quick Note", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let show = MenuItem::with_id(app, "show_ticknest", "Show TickNest", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let quit = MenuItem::with_id(app, "quit_ticknest", "Quit", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let menu = Menu::with_items(app, &[&quick, &show, &quit]).map_err(|e| e.to_string())?;

            let app_settings =
                MenuItem::with_id(app, "app_settings", "Settings", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
            let app_new = MenuItem::with_id(app, "app_new_note", "New Note", true, Some("CmdOrCtrl+N"))
                .map_err(|e| e.to_string())?;
            let app_next =
                MenuItem::with_id(app, "app_next_note", "Next Note", true, Some("CmdOrCtrl+]"))
                    .map_err(|e| e.to_string())?;
            let app_prev =
                MenuItem::with_id(app, "app_prev_note", "Previous Note", true, Some("CmdOrCtrl+["))
                    .map_err(|e| e.to_string())?;
            let app_help = MenuItem::with_id(app, "app_help", "Help", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let app_submenu =
                Submenu::with_items(
                    app,
                    "TickNest",
                    true,
                    &[&app_new, &app_prev, &app_next, &app_settings, &app_help],
                )
                    .map_err(|e| e.to_string())?;
            let help_submenu =
                Submenu::with_items(app, "Help", true, &[&app_help]).map_err(|e| e.to_string())?;
            let app_menu =
                Menu::with_items(app, &[&app_submenu, &help_submenu]).map_err(|e| e.to_string())?;
            app.set_menu(app_menu).map_err(|e| e.to_string())?;

            let app_handle = app.handle().clone();
            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |tray, event| {
                    let id = event.id.as_ref();
                    if id == "quick_note" {
                        let _ = quick_note(app_handle.state::<AppState>());
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.emit("quick-note-created", true);
                        }
                    } else if id == "show_ticknest" {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if id == "quit_ticknest" {
                        tray.app_handle().exit(0);
                    }
                })
                .build(app)
                .map_err(|e| e.to_string())?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            if id == "app_settings" {
                let _ = app.emit("menu-open-settings", true);
            } else if id == "app_help" {
                let _ = app.emit("menu-open-help", true);
            } else if id == "app_new_note" {
                let _ = app.emit("menu-new-note", true);
            } else if id == "app_next_note" {
                let _ = app.emit("menu-next-note", true);
            } else if id == "app_prev_note" {
                let _ = app.emit("menu-prev-note", true);
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_note,
            update_note,
            delete_note,
            list_notes,
            search_notes,
            get_settings,
            update_settings,
            set_storage_mode,
            export_notes,
            quick_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
