import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './App.css';

type Note = {
  id: number;
  parent_id: number | null;
  title: string;
  content: string;
  is_markdown: boolean;
  pinned: boolean;
  color: string | null;
  text_color: string | null;
  note_opacity: number | null;
  font_family: string | null;
  font_size: number | null;
  shadow_level: number | null;
  tilt_deg: number | null;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
  updated_at: string;
};

const DEFAULTS = {
  color: '#fff7b8',
  text_color: '#1d1d1f',
  note_opacity: 0.98,
  font_family: 'SF Pro Text',
  font_size: 16,
  shadow_level: 0.22,
  tilt_deg: 0,
};

const FONT_OPTIONS = ['SF Pro Text', 'Avenir Next', 'Menlo', 'Noteworthy'];

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  async function refreshNotes() {
    const rows = await invoke<Note[]>('list_notes');
    const roots = rows.filter((n) => n.parent_id == null);
    setNotes(roots);
    if (!activeId && roots.length > 0) setActiveId(roots[0].id);
    if (activeId && !roots.some((n) => n.id === activeId)) setActiveId(roots[0]?.id ?? null);
  }

  async function createNote() {
    const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const created = await invoke<Note>('create_note', {
      payload: {
        parent_id: null,
        title: `New Note ${label}`,
        content: '',
        is_markdown: true,
        pinned: false,
        color: DEFAULTS.color,
        text_color: DEFAULTS.text_color,
        note_opacity: DEFAULTS.note_opacity,
        font_family: DEFAULTS.font_family,
        font_size: DEFAULTS.font_size,
        shadow_level: DEFAULTS.shadow_level,
        tilt_deg: DEFAULTS.tilt_deg,
        pos_x: null,
        pos_y: null,
      },
    });
    setNotes((prev) => [created, ...prev]);
    setActiveId(created.id);
    setStatus('New note created');
  }

  async function persist(note: Note, patch: Partial<Note>) {
    const updated = await invoke<Note>('update_note', {
      payload: {
        id: note.id,
        parent_id: null,
        title: patch.title ?? note.title,
        content: patch.content ?? note.content,
        is_markdown: true,
        pinned: note.pinned,
        color: patch.color ?? note.color ?? DEFAULTS.color,
        text_color: patch.text_color ?? note.text_color ?? DEFAULTS.text_color,
        note_opacity: patch.note_opacity ?? note.note_opacity ?? DEFAULTS.note_opacity,
        font_family: patch.font_family ?? note.font_family ?? DEFAULTS.font_family,
        font_size: patch.font_size ?? note.font_size ?? DEFAULTS.font_size,
        shadow_level: patch.shadow_level ?? note.shadow_level ?? DEFAULTS.shadow_level,
        tilt_deg: patch.tilt_deg ?? note.tilt_deg ?? DEFAULTS.tilt_deg,
        pos_x: note.pos_x,
        pos_y: note.pos_y,
      },
    });

    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setStatus('Saved');
  }

  function goPrevNote() {
    if (!activeNote || notes.length < 2) return;
    const idx = notes.findIndex((n) => n.id === activeNote.id);
    const nextIdx = idx <= 0 ? notes.length - 1 : idx - 1;
    setActiveId(notes[nextIdx].id);
  }

  function goNextNote() {
    if (!activeNote || notes.length < 2) return;
    const idx = notes.findIndex((n) => n.id === activeNote.id);
    const nextIdx = idx >= notes.length - 1 ? 0 : idx + 1;
    setActiveId(notes[nextIdx].id);
  }

  useEffect(() => {
    void refreshNotes().then(async () => {
      const existing = await invoke<Note[]>('list_notes');
      if (existing.filter((n) => n.parent_id == null).length === 0) await createNote();
    });

    let unlistenSettings: (() => void) | undefined;
    let unlistenHelp: (() => void) | undefined;
    let unlistenNew: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;

    void listen('menu-open-settings', () => setShowSettings((v) => !v)).then((f) => {
      unlistenSettings = f;
    });
    void listen('menu-open-help', () => setStatus('Help: Cmd+N new note. All notes stay visible side-by-side.')).then((f) => {
      unlistenHelp = f;
    });
    void listen('menu-new-note', () => {
      void createNote();
    }).then((f) => {
      unlistenNew = f;
    });
    void listen('menu-next-note', () => goNextNote()).then((f) => {
      unlistenNext = f;
    });
    void listen('menu-prev-note', () => goPrevNote()).then((f) => {
      unlistenPrev = f;
    });

    return () => {
      if (unlistenSettings) unlistenSettings();
      if (unlistenHelp) unlistenHelp();
      if (unlistenNew) unlistenNew();
      if (unlistenNext) unlistenNext();
      if (unlistenPrev) unlistenPrev();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void createNote();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [notes.length]);

  const bgColor = activeNote?.color ?? DEFAULTS.color;
  const textColor = activeNote?.text_color ?? DEFAULTS.text_color;
  const fontFamily = activeNote?.font_family ?? DEFAULTS.font_family;
  const fontSize = activeNote?.font_size ?? DEFAULTS.font_size;

  return (
    <main className="sticky-window">
      <header className="mac-menubar" data-tauri-drag-region>
        <div className="menu-left">
          <span className="menu-title">Sticky Notes</span>
        </div>
        <div className="menu-right">
          <span className="note-count">{notes.length} notes</span>
        </div>
      </header>

      {showSettings && activeNote && (
        <section className="settings-bar">
          <input type="color" value={bgColor} onChange={(e) => void persist(activeNote, { color: e.target.value })} title="Note color" />
          <input type="color" value={textColor} onChange={(e) => void persist(activeNote, { text_color: e.target.value })} title="Text color" />
          <select className="menu-select" value={fontFamily} onChange={(e) => void persist(activeNote, { font_family: e.target.value })}>
            {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <input className="small-range" type="range" min="13" max="26" step="1" value={fontSize} onChange={(e) => void persist(activeNote, { font_size: Number(e.target.value) })} title="Font size" />
        </section>
      )}

      <section className="notes-row">
        {notes.map((note) => {
          const noteBg = note.color ?? DEFAULTS.color;
          const noteText = note.text_color ?? DEFAULTS.text_color;
          const noteFont = note.font_family ?? DEFAULTS.font_family;
          const noteSize = note.font_size ?? DEFAULTS.font_size;
          const noteOpacity = note.note_opacity ?? DEFAULTS.note_opacity;
          const noteShadow = note.shadow_level ?? DEFAULTS.shadow_level;

          return (
            <article
              key={note.id}
              className={`note-card ${note.id === activeId ? 'active' : ''}`}
              style={{
                background: noteBg,
                color: noteText,
                opacity: noteOpacity,
                boxShadow: `0 12px 26px rgba(0,0,0,${noteShadow})`,
              }}
              onClick={() => setActiveId(note.id)}
            >
              <input
                className="note-title"
                value={note.title}
                onChange={(e) => void persist(note, { title: e.target.value })}
                placeholder="Title"
              />
              <textarea
                className="sticky-body"
                style={{ color: noteText, fontFamily: noteFont, fontSize: `${noteSize}px` }}
                value={note.content}
                onChange={(e) => void persist(note, { content: e.target.value })}
                placeholder="Start typing full note..."
              />
            </article>
          );
        })}
      </section>

      <footer className="sticky-status">{status}</footer>
    </main>
  );
}

export default App;
