import { DEVICE_TYPES } from '../data/devices.js';
import { countCables, CABLE_LABELS } from '../render/cableClassify.js';
import { toCsv } from '../utils/csv.js';

/**
 * Build a Bill of Materials from a rack state: devices aggregated by model,
 * plus cable counts by type.
 *
 * Each item keeps its `type` (device key) so a future purchase layer can map
 * it to a product/ASIN without reshaping this output.
 */
export function computeBom(state) {
  const byType = new Map();
  for (const { type } of state.rack) {
    const spec = DEVICE_TYPES[type];
    if (!spec) continue;
    const entry = byType.get(type) || { type, name: spec.name, uEach: spec.uHeight ?? 1, qty: 0 };
    entry.qty += 1;
    byType.set(type, entry);
  }

  const items = [...byType.values()]
    .map((e) => ({ ...e, uTotal: e.qty * e.uEach }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items,
    deviceCount: state.rack.length,
    totalU: items.reduce((sum, i) => sum + i.uTotal, 0),
    cables: countCables(state),
  };
}

/** Render a BoM as CSV (devices section, then a cabling summary). */
export function bomToCsv(bom) {
  const rows = [['Category', 'Item', 'Qty', 'U each', 'U total']];
  bom.items.forEach((i) => rows.push(['Device', i.name, i.qty, i.uEach, i.uTotal]));
  rows.push([]);
  rows.push(['Cabling', 'Type', 'Count', '', '']);
  Object.entries(CABLE_LABELS).forEach(([key, label]) => rows.push(['Cable', label, bom.cables[key], '', '']));
  rows.push(['Cable', 'Total', bom.cables.total, '', '']);
  return toCsv(rows);
}
