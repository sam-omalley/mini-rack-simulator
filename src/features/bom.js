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
export function computeBom(state, priceFn = null) {
  const byType = new Map();
  for (const { type } of state.rack) {
    const spec = DEVICE_TYPES[type];
    if (!spec) continue;
    const entry = byType.get(type) || { type, name: spec.name, uEach: spec.uHeight ?? 1, qty: 0 };
    entry.qty += 1;
    byType.set(type, entry);
  }

  const items = [...byType.values()]
    .map((e) => {
      const unitPrice = priceFn ? priceFn(e.type) : null;
      return {
        ...e,
        uTotal: e.qty * e.uEach,
        unitPrice,
        subtotal: unitPrice != null ? unitPrice * e.qty : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const priced = items.some((i) => i.unitPrice != null);
  return {
    items,
    deviceCount: state.rack.length,
    totalU: items.reduce((sum, i) => sum + i.uTotal, 0),
    cables: countCables(state),
    priced,
    totalCost: priced ? items.reduce((sum, i) => sum + (i.subtotal ?? 0), 0) : null,
  };
}

/** Render a BoM as CSV (devices section, then a cabling summary). */
export function bomToCsv(bom) {
  const priced = bom.priced;
  const head = ['Category', 'Item', 'Qty', 'U each', 'U total'];
  if (priced) head.push('Unit Price', 'Subtotal');
  const pad = priced ? ['', ''] : [];
  const rows = [head];

  bom.items.forEach((i) => {
    const row = ['Device', i.name, i.qty, i.uEach, i.uTotal];
    if (priced) row.push(i.unitPrice ?? '', i.subtotal ?? '');
    rows.push(row);
  });
  if (priced) rows.push(['', '', '', '', 'Total', '', bom.totalCost]);

  rows.push([]);
  rows.push(['Cabling', 'Type', 'Count', '', '', ...pad]);
  Object.entries(CABLE_LABELS).forEach(([key, label]) => rows.push(['Cable', label, bom.cables[key], '', '', ...pad]));
  rows.push(['Cable', 'Total', bom.cables.total, '', '', ...pad]);
  return toCsv(rows);
}
