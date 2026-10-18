import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { View } from 'vega';
import embed, { type Result } from 'vega-embed';
import type { TopLevelSpec } from 'vega-lite';
import { Banner } from '../ui';
import { numberLocale } from './numberLocale';

export interface ChartProps {
  /** The compiled spec; nothing is drawn without one. */
  spec?: TopLevelSpec;
  /** The query is running: a skeleton until the first spec, then the old chart stays while the new one comes. */
  loading?: boolean;
  /** Why the chart can't be drawn (the query failed, or the visual isn't ready), in a sentence. */
  error?: string;
  /** Why there's nothing to draw yet, in a sentence: "Add a field to Values to draw this bar chart". */
  empty?: string;
  /** Said above the chart: the query's rows were cut at its limit. */
  notice?: string;
  /** The display locale, for the axes' numbers. */
  locale?: string;
  /** Canvas in the app; SVG in tests, where there's no canvas. */
  renderer?: 'canvas' | 'svg';
  /** Hears the Vega view each time one is drawn, and null when it goes. */
  onView?: (view: View | null) => void;
}

/** Catches a chart that throws while drawing, so one broken chart never takes the editor down. A new spec tries again. */
class ChartBoundary extends Component<{ spec: TopLevelSpec; children: ReactNode }, { error?: string; spec?: TopLevelSpec }> {
  state: { error?: string; spec?: TopLevelSpec } = {};

  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  static getDerivedStateFromProps(props: { spec: TopLevelSpec }, state: { spec?: TopLevelSpec }) {
    return props.spec === state.spec ? null : { error: undefined, spec: props.spec };
  }

  componentDidCatch(e: unknown, info: ErrorInfo) {
    console.warn('A chart failed to draw.', e, info.componentStack);
  }

  render() {
    if (this.state.error) return <ChartMessage tone="fail" title="This chart can’t be drawn">{this.state.error}</ChartMessage>;
    return this.props.children;
  }
}

function ChartMessage({ tone, title, children }: { tone: 'info' | 'fail'; title?: string; children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-4" data-testid="chart-message">
      <div className="max-w-[480px]">
        <Banner tone={tone} title={title}>
          {children}
        </Banner>
      </div>
    </div>
  );
}

/** Draw a spec with vega-embed, following the box it is in. */
function Embedded({ spec, locale, renderer = 'canvas', onView }: { spec: TopLevelSpec; locale?: string; renderer?: 'canvas' | 'svg'; onView?: (view: View | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string>();
  const latestOnView = useRef(onView);
  useEffect(() => {
    latestOnView.current = onView;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let result: Result | undefined;
    let gone = false;
    setFailed(undefined);
    embed(el, spec, {
      renderer,
      actions: false,
      tooltip: { theme: 'wellyboot' },
      ...(locale && { formatLocale: numberLocale(locale) }),
    }).then(
      (r) => {
        if (gone) return r.finalize();
        result = r;
        latestOnView.current?.(r.view);
      },
      (e: unknown) => !gone && setFailed(e instanceof Error ? e.message : String(e)),
    );
    // The spec sizes the chart to its container; Vega itself only looks again when the window resizes.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      const view = result?.view;
      if (!view || !el.clientWidth || !el.clientHeight) return;
      void view.signal('width', el.clientWidth).signal('height', el.clientHeight).runAsync();
    });
    observer?.observe(el);
    return () => {
      gone = true;
      observer?.disconnect();
      result?.finalize();
      latestOnView.current?.(null);
    };
  }, [spec, locale, renderer]);

  if (failed) return <ChartMessage tone="fail" title="This chart can’t be drawn">{failed}</ChartMessage>;
  return <div ref={ref} className="h-full w-full" data-testid="chart-canvas" />;
}

/** A chart, or why there isn't one: a skeleton while its first data comes, a message when it can't be drawn. */
export function Chart({ spec, loading, error, empty, notice, locale, renderer, onView }: ChartProps) {
  let body: ReactNode;
  if (error) body = <ChartMessage tone="fail" title="This chart can’t be drawn">{error}</ChartMessage>;
  else if (empty) body = <ChartMessage tone="info">{empty}</ChartMessage>;
  else if (!spec)
    body = loading ? (
      <div className="h-full w-full animate-pulse rounded-md bg-surface-sunken" data-testid="chart-loading" aria-label="Loading the chart" role="img" />
    ) : null;
  else
    body = (
      <ChartBoundary spec={spec}>
        <Embedded spec={spec} locale={locale} renderer={renderer} onView={onView} />
      </ChartBoundary>
    );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="chart" aria-busy={loading || undefined}>
      {notice && !error && !empty && (
        <div data-testid="chart-notice">
          <Banner tone="warn">{notice}</Banner>
        </div>
      )}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
