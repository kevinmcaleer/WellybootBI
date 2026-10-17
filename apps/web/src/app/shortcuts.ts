// The one list of keyboard shortcuts. The shortcuts dialog, tooltips and the key handler all read it, so what the
// dialog shows is exactly what the keys do. "Mod" is Cmd on macOS and Ctrl elsewhere. After Puddle's
// src/app/shortcuts.ts; the list grows as the editor does.

export interface KeyCombo {
  /** KeyboardEvent.key, compared without case for letters (e.g. "t", "ArrowLeft", "?", "/"). */
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** For a symbol such as "?", which needs Shift on some keyboards and not others. */
  anyShift?: boolean;
}

export type ShortcutArea = 'General';

export const SHORTCUT_AREAS: ShortcutArea[] = ['General'];

export interface Shortcut {
  id: ShortcutId;
  area: ShortcutArea;
  label: string;
  keys: KeyCombo[];
}

const k = (key: string, mods: Omit<KeyCombo, 'key'> = {}): KeyCombo => ({ key, ...mods });

export const SHORTCUTS = [
  { id: 'help', area: 'General', label: 'Show keyboard shortcuts', keys: [k('?', { anyShift: true })] },
  { id: 'theme', area: 'General', label: 'Switch theme: system, light, dark', keys: [k('t', { shift: true })] },
  { id: 'home', area: 'General', label: 'Go to all dashboards', keys: [k('h', { shift: true })] },
] as const satisfies ReadonlyArray<Omit<Shortcut, 'id'> & { id: string }>;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export const shortcut = (id: ShortcutId): Shortcut => SHORTCUTS.find((s) => s.id === id)! as Shortcut;

export const isMac = (platform: string = typeof navigator === 'undefined' ? '' : navigator.platform) => /Mac|iPhone|iPad|iPod/.test(platform);

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Does this key press match the combo? Mod is Cmd on macOS and Ctrl elsewhere; the other one must be up. */
export function matches(e: KeyLike, combo: KeyCombo, mac: boolean): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key !== combo.key) return false;
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  if (mod !== !!combo.mod || other) return false;
  if (e.altKey !== !!combo.alt) return false;
  return combo.anyShift || e.shiftKey === !!combo.shift;
}

/** The shortcut a key press means, if any. */
export function shortcutFor(e: KeyLike, mac: boolean): Shortcut | undefined {
  return (SHORTCUTS as readonly Shortcut[]).find((s) => s.keys.some((c) => matches(e, c, mac)));
}

const KEY_NAME: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'Delete', Backspace: 'Backspace', Enter: 'Enter', Escape: 'Esc' };

/** The keys of one combo, each as it is printed on the keyboard: ["Ctrl", "Shift", "Z"] or ["⌘", "⇧", "Z"]. */
export function comboKeys(combo: KeyCombo, mac: boolean): string[] {
  const keys: string[] = [];
  if (combo.mod) keys.push(mac ? '⌘' : 'Ctrl');
  if (combo.alt) keys.push(mac ? '⌥' : 'Alt');
  if (combo.shift) keys.push(mac ? '⇧' : 'Shift');
  keys.push(KEY_NAME[combo.key] ?? combo.key.toUpperCase());
  return keys;
}

/** A combo as text: "Ctrl+Shift+Z" or "⌘⇧Z". */
export const formatCombo = (combo: KeyCombo, mac: boolean) => comboKeys(combo, mac).join(mac ? '' : '+');

/** A shortcut's first combo as text, for a tooltip or a menu hint. */
export const shortcutText = (id: ShortcutId, mac = isMac()) => formatCombo(shortcut(id).keys[0]!, mac);
