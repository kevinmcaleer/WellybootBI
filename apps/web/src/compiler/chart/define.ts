// One definition per chart type, after Puddle's step registry: its name, its wells and what each accepts, and how it
// compiles to Vega-Lite. The editor reads the wells, so a new chart type (Phase 9) is a new file, not an editor change.
import type { ChartType, Encoding, Visual } from '@wellyboot/shared';
import type { TopLevelSpec } from 'vega-lite';
import type { FieldKind } from '../types';
import type { DisplayFormat } from '../../ui/locale';
import type { ChartResult } from './data';
import type { ThemeMode } from './theme';

/** The encodings a well fills. Filters are the query's own, so every chart has that well too (see the editor). */
export type WellId = keyof Pick<Encoding, 'category' | 'values' | 'series' | 'tooltips'>;

export interface WellDefinition {
  id: WellId;
  /** The well's name in the editor: Axis, Values, Legend, Tooltips. */
  label: string;
  /** Groups go in the category and series wells; summaries in the values and tooltips wells. */
  holds: 'group' | 'measure';
  /** The most fields it takes; any number when not given. */
  max?: number;
  /** For a group well, the kinds of field it takes, and the words for them ("a date or a number"). */
  kinds?: { accepts: FieldKind[]; words: string };
  /** What the empty well says. */
  empty: string;
}

export interface CompileContext {
  mode: ThemeMode;
  display?: DisplayFormat;
}

export interface ChartDefinition {
  type: ChartType;
  /** "Bar chart". */
  label: string;
  wells: WellDefinition[];
  /** With a legend field, the most values it draws (a legend can't split two values at once). */
  valuesWithSeries?: number;
  compile: (visual: Visual, result: ChartResult, ctx: CompileContext) => TopLevelSpec;
}

export const defineChart = (d: ChartDefinition) => d;
