import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

type Note = {
  id: number;
  parent_id: number | null;
  title: string;
  content: string;
  is_markdown: boolean;
  pinned: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type Settings = {
  storage_mode: string;
  custom_vault_path?: string;
  export_include_metadata: boolean;
  markdown_preview_default: boolean;
};

const defaultNewNote = {
  title: '',
  content: '',
  parent_id: null as number | null,
  is_markdown: true,
  pinned: false,
  color: '#fff9c4',
};

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    storage_mode: 'sandbox',
    export_include_metadata: true,
    markdown_preview_default: true,
  });
  const [newNote, setNewNote] = useState(defaultNewNote);
  const [showExport, setShowExport] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<number[]>([]);
  const [exportMode, setExportMode] = useState<'folder' | 'single_file'>('folder');
  const [exportPath, setExportPath] = useState('');
  const [status, setStatus] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  const rootNotes = useMemo(() => notes.filter((n) => n.parent_id == null), [notes]);
  const childrenByParent = useMemo(() => {
    const map = new Map<number, Note[]>();
    notes
      .filter((n) => n.parent_id != null)
      .forEach((n) => {
        const parentId = n.parent_id as number;
        const group = map.get(parentId) ?? [];
        group.push(n);
        map.set(parentId, group);
      });
    return map;
  }, [notes]);

  async function refreshNotes(search = query) {
    const rows = search.trim()
      ? await invoke<Note[]>('search_notes', { query: search })
      : await invoke<Note[]>('list_notes');
    setNotes(rows);
    if (rows.length > 0 && !rows.some((n) => n.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
    if (rows.length === 0) setSelectedId(null);
  }

  async function loadSettings() {
    const s = await invoke<Settings>('get_settings');
    setSettings(s);
    setIsPreview(!s.markdown_preview_default);
  }

  useEffect(() => {
    void refreshNotes();
    void loadSettings();
  }, []);

  useEffect(() => {
    setDraftContent(selectedNote?.content ?? '');
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!selectedNote) return;
    const timer = setTimeout(() => {
      if (draftContent !== selectedNote.content) {
        void saveSelected({ content: draftContent });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [draftContent, selectedNote?.id]);

  async function createNote() {
    if (!newNote.title.trim()) return;
    await invoke('create_note', { payload: newNote });
    setNewNote(defaultNewNote);
    await refreshNotes();
  }

  async function saveSelected(partial: Partial<Note>) {
    if (!selectedNote) return;
    const payload = {
      id: selectedNote.id,
      parent_id: partial.parent_id ?? selectedNote.parent_id,
      title: partial.title ?? selectedNote.title,
      content: partial.content ?? selectedNote.content,
      is_markdown: partial.is_markdown ?? selectedNote.is_markdown,
      pinned: partial.pinned ?? selectedNote.pinned,
      color: partial.color ?? selectedNote.color,
    };
    await invoke('update_note', { payload });
    await refreshNotes();
  }

  async function deleteSelected() {
    if (!selectedNote) return;
    await invoke('delete_note', { id: selectedNote.id });
    await refreshNotes();
  }

  async function applyStorageMode() {
    await invoke('set_storage_mode', {
      mode: settings.storage_mode,
      customVaultPath: settings.custom_vault_path ?? null,
    });
    await invoke('update_settings', { settings });
    setStatus('Storage settings saved.');
  }

  async function doExport() {
    await invoke('export_notes', {
      selection: { note_ids: selectedExportIds },
      mode: exportMode,
      destinationPath: exportPath,
      options: { include_metadata: settings.export_include_metadata },
    });
    setShowExport(false);
    setStatus('Export completed.');
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <h1>TickNest</h1>
        <input
          className="input"
          placeholder="Search notes"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            void refreshNotes(value);
          }}
        />

        <div className="new-note">
          <input
            className="input"
            placeholder="New note title"
            value={newNote.title}
            onChange={(e) => setNewNote((p) => ({ ...p, title: e.target.value }))}
          />
          <textarea
            className="input"
            placeholder="Quick content"
            value={newNote.content}
            onChange={(e) => setNewNote((p) => ({ ...p, content: e.target.value }))}
          />
          <select
            className="input"
            value={newNote.parent_id ?? ''}
            onChange={(e) =>
              setNewNote((p) => ({
                ...p,
                parent_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
          >
            <option value="">Main note</option>
            {rootNotes.map((n) => (
              <option key={n.id} value={n.id}>
                Child of: {n.title}
              </option>
            ))}
          </select>
          <button onClick={() => void createNote()}>Create</button>
        </div>

        <div className="note-list">
          {rootNotes.map((note) => (
            <div key={note.id}>
              <button
                className={`note-item ${selectedId === note.id ? 'active' : ''}`}
                style={{ borderLeftColor: note.color ?? '#ddd' }}
                onClick={() => setSelectedId(note.id)}
              >
                {note.pinned ? '📌 ' : ''}
                {note.title}
              </button>
              {(childrenByParent.get(note.id) ?? []).map((child) => (
                <button
                  key={child.id}
                  className={`note-item child ${selectedId === child.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(child.id)}
                >
                  ↳ {child.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section className="content">
        <div className="toolbar">
          <button onClick={() => setShowExport(true)}>Export</button>
          <button onClick={() => setIsPreview((p) => !p)}>
            {isPreview ? 'Edit' : 'Preview'}
          </button>
          <button onClick={() => void deleteSelected()}>Delete</button>
          <span>{status}</span>
        </div>

        {selectedNote ? (
          <>
            <input
              className="title"
              value={selectedNote.title}
              onChange={(e) => void saveSelected({ title: e.target.value })}
            />
            <div className="row">
              <label>
                <input
                  type="checkbox"
                  checked={selectedNote.pinned}
                  onChange={(e) => void saveSelected({ pinned: e.target.checked })}
                />
                Pinned
              </label>
              <input
                type="color"
                value={selectedNote.color ?? '#ffffff'}
                onChange={(e) => void saveSelected({ color: e.target.value })}
              />
            </div>
            {isPreview ? (
              <pre className="preview">{draftContent}</pre>
            ) : (
              <textarea
                className="editor"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
              />
            )}
          </>
        ) : (
          <p>No note selected.</p>
        )}

        <details className="settings">
          <summary>Settings</summary>
          <label>
            Storage Mode
            <select
              className="input"
              value={settings.storage_mode}
              onChange={(e) => setSettings((s) => ({ ...s, storage_mode: e.target.value }))}
            >
              <option value="sandbox">App sandbox</option>
              <option value="custom_vault">Custom vault folder</option>
            </select>
          </label>
          {settings.storage_mode === 'custom_vault' && (
            <label>
              Custom vault path
              <input
                className="input"
                value={settings.custom_vault_path ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, custom_vault_path: e.target.value }))
                }
                placeholder="/Users/you/Documents/TickNestVault"
              />
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={settings.export_include_metadata}
              onChange={(e) =>
                setSettings((s) => ({ ...s, export_include_metadata: e.target.checked }))
              }
            />
            Include metadata in export
          </label>
          <button onClick={() => void applyStorageMode()}>Save Settings</button>
        </details>
      </section>

      {showExport && (
        <div className="modal">
          <div className="modal-body">
            <h3>Export Notes</h3>
            <p>Select main and child notes:</p>
            {rootNotes.map((root) => (
              <div key={root.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedExportIds.includes(root.id)}
                    onChange={(e) => {
                      setSelectedExportIds((ids) =>
                        e.target.checked ? [...ids, root.id] : ids.filter((id) => id !== root.id),
                      );
                    }}
                  />
                  {root.title}
                </label>
                {(childrenByParent.get(root.id) ?? []).map((child) => (
                  <label key={child.id} className="child-check">
                    <input
                      type="checkbox"
                      checked={selectedExportIds.includes(child.id)}
                      onChange={(e) => {
                        setSelectedExportIds((ids) =>
                          e.target.checked
                            ? [...ids, child.id]
                            : ids.filter((id) => id !== child.id),
                        );
                      }}
                    />
                    ↳ {child.title}
                  </label>
                ))}
              </div>
            ))}
            <label>
              Export mode
              <select
                className="input"
                value={exportMode}
                onChange={(e) => setExportMode(e.target.value as 'folder' | 'single_file')}
              >
                <option value="folder">One .md per note</option>
                <option value="single_file">Single combined .md</option>
              </select>
            </label>
            <label>
              Destination path
              <input
                className="input"
                value={exportPath}
                onChange={(e) => setExportPath(e.target.value)}
                placeholder="/Users/you/Desktop/TickNestExport"
              />
            </label>
            <div className="row">
              <button onClick={() => void doExport()}>Export</button>
              <button onClick={() => setShowExport(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
