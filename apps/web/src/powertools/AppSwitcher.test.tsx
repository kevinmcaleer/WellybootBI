// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSwitcher } from './AppSwitcher';
import { BUNDLED_APPS, HOME_URL } from './apps';

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Switch app' }));

describe('AppSwitcher', () => {
  afterEach(cleanup);

  it('lists the apps with Wellyboot BI ticked, and goes to another one', () => {
    const navigate = vi.fn();
    render(<AppSwitcher load={async () => BUNDLED_APPS} navigate={navigate} />);
    open();
    expect(screen.getByRole('menuitemradio', { name: /Wellyboot BI/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Puddle/ }));
    expect(navigate).toHaveBeenCalledWith('https://puddle.kevspowertools.com/');
  });

  it('stays put when Wellyboot BI is chosen, even while the list marks it coming soon', () => {
    const navigate = vi.fn();
    render(<AppSwitcher load={async () => BUNDLED_APPS} navigate={navigate} />);
    open();
    const current = screen.getByRole('menuitemradio', { name: /Wellyboot BI/ });
    expect(current).toBeEnabled();
    expect(current).not.toHaveTextContent('Coming soon');
    fireEvent.click(current);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cannot go to another app that is coming soon', async () => {
    const apps = BUNDLED_APPS.map((a) => (a.id === 'mermaid-factory' ? { ...a, status: 'soon' as const } : a));
    render(<AppSwitcher load={async () => apps} navigate={vi.fn()} />);
    await act(async () => open());
    const soon = screen.getByRole('menuitemradio', { name: /Mermaid Factory/ });
    expect(soon).toBeDisabled();
    expect(soon).toHaveTextContent('Coming soon');
  });

  it('goes to the landing page from All tools', () => {
    const navigate = vi.fn();
    render(<AppSwitcher load={async () => BUNDLED_APPS} navigate={navigate} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /All tools/ }));
    expect(navigate).toHaveBeenCalledWith(HOME_URL);
  });

  it('reads the shared list only once opened, then shows it', async () => {
    const load = vi.fn(async () => [{ id: 'new', name: 'New tool', url: 'https://new.kevspowertools.com/', status: 'live' as const }]);
    render(<AppSwitcher load={load} navigate={vi.fn()} />);
    expect(load).not.toHaveBeenCalled();
    await act(async () => open());
    expect(load).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitemradio', { name: /New tool/ })).toBeTruthy();
  });
});
