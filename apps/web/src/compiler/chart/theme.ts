// A chart's look, from the design system's tokens (tokens.json, vendored from Puddle) in the light or the dark
// theme: fonts, ink, lines, surfaces and the series colours. Vega draws on a canvas and can't read CSS variables, so
// the values are read here; this is the only file in the chart compiler that knows a colour.
import type { FontWeight } from 'vega';
import type { Config } from 'vega-lite';
import tokens from '../../design-system/tokens.json';

export type ThemeMode = 'light' | 'dark';

type ColourToken = { name: string; value: Record<ThemeMode, string> };
const COLOURS = new Map((tokens.color.tokens as ColourToken[]).map((t) => [t.name, t.value]));

/** A colour token's value in a theme, following references such as {brand}. */
export function tokenColour(name: string, mode: ThemeMode): string {
  const v = COLOURS.get(name)?.[mode];
  if (!v) throw new Error(`There's no colour token called ${name}`);
  const ref = /^\{(.+)\}$/.exec(v);
  return ref ? tokenColour(ref[1]!, mode) : v;
}

const STYLES = new Map(tokens.type.groups.flatMap((g) => g.styles.map((s) => [s.name, { ...s, family: g.family }] as const)));
const families = tokens.type.families as Record<string, string>;

/** A type style's font, size and weight, as Vega wants them. */
function typeStyle(name: string) {
  const s = STYLES.get(name);
  if (!s) throw new Error(`There's no type style called ${name}`);
  return { font: families[s.family]!, size: parseFloat(s.fontSize), weight: s.fontWeight as FontWeight };
}

/**
 * The series colours, in order: the brand, then colours the design system already uses for other things, picked to
 * stay apart from each other and readable on a raised surface in each theme.
 */
export const SERIES_TOKENS = ['brand', 'accent-ring', 'node-combine', 'pass', 'fail', 'node-check'] as const;

export const seriesPalette = (mode: ThemeMode) => SERIES_TOKENS.map((t) => tokenColour(t, mode));

/** Every colour a chart may contain in a theme, for the test that no other colour gets in. */
export const themeColours = (mode: ThemeMode) => new Set([...COLOURS.keys()].map((name) => tokenColour(name, mode).toLowerCase()));

/** A Vega-Lite config for a theme. */
export function chartConfig(mode: ThemeMode): Config {
  const c = (name: string) => tokenColour(name, mode);
  const label = typeStyle('label');
  const eyebrow = typeStyle('eyebrow');
  const heading = typeStyle('heading');
  const data = typeStyle('data');
  const palette = seriesPalette(mode);
  return {
    background: c('surface-raised'),
    font: label.font,
    padding: 8,
    view: { stroke: null },
    title: { color: c('ink'), font: heading.font, fontSize: heading.size, fontWeight: heading.weight, anchor: 'start', offset: 8 },
    axis: {
      domainColor: c('line-strong'),
      tickColor: c('line-strong'),
      gridColor: c('line'),
      labelColor: c('ink-muted'),
      labelFont: data.font,
      labelFontSize: eyebrow.size,
      titleColor: c('ink-muted'),
      titleFont: label.font,
      titleFontSize: label.size,
      titleFontWeight: label.weight,
      labelLimit: 160,
    },
    axisBand: { grid: false, labelAngle: 0 },
    axisQuantitative: { tickCount: 6 },
    scale: { bandPaddingInner: 0.3, bandPaddingOuter: 0.15 },
    legend: {
      labelColor: c('ink'),
      labelFont: label.font,
      labelFontSize: label.size,
      titleColor: c('ink-muted'),
      titleFont: label.font,
      titleFontSize: eyebrow.size,
      titleFontWeight: eyebrow.weight,
      symbolType: 'circle',
      labelLimit: 160,
    },
    range: { category: palette },
    mark: { color: palette[0] },
    bar: { cornerRadiusEnd: 2 },
    line: { strokeWidth: 2 },
    point: { filled: true, size: 36 },
    arc: { stroke: c('surface-raised'), strokeWidth: 1 },
    text: { color: c('ink'), font: data.font, fontSize: eyebrow.size },
  };
}
