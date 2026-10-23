// The visual being edited, after Puddle's src/model/store.ts: every change is a new immutable snapshot in the
// history, so undo and redo cover wells, filters and formatting alike. Typing in a text field (a title, a filter's
// value) is one step, not one per key: edits with the same coalescing key, close together, replace each other.
import type { ColumnSchema, Visual } from '@wellyboot/shared';
import { create } from 'zustand';
import type { EditResult } from '../visuals/encode';
import { canRedo, canUndo, HISTORY_LIMIT, initHistory, pushHistory, redo, undo, type History } from './history';

/** How close together typing edits must be to make one undo step. */
export const COALESCE_MS = 1000;

/** Something to tell the author about the last edit: why it was refused, or what a chart type switch dropped. */
export interface EditNote {
  tone: 'info' | 'fail';
  text: string;
}

interface VisualState {
  history: History<Visual> | null;
  /** The visual's dataset's fields. */
  schema: ColumnSchema[];
  note: EditNote | null;
  /** The last typing edit, to coalesce the next one with. */
  typing: { key: string; at: number } | null;
  limit: number;
  /** Start editing a visual, with a fresh history. */
  open: (visual: Visual, schema: ColumnSchema[]) => void;
  close: () => void;
  /** Change the visual. With `coalesce`, edits of the same key close together are one undo step. */
  edit: (change: (v: Visual) => Visual, opts?: { coalesce?: string }) => void;
  /** Apply an edit from encode.ts: the new visual, or its refusal shown as a note. True when it was applied. */
  apply: (result: EditResult) => boolean;
  setNote: (note: EditNote | null) => void;
  undo: () => void;
  redo: () => void;
}

export const useVisualStore = create<VisualState>((set, get) => ({
  history: null,
  schema: [],
  note: null,
  typing: null,
  limit: HISTORY_LIMIT,
  open: (visual, schema) => set({ history: initHistory(visual), schema, note: null, typing: null }),
  close: () => set({ history: null, schema: [], note: null, typing: null }),
  edit: (change, opts = {}) => {
    const { history: h, typing, limit } = get();
    if (!h) return;
    const next = change(h.present);
    if (next === h.present) return;
    const now = Date.now();
    const same = opts.coalesce != null && typing?.key === opts.coalesce && now - typing.at < COALESCE_MS;
    set({
      history: same ? { ...h, present: next, future: [] } : pushHistory(h, next, limit),
      typing: opts.coalesce != null ? { key: opts.coalesce, at: now } : null,
      note: null,
    });
  },
  apply: (result) => {
    if (result.error != null) {
      set({ note: { tone: 'fail', text: result.error } });
      return false;
    }
    get().edit(() => result.visual);
    return true;
  },
  setNote: (note) => set({ note }),
  undo: () => {
    const h = get().history;
    if (h && canUndo(h)) set({ history: undo(h), typing: null, note: null });
  },
  redo: () => {
    const h = get().history;
    if (h && canRedo(h)) set({ history: redo(h), typing: null, note: null });
  },
}));

/** The visual being edited, or null. */
export const useVisual = () => useVisualStore((s) => s.history?.present ?? null);
