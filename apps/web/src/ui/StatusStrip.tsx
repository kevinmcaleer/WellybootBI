import type { ReactNode } from 'react';
import { formatDuration, fullCount } from './format';
import { useDisplayFormat } from './locale';

// Puddle's StatusStrip (src/ui/ResultsBar.tsx) without the parts only Puddle uses: rule results, sample mode, kept
// results and sync state. Class names match components.css.

export interface StatusStripProps {
  rows?: number;
  cols?: number;
  ms?: number;
  /** About the current selection. */
  detail?: ReactNode;
  /** Shown at the right-hand end, e.g. engine state. */
  end?: ReactNode;
}

export function StatusStrip({ rows, cols, ms, detail, end }: StatusStripProps) {
  const display = useDisplayFormat();
  const parts: ReactNode[] = [];
  if (rows != null) parts.push(<span key="rows">{fullCount(rows, display)} rows</span>);
  if (cols != null) parts.push(<span key="cols">{cols} cols</span>);
  if (ms != null) parts.push(<span key="ms">{formatDuration(ms)}</span>);
  if (detail) parts.push(<span key="detail">{detail}</span>);
  // The counts are a live region, so a screen reader hears them change; the end of the strip (a running query's
  // timer, the engine) isn't, or a timer would be read out over and over.
  return (
    <footer className="ui-strip">
      <span role="status" className="ui-row" style={{ gap: 'var(--space-3)' }}>
        {parts.flatMap((p, i) => (i ? [<span key={`sep${i}`} className="ui-strip__sep" />, p] : [p]))}
      </span>
      <span className="ui-strip__end">{end}</span>
    </footer>
  );
}
