// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { EngineInfo } from '../engine';
import { AppShell } from './AppShell';
import { useEngineStore } from './engine';
import { useSession } from './session';
import { SHORTCUTS } from './shortcuts';
import { useTheme } from './theme';
import { useLiveRun } from '../visuals/live';

beforeAll(() => {
  // jsdom has <dialog> but not its modal methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  useSession.setState({ route: { screen: 'home' }, shortcutsOpen: false });
  useEngineStore.setState({ status: { state: 'loading' }, engine: null });
  useTheme.getState().setPreference('system');
  useLiveRun.setState({ running: false, run: undefined });
  location.hash = '';
});

const key = (init: KeyboardEventInit) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })));

describe('the app shell', () => {
  it('shows the chart’s rows and how long they took in the status strip, in the editor only', () => {
    useLiveRun.setState({ running: false, run: { sql: '', columns: [{}, {}] as never, rows: [{}, {}, {}, {}], truncated: false, rowLimit: 10_000, elapsedMs: 12 } });
    render(<AppShell />);
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('4 rows'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'New dashboard' }));
    const strip = screen.getAllByRole('status').find((s) => s.textContent?.includes('4 rows'));
    expect(strip).toHaveTextContent('2 cols');
  });

  it('opens on the home screen, with an empty list of dashboards', () => {
    render(<AppShell />);
    expect(screen.getByRole('heading', { name: 'Dashboards' })).toBeInTheDocument();
    expect(screen.getByTestId('home-empty')).toHaveTextContent('No dashboards yet');
  });

  it('goes to the editor and back, keeping the browser history in step', () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole('button', { name: 'New dashboard' }));
    expect(screen.getByTestId('editor')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(location.hash).toBe('#/editor');
    fireEvent.click(screen.getByRole('button', { name: 'All dashboards' }));
    expect(screen.getByTestId('home')).toBeInTheDocument();
    expect(location.hash).toBe('#/');
  });

  it('shows the engine starting, ready or failed in the status strip', () => {
    render(<AppShell />);
    expect(screen.getByText('Starting engine')).toBeInTheDocument();
    const info: EngineInfo = { bundle: 'eh', version: 'v1.5.4', spill: false, crossOriginIsolated: true };
    act(() => useEngineStore.setState({ status: { state: 'ready', info } }));
    expect(screen.getByTestId('engine-ready')).toHaveTextContent('Engine ready · DuckDB v1.5.4');
    act(() => useEngineStore.setState({ status: { state: 'failed', message: 'No WebAssembly' } }));
    expect(screen.getByText("Engine didn't start")).toHaveAttribute('title', 'No WebAssembly');
  });

  it('switches theme from the toolbar and with Shift+T', () => {
    render(<AppShell />);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    key({ key: 'T', shiftKey: true });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('lists every shortcut in the dialog ? opens', () => {
    render(<AppShell />);
    key({ key: '?' });
    const listed = [...screen.getByTestId('shortcuts-list').querySelectorAll('[data-shortcut]')].map((el) => el.getAttribute('data-shortcut'));
    expect(listed).toEqual(SHORTCUTS.map((s) => s.id));
  });

  it('leaves keys typed in a field alone', () => {
    render(<AppShell />);
    const input = document.body.appendChild(document.createElement('input'));
    act(() => void input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })));
    expect(screen.queryByTestId('shortcuts-list')).toBeNull();
    input.remove();
  });
});
