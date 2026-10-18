import { useState } from 'react';
import { LEGEND_POSITIONS, NUMBER_FORMATS, type ChartOptions, type ChartSpec, type LegendPosition, type NumberFormat, type Visual } from '@wellyboot/shared';
import { Field, Select, Switch, TextInput } from '../ui';
import { WholeNumberInput } from './WholeNumberInput';

const LEGEND_LABEL: Record<LegendPosition, string> = { right: 'On the right', bottom: 'Below', top: 'Above', left: 'On the left', none: 'Hidden' };
const NUMBER_LABEL: Record<NumberFormat, string> = { auto: 'As the data is', whole: 'Whole numbers', decimal: 'Two decimals', compact: 'Short (1.2K)', percent: 'Percentages' };

type Edit = (change: (v: Visual) => Visual, opts?: { coalesce?: string }) => void;

/** A text box that keeps what is typed and passes each change on, coalesced into one undo step. */
function TextOption({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    if (text.trim() !== value.trim()) setText(value);
  }
  return (
    <Field label={label} htmlFor={id}>
      <TextInput
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
    </Field>
  );
}

/** The chart's look: its title, labels, legend, axes, numbers and colours. */
export function FormatSection({ visual, onEdit }: { visual: Visual; onEdit: Edit }) {
  const options = visual.chart.options as ChartOptions & Partial<{ axisTitles: boolean; xTitle: string; yTitle: string; orientation: 'vertical' | 'horizontal'; points: boolean; maxSlices: number }>;
  const set = (patch: Record<string, unknown>, coalesce?: string) =>
    onEdit((v) => {
      const next = { ...v.chart.options, ...patch } as Record<string, unknown>;
      for (const [k, val] of Object.entries(patch)) if (val === undefined) delete next[k];
      return { ...v, chart: { ...v.chart, options: next } as ChartSpec };
    }, coalesce ? { coalesce } : undefined);
  const type = visual.chart.type;
  return (
    <div className="flex flex-col gap-3" data-testid="format-section">
      <TextOption id="format-title" label="Title" value={visual.name} onChange={(name) => onEdit((v) => ({ ...v, name }), { coalesce: 'name' })} />
      <Switch label="Show the title" checked={options.showTitle} onChange={(showTitle) => set({ showTitle })} />
      <Switch label="Show values on the chart" checked={options.labels} onChange={(labels) => set({ labels })} />
      {type === 'bar' && (
        <Field label="Bars" htmlFor="format-orientation">
          <Select
            id="format-orientation"
            value={options.orientation}
            options={[
              { value: 'vertical', label: 'Upright' },
              { value: 'horizontal', label: 'Lying down' },
            ]}
            onChange={(e) => set({ orientation: e.target.value })}
          />
        </Field>
      )}
      {type === 'line' && <Switch label="Mark each point" checked={!!options.points} onChange={(points) => set({ points })} />}
      {type === 'pie' && (
        <Field label="Most slices" htmlFor="format-slices" hint="The rest are summed as Others.">
          <WholeNumberInput id="format-slices" value={options.maxSlices ?? 8} min={2} max={50} onChange={(maxSlices) => set({ maxSlices }, 'maxSlices')} />
        </Field>
      )}
      <Field label="Legend" htmlFor="format-legend">
        <Select id="format-legend" value={options.legend} options={LEGEND_POSITIONS.map((p) => ({ value: p, label: LEGEND_LABEL[p] }))} onChange={(e) => set({ legend: e.target.value })} />
      </Field>
      {type !== 'pie' && (
        <>
          <Switch label="Show axis titles" checked={!!options.axisTitles} onChange={(axisTitles) => set({ axisTitles })} />
          {options.axisTitles && (
            <div className="grid grid-cols-2 gap-2">
              <TextOption id="format-x-title" label="Axis title" value={options.xTitle ?? ''} placeholder="The field’s name" onChange={(t) => set({ xTitle: t.trim() || undefined }, 'xTitle')} />
              <TextOption id="format-y-title" label="Values title" value={options.yTitle ?? ''} placeholder="The value’s name" onChange={(t) => set({ yTitle: t.trim() || undefined }, 'yTitle')} />
            </div>
          )}
        </>
      )}
      <Field label="Numbers" htmlFor="format-numbers">
        <Select id="format-numbers" value={options.numberFormat} options={NUMBER_FORMATS.map((f) => ({ value: f, label: NUMBER_LABEL[f] }))} onChange={(e) => set({ numberFormat: e.target.value })} />
      </Field>
      <Field label="Colours" htmlFor="format-colours">
        <Select
          id="format-colours"
          value={options.colours}
          options={[
            { value: 'categorical', label: 'A colour for each series' },
            { value: 'brand', label: 'One colour' },
          ]}
          onChange={(e) => set({ colours: e.target.value })}
        />
      </Field>
    </div>
  );
}
