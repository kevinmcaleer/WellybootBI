import { describe, expect, it } from 'vitest';
import { comboKeys, matches, shortcutFor, shortcutText, SHORTCUTS } from './shortcuts';

const press = (key: string, mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('shortcuts', () => {
  it('gives every shortcut its own id', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });

  it('finds ? with or without Shift, and Shift+T for the theme', () => {
    expect(shortcutFor(press('?'), false)?.id).toBe('help');
    expect(shortcutFor(press('?', { shiftKey: true }), false)?.id).toBe('help');
    expect(shortcutFor(press('T', { shiftKey: true }), false)?.id).toBe('theme');
    expect(shortcutFor(press('t'), false)).toBeUndefined();
  });

  it('undoes with Mod+Z and redoes with Mod+Shift+Z or Mod+Y', () => {
    expect(shortcutFor(press('z', { ctrlKey: true }), false)?.id).toBe('undo');
    expect(shortcutFor(press('Z', { ctrlKey: true, shiftKey: true }), false)?.id).toBe('redo');
    expect(shortcutFor(press('y', { metaKey: true }), true)?.id).toBe('redo');
  });

  it('treats Cmd as Mod on a Mac and Ctrl elsewhere', () => {
    const combo = { key: 'z', mod: true };
    expect(matches(press('z', { metaKey: true }), combo, true)).toBe(true);
    expect(matches(press('z', { ctrlKey: true }), combo, true)).toBe(false);
    expect(matches(press('z', { ctrlKey: true }), combo, false)).toBe(true);
  });

  it('prints keys as they are on the keyboard', () => {
    expect(comboKeys({ key: 'z', mod: true, shift: true }, false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(comboKeys({ key: 'z', mod: true, shift: true }, true)).toEqual(['⌘', '⇧', 'Z']);
    expect(shortcutText('theme', false)).toBe('Shift+T');
  });
});
