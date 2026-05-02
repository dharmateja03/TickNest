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

type ShortcutConfig = {
  newNote: string;
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
const SHORTCUTS_KEY = 'ticknest.shortcuts.v1';
const DEFAULT_SHORTCUTS: ShortcutConfig = { newNote: 'Meta+N' };

function parseShortcut(value: string): string[] {
  return value.split('+').map((p) => p.trim().toLowerCase()).filter(Boolean);
}

function eventMatchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = parseShortcut(shortcut);
  const wantsMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
  const wantsCtrl = parts.includes('ctrl') || parts.includes('control');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt') || parts.includes('option');
  if (e.metaKey !== wantsMeta || e.ctrlKey !== wantsCtrl || e.shiftKey !== wantsShift || e.altKey !== wantsAlt) return false;
  const keyPart = parts.find((p) => !['meta', 'cmd', 'command', 'ctrl', 'control', 'shift', 'alt', 'option'].includes(p));
  return !!keyPart && e.key.toLowerCase() === keyPart;
}

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  async function refreshNotes() {
    const rows = await invoke<Note[]>('list_notes');
    const roots = rows.filter((n) => n.parent_id == null);
    setNotes(roots);
    if (!activeId && roots.length > 0) setActiveId(roots[0].id);
    if (activeId && !roots.some((n) => n.id === activeId)) setActiveId(roots[0]?.id ?? null);
  }

  async function createNote() {
    const created = await invoke<Note>('create_note', {
      payload: {
        parent_id: null,
        title: `Note ${notes.length + 1}`,
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
    setTitle(created.title);
    setContent(created.content);
    setStatus('New note created');
  }

  async function deleteActiveNote() {
    if (!activeNote) return;
    await invoke('delete_note', { id: activeNote.id });
    const remaining = notes.filter((n) => n.id !== activeNote.id);
    setNotes(remaining);
    if (remaining.length === 0) {
      setActiveId(null);
      setTitle('');
      setContent('');
      setStatus('Note deleted');
      await createNote();
      return;
    }
    const next = remaining[0];
    setActiveId(next.id);
    setTitle(next.title);
    setContent(next.content);
    setStatus('Note deleted');
  }

  async function persist(next: Partial<Note>, nextTitle = title, nextContent = content) {
    if (!activeNote) return;
    const updated = await invoke<Note>('update_note', {
      payload: {
        id: activeNote.id,
        parent_id: null,
        title: nextTitle,
        content: nextContent,
        is_markdown: true,
        pinned: activeNote.pinned,
        color: next.color ?? activeNote.color ?? DEFAULTS.color,
        text_color: next.text_color ?? activeNote.text_color ?? DEFAULTS.text_color,
        note_opacity: next.note_opacity ?? activeNote.note_opacity ?? DEFAULTS.note_opacity,
        font_family: next.font_family ?? activeNote.font_family ?? DEFAULTS.font_family,
        font_size: next.font_size ?? activeNote.font_size ?? DEFAULTS.font_size,
        shadow_level: next.shadow_level ?? activeNote.shadow_level ?? DEFAULTS.shadow_level,
        tilt_deg: next.tilt_deg ?? activeNote.tilt_deg ?? DEFAULTS.tilt_deg,
        pos_x: activeNote.pos_x,
        pos_y: activeNote.pos_y,
      },
    });
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setStatus('Saved');
  }

  useEffect(() => {
    void refreshNotes().then(async () => {
      const existing = await invoke<Note[]>('list_notes');
      if (existing.filter((n) => n.parent_id == null).length === 0) await createNote();
    });
    const stored = localStorage.getItem(SHORTCUTS_KEY);
    if (stored) {
      try { setShortcuts({ ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) }); } catch { setShortcuts(DEFAULT_SHORTCUTS); }
    }
  }, []);

  useEffect(() => {
    if (!activeNote) return;
    setTitle(activeNote.title);
    setContent(activeNote.content);
  }, [activeNote?.id]);

  useEffect(() => {
    if (!activeNote) return;
    const timer = setTimeout(() => {
      if (title !== activeNote.title || content !== activeNote.content) void persist({}, title, content);
    }, 220);
    return () => clearTimeout(timer);
  }, [title, content, activeNote?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (eventMatchesShortcut(e, shortcuts.newNote)) {
        e.preventDefault();
        void createNote();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts, notes.length]);

  function updateShortcut(value: string) {
    const next = { newNote: value };
    setShortcuts(next);
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(next));
    setStatus('Shortcut updated');
  }

  const bgColor = activeNote?.color ?? DEFAULTS.color;
  const textColor = activeNote?.text_color ?? DEFAULTS.text_color;
  const opacity = activeNote?.note_opacity ?? DEFAULTS.note_opacity;
  const fontFamily = activeNote?.font_family ?? DEFAULTS.font_family;
  const fontSize = activeNote?.font_size ?? DEFAULTS.font_size;
  const shadowLevel = activeNote?.shadow_level ?? DEFAULTS.shadow_level;

  return (
    <main className="sticky-window" style={{ background: bgColor, color: textColor, opacity, boxShadow: `0 18px 40px rgba(0,0,0,${shadowLevel})` }}>
      <header className="mac-menubar" data-tauri-drag-region>
        <div className="menu-left">
          <button className="menu-btn" onClick={() => void createNote()} title={shortcuts.newNote}>New</button>
          <select className="menu-select" value={activeId ?? ''} onChange={(e) => setActiveId(Number(e.target.value))}>
            {notes.map((n) => <option key={n.id} value={n.id}>{n.title || `Note ${n.id}`}</option>)}
          </select>
          <input className="menu-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </div>
        <div className="menu-right">
          <button className="menu-btn danger" onClick={() => void deleteActiveNote()} title="Delete note">
            🗑
          </button>
          <input type="color" value={bgColor} onChange={(e) => void persist({ color: e.target.value })} />
          <input type="color" value={textColor} onChange={(e) => void persist({ text_color: e.target.value })} />
          <select className="menu-select" value={fontFamily} onChange={(e) => void persist({ font_family: e.target.value })}>
            {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <input className="small-range" type="range" min="13" max="26" step="1" value={fontSize} onChange={(e) => void persist({ font_size: Number(e.target.value) })} />
          <input className="shortcut" value={shortcuts.newNote} onChange={(e) => updateShortcut(e.target.value)} title="New note shortcut" />
        </div>
      </header>

      <section className="note-content">
        <textarea className="sticky-body" style={{ color: textColor, fontFamily, fontSize: `${fontSize}px` }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Start typing..." />
      </section>

      <footer className="sticky-status">{status}</footer>
    </main>
  );
}

export default App;
