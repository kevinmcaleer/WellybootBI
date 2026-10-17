import { PUDDLE_KEYS, ProvenanceZ, type Dataset, type Provenance } from '@wellyboot/shared';
import { datasetFileName } from '../compiler/datasets';
import { parquetKvMetadata } from '../compiler/provenance';
import { tableRows, type EngineClient } from '../engine';

const json = (text: string | undefined): unknown => {
  if (text == null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Provenance from the `puddle.*` key-value pairs. Each field is checked on its own, so one malformed value is left
 * out rather than losing the rest. Undefined when the file carries none of them.
 */
export function parseProvenance(kv: Record<string, string>): Provenance | undefined {
  const candidates: Record<keyof Provenance, unknown> = {
    project: kv[PUDDLE_KEYS.project],
    node: kv[PUDDLE_KEYS.node],
    exportedAt: kv[PUDDLE_KEYS.exportedAt],
    sources: json(kv[PUDDLE_KEYS.sources]),
    rulesPassed: json(kv[PUDDLE_KEYS.rulesPassed]),
  };
  const shape = ProvenanceZ.shape;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidates) as [keyof Provenance, unknown][]) {
    if (value === undefined) continue;
    const parsed = shape[key].safeParse(value);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  return Object.keys(out).length ? ProvenanceZ.parse(out) : undefined;
}

/** Read the provenance Puddle wrote into a registered Parquet dataset; undefined for other formats or when absent. */
export async function readProvenance(engine: EngineClient, ds: Pick<Dataset, 'id' | 'format'>): Promise<Provenance | undefined> {
  if (ds.format !== 'parquet') return undefined;
  const rows = tableRows((await engine.query(parquetKvMetadata(datasetFileName(ds)), { priority: 'preview', label: 'Reading provenance' })).table);
  return parseProvenance(Object.fromEntries(rows.map((r) => [String(r.key), String(r.value)])));
}
