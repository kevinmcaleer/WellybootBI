// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { View } from 'vega';
import type { TopLevelSpec } from 'vega-lite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chart } from './Chart';
import { numberLocale } from './numberLocale';

afterEach(cleanup);

const spec = (values: { x: string; value: number }[]): TopLevelSpec => ({
  description: 'Bar chart of Sales by Region',
  data: { values },
  mark: 'bar',
  encoding: { x: { field: 'x', type: 'nominal', sort: null }, y: { field: 'value', type: 'quantitative' } },
  width: 300,
  height: 200,
});

const BARS = [
  { x: 'North', value: 30 },
  { x: 'South', value: 12 },
];

describe('Chart', () => {
  it('draws the spec and hands over its Vega view', async () => {
    let view: View | null = null;
    render(<Chart spec={spec(BARS)} renderer="svg" onView={(v) => (view = v)} />);
    await waitFor(() => expect(view).not.toBeNull());
    expect(view!.data('source_0').map((d: { x: string }) => d.x)).toEqual(['North', 'South']);
    expect(screen.getByTestId('chart-canvas').querySelector('svg')).not.toBeNull();
  });

  it('draws again when the spec changes, and lets the old view go', async () => {
    const views: (View | null)[] = [];
    const { rerender } = render(<Chart spec={spec(BARS)} renderer="svg" onView={(v) => views.push(v)} />);
    await waitFor(() => expect(views.filter(Boolean)).toHaveLength(1));
    rerender(<Chart spec={spec([{ x: 'East', value: 5 }])} renderer="svg" onView={(v) => views.push(v)} />);
    await waitFor(() => expect(views.filter(Boolean)).toHaveLength(2));
    expect(views).toContain(null);
    expect(views.at(-1)!.data('source_0')).toHaveLength(1);
  });

  it('shows a skeleton while the first data comes', () => {
    render(<Chart loading />);
    expect(screen.getByTestId('chart-loading')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toHaveAttribute('aria-busy', 'true');
  });

  it('says why there is no chart, and why one failed', () => {
    const { rerender } = render(<Chart empty="Add a field to Values to draw this bar chart" />);
    expect(screen.getByRole('status')).toHaveTextContent('Add a field to Values to draw this bar chart');
    rerender(<Chart spec={spec(BARS)} error="Sum needs a number; Region is text" />);
    expect(screen.getByRole('alert')).toHaveTextContent('This chart can’t be drawn');
    expect(screen.getByRole('alert')).toHaveTextContent('Sum needs a number; Region is text');
  });

  it('says so when Vega can’t draw the spec', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Chart spec={{ mark: 'nonsense' } as unknown as TopLevelSpec} renderer="svg" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This chart can’t be drawn');
    vi.restoreAllMocks();
  });

  it('shows the notice above the chart', () => {
    render(<Chart spec={spec(BARS)} renderer="svg" notice="This chart shows the first 10,000 rows" />);
    expect(screen.getByTestId('chart-notice')).toHaveTextContent('This chart shows the first 10,000 rows');
  });
});

describe('numberLocale', () => {
  it('takes the locale’s signs for the axes', () => {
    expect(numberLocale('en-GB')).toMatchObject({ decimal: '.', thousands: ',' });
    expect(numberLocale('de-DE')).toMatchObject({ decimal: ',', thousands: '.' });
  });
});
