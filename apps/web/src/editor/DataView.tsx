import { DataEditor, GridCellKind, type GridCell, type GridColumn, type Item } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useCallback, useMemo } from 'react';
import { useResolvedTheme } from '../app/theme';
import { OTHERS_COLUMN } from '../compiler/query';
import { formatCell, OTHERS_LABEL } from '../queries/format';
import type { QueryRun } from '../queries/run';
import { glideTheme, useDisplayFormat } from '../ui';

const ROW_HEIGHT = 28;

/**
 * The chart's rows as a table, on Glide Data Grid as Puddle's results table is: one row per group, each value written
 * as the chart writes it. What to check a chart against.
 */
export function DataView({ run }: { run: QueryRun }) {
  const mode = useResolvedTheme();
  const display = useDisplayFormat();
  // Glide draws on a canvas, so it is given the theme's colours again whenever the theme changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const theme = useMemo(() => glideTheme(), [mode]);
  const columns = useMemo(() => run.columns.filter((c) => c.name !== OTHERS_COLUMN), [run.columns]);
  const gridColumns = useMemo<GridColumn[]>(() => columns.map((c) => ({ id: c.name, title: c.name, width: Math.max(120, Math.min(280, c.name.length * 9 + 32)) })), [columns]);
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const c = columns[col]!;
      const r = run.rows[row]!;
      const others = r[OTHERS_COLUMN] === true && c.role === 'group';
      const text = others ? OTHERS_LABEL : formatCell(r[c.name], c.hint, display);
      const empty = !others && r[c.name] == null;
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: false,
        readonly: true,
        contentAlign: c.hint.kind === 'number' ? 'right' : 'left',
        ...(empty && { themeOverride: { textDark: theme.textLight } }),
      };
    },
    [columns, run.rows, display, theme],
  );
  if (!run.rows.length) return <p className="p-4 text-ink-muted">No rows match. Change or remove a filter to see some.</p>;
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-md border border-line" data-testid="data-view">
      <DataEditor columns={gridColumns} rows={run.rows.length} getCellContent={getCellContent} rowHeight={ROW_HEIGHT} rowMarkers="number" smoothScrollX smoothScrollY theme={theme} width="100%" height="100%" />
    </div>
  );
}
