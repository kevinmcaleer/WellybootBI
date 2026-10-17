import { useEffect, useRef } from 'react';
import { isMac, shortcutFor, type ShortcutId } from './shortcuts';

/** A text field, select or editable element: keys typed there are text, never shortcuts. */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('[contenteditable=""], [contenteditable="true"]'));

/**
 * Run the registry's shortcuts, anywhere outside a text field and while no dialog is open, once per key press.
 * After Puddle's src/app/useShortcuts.ts.
 */
export function useShortcuts(actions: Record<ShortcutId, () => void>) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  useEffect(() => {
    const mac = isMac();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat || document.querySelector('dialog[open]') || isTyping(e.target)) return;
      const s = shortcutFor(e, mac);
      if (!s) return;
      latest.current[s.id]();
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
