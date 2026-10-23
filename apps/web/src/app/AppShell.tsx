import { useEffect, type ReactNode } from 'react';
import { EditorScreen } from '../editor/EditorScreen';
import { HomeScreen } from '../home/HomeScreen';
import { useVisualStore } from '../model/visualStore';
import { AppSwitcher } from '../powertools/AppSwitcher';
import { Button, Menu, StatusBadge, StatusStrip, Toolbar } from '../ui';
import { useLiveRun } from '../visuals/live';
import { useEngineStore, type EngineStatus } from './engine';
import { followHash, useSession } from './session';
import { shortcutText } from './shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';
import { THEME_ICON, THEME_LABEL, useTheme } from './theme';
import { useShortcuts } from './useShortcuts';

/** The strip under the editor: the chart's rows and columns and how long DuckDB took, as Puddle's results bar shows. */
function EditorStatus({ screen, end }: { screen: string; end: ReactNode }) {
  const live = useLiveRun((s) => s.run);
  const run = screen === 'editor' ? live : undefined;
  return <StatusStrip rows={run?.rows.length} cols={run?.columns.length} ms={run?.elapsedMs} end={end} />;
}

export function EngineBadge({ status }: { status: EngineStatus }) {
  if (status.state === 'loading') return <StatusBadge status="pending">Starting engine</StatusBadge>;
  if (status.state === 'failed') return <StatusBadge status="fail" title={status.message}>Engine didn't start</StatusBadge>;
  const { bundle, version } = status.info;
  return (
    <span data-testid="engine-ready" data-bundle={bundle} title={`DuckDB ${version}, ${bundle} bundle`}>
      Engine ready · DuckDB {version}
    </span>
  );
}

function HelpMenu() {
  return (
    <Menu
      label={<span className="sr-only">Help</span>}
      button={{ variant: 'ghost', icon: 'help', iconOnly: true, 'aria-label': 'Help', title: 'Help', ...{ 'data-testid': 'help-menu' } }}
      items={[{ label: 'Keyboard shortcuts', icon: 'keyboard', shortcut: shortcutText('help'), onSelect: () => useSession.getState().setShortcutsOpen(true) }]}
    />
  );
}

/**
 * The fixed layout every screen lives in: toolbar on top, the screen in the middle, status strip underneath with
 * the engine's state.
 */
export function AppShell() {
  const route = useSession((s) => s.route);
  const engine = useEngineStore((s) => s.status);
  const theme = useTheme();
  useEffect(followHash, []);
  useShortcuts({
    help: () => useSession.getState().setShortcutsOpen(true),
    theme: theme.cycle,
    home: () => useSession.getState().navigate({ screen: 'home' }),
    undo: () => useVisualStore.getState().undo(),
    redo: () => useVisualStore.getState().redo(),
  });

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-surface-canvas text-body text-ink" data-testid="app-shell">
      <Toolbar brand="Wellyboot BI" switcher={<AppSwitcher />} project={route.screen === 'editor' ? 'Untitled dashboard' : undefined}>
        {route.screen === 'editor' && (
          <Button variant="ghost" icon="arrow-left" onClick={() => useSession.getState().navigate({ screen: 'home' })}>
            All dashboards
          </Button>
        )}
        <HelpMenu />
        <Button
          variant="ghost"
          icon={THEME_ICON[theme.preference]}
          iconOnly
          aria-label={THEME_LABEL[theme.preference]}
          title={`${THEME_LABEL[theme.preference]} (${shortcutText('theme')})`}
          data-testid="theme-toggle"
          onClick={theme.cycle}
        />
      </Toolbar>
      {route.screen === 'editor' ? <EditorScreen /> : <HomeScreen />}
      <EditorStatus screen={route.screen} end={<EngineBadge status={engine} />} />
      <ShortcutsDialog />
    </div>
  );
}
