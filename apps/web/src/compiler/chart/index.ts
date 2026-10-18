// Visuals to Vega-Lite. Each chart type is defined in its own file; this is the registry and the entry point.
import type { ChartType, Visual } from '@wellyboot/shared';
import type { TopLevelSpec } from 'vega-lite';
import { bar } from './bar';
import type { ChartResult } from './data';
import type { ChartDefinition, CompileContext } from './define';
import { line } from './line';
import { pie } from './pie';

export const CHARTS: Record<ChartType, ChartDefinition> = { bar, line, pie };

export const chartDefinition = (type: ChartType) => CHARTS[type];

/** Why a visual can't be drawn yet, in a sentence, or undefined when it can. */
export function chartProblem(visual: Visual): string | undefined {
  const def = CHARTS[visual.chart.type];
  const e = visual.chart.encoding;
  const well = (id: string) => def.wells.find((w) => w.id === id)!.label;
  if (!e.values.length) return `Add a field to ${well('values')} to draw this ${def.label.toLowerCase()}`;
  if (visual.chart.type === 'line' && e.category == null) return `Add a date or a number to ${well('category')} to draw this line chart`;
  return undefined;
}

/**
 * A visual's Vega-Lite spec, drawn from its query's result. The result is already summarised: the spec names fields
 * and their types and never asks Vega-Lite to aggregate.
 */
export function compileChart(visual: Visual, result: ChartResult, ctx: CompileContext): TopLevelSpec {
  return CHARTS[visual.chart.type].compile(visual, result, ctx);
}

export type { ChartDefinition, CompileContext, WellDefinition, WellId } from './define';
export type { ChartColumn, ChartResult, Point } from './data';
export { chartConfig, seriesPalette, themeColours, tokenColour, type ThemeMode } from './theme';
