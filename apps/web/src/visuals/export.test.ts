import { describe, expect, it, vi } from 'vitest';
import { chartFileName, chartImage, copyText, exportChart, PNG_SCALE } from './export';

describe('chart export', () => {
  it('names the file after the chart', () => {
    expect(chartFileName('Sales by region', 'png')).toBe('sales-by-region.png');
    expect(chartFileName('Ventes à Montréal — 2026', 'svg')).toBe('ventes-a-montreal-2026.svg');
    expect(chartFileName('  ', 'png')).toBe('chart.png');
  });

  it('draws an SVG from the view', async () => {
    const view = { toSVG: vi.fn(async () => '<svg/>'), toCanvas: vi.fn() };
    const blob = await chartImage(view as never, 'svg');
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toBe('<svg/>');
    expect(view.toCanvas).not.toHaveBeenCalled();
  });

  it('draws a PNG at twice the size, and saves it under the chart’s name', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const canvas = { toBlob: (done: (b: Blob | null) => void, type: string) => done(type === 'image/png' ? png : null) };
    const view = { toSVG: vi.fn(), toCanvas: vi.fn(async () => canvas) };
    const save = vi.fn();
    await exportChart(view as never, 'Untitled chart', 'png', save);
    expect(view.toCanvas).toHaveBeenCalledWith(PNG_SCALE);
    expect(save).toHaveBeenCalledWith(png, 'untitled-chart.png');
  });

  it('says so when the browser can’t draw a PNG', async () => {
    const view = { toSVG: vi.fn(), toCanvas: vi.fn(async () => ({ toBlob: (done: (b: Blob | null) => void) => done(null) })) };
    await expect(chartImage(view as never, 'png')).rejects.toThrow('couldn’t draw the chart as a PNG');
  });
});

describe('copyText', () => {
  it('writes the text', async () => {
    const clip = { writeText: vi.fn(async () => undefined) };
    await copyText('SELECT 1', clip);
    expect(clip.writeText).toHaveBeenCalledWith('SELECT 1');
  });

  it('says what to do when the browser refuses', async () => {
    const clip = { writeText: vi.fn(async () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'))) };
    await expect(copyText('SELECT 1', clip)).rejects.toThrow('won’t let Wellyboot BI use the clipboard');
    await expect(copyText('SELECT 1', undefined)).rejects.toThrow('won’t let Wellyboot BI use the clipboard');
  });
});
