// Handing a chart to the person: as a PNG or SVG file, or its SQL on the clipboard. saveBlob and copyText are
// Puddle's (src/export/deliver.ts).
import type { View } from 'vega';

/** Download a Blob as a file. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const NO_CLIPBOARD = 'This browser won’t let Wellyboot BI use the clipboard. Select the SQL in the Data tab instead.';

type Clip = Pick<Clipboard, 'writeText'>;

/** Put text on the clipboard, or say in a sentence why the browser wouldn't. */
export async function copyText(text: string, clip: Clip | undefined = navigator.clipboard) {
  if (!clip?.writeText) throw new Error(NO_CLIPBOARD);
  try {
    await clip.writeText(text);
  } catch {
    // Browsers refuse with a terse NotAllowedError; say what to do instead.
    throw new Error(NO_CLIPBOARD);
  }
}

export type ImageFormat = 'png' | 'svg';

/** A file name from a chart's name: "Sales by region" becomes sales-by-region.png. */
export function chartFileName(name: string, format: ImageFormat) {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'chart'}.${format}`;
}

/** PNGs are drawn at twice the size on screen, so they stay sharp on a slide or a high-density screen. */
export const PNG_SCALE = 2;

/** The chart as it is drawn now, as an image file's contents. */
export async function chartImage(view: Pick<View, 'toSVG' | 'toCanvas'>, format: ImageFormat): Promise<Blob> {
  if (format === 'svg') return new Blob([await view.toSVG()], { type: 'image/svg+xml' });
  const canvas = (await view.toCanvas(PNG_SCALE)) as HTMLCanvasElement;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser couldn’t draw the chart as a PNG.'))), 'image/png'));
}

/** Download the chart as a PNG or SVG named after it. */
export async function exportChart(view: Pick<View, 'toSVG' | 'toCanvas'>, name: string, format: ImageFormat, save = saveBlob) {
  save(await chartImage(view, format), chartFileName(name, format));
}
