import { DEVICE_TYPES } from '../data/devices.js';
import { classifyConnection, rackByU, CABLE_LABELS } from '../render/cableClassify.js';
import { toCsv } from '../utils/csv.js';

/**
 * Build a wireable cable schedule: one row per connection, with resolved
 * endpoints (U, device, port number, patch label) and cable type, sorted by
 * source rack unit then port.
 */
export function computeSchedule(state) {
  const map = rackByU(state.rack);
  const labelsByU = new Map(state.rack.map((d) => [d.u, d.labels || []]));

  return state.connections
    .map((c) => {
      const from = endpoint(map, labelsByU, c.from);
      const to = endpoint(map, labelsByU, c.to);
      const kind = classifyConnection(map, c.from, c.to).kind;
      return { from, to, kind, kindLabel: CABLE_LABELS[kind] };
    })
    .sort((a, b) => a.from.u - b.from.u || a.from.port - b.from.port);
}

function endpoint(map, labelsByU, portId) {
  const [uPart, pPart] = portId.split('-');
  const u = parseInt(uPart.slice(1), 10);
  const idx = parseInt(pPart.slice(1), 10);
  return {
    u,
    port: idx + 1,
    device: DEVICE_TYPES[map.get(u)]?.name ?? 'Unknown',
    label: (labelsByU.get(u) || [])[idx] || '',
  };
}

export function scheduleToCsv(schedule) {
  const rows = [['From U', 'From Device', 'From Port', 'From Label', 'To U', 'To Device', 'To Port', 'To Label', 'Cable Type']];
  schedule.forEach((r) => {
    rows.push([r.from.u, r.from.device, r.from.port, r.from.label, r.to.u, r.to.device, r.to.port, r.to.label, r.kindLabel]);
  });
  return toCsv(rows);
}
