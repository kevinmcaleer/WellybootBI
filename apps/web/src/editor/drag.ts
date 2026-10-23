// Dragging fields into wells, as Puddle's pivot editor does: native drag events carrying what is dragged as JSON.
import type { DragEvent } from 'react';
import type { WellId } from '../compiler/chart';
import type { FieldRef } from '../visuals/encode';

export const DRAG_TYPE = 'application/x-wellyboot-field';

/** What is dragged: a field from the field list, or one already in a well (with where it is). */
export interface Dragged {
  field: FieldRef;
  from?: { well: WellId | 'filters'; position: number };
}

export const startDrag = (what: Dragged) => (e: DragEvent) => {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(what));
  e.dataTransfer.effectAllowed = 'move';
};

/** What a drop carries, or null for anything else (a file, some text). */
export function dropped(e: DragEvent): Dragged | null {
  try {
    const v = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Dragged;
    return v && (typeof v.field === 'string' || v.field === null) ? v : null;
  } catch {
    return null;
  }
}

/** Whether a drag over a well carries a field (the data can't be read until the drop). */
export const carriesField = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);
