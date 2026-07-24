import { DEVICE_TYPES, PORT_MEDIA_TYPES } from '../data/devices.js';
import { parsePortId, portU } from '../utils/ports.js';

/**
 * Pure cable classification, shared by the renderer (colours) and reports
 * (counts). Works from a plain state snapshot — no DOM — so it's testable.
 *
 * Port ids have the form `u{U}-p{idx}`.
 */

export const CABLE_KINDS = ['std', 'xg', 'wan', 'sfp', 'patch', 'conflict'];

export const CABLE_LABELS = {
  std: 'Standard / PoE',
  xg: '10G copper',
  wan: 'WAN uplink',
  sfp: 'SFP+ fiber',
  patch: 'Patch jumper',
  conflict: 'Media mismatch',
};

/** Build a `u -> deviceType` lookup from a state's rack array. */
export function rackByU(rack) {
  const map = new Map();
  rack.forEach((d) => map.set(d.u, d.type));
  return map;
}

export function portTypeAt(map, portId) {
  const { u, idx } = parsePortId(portId);
  const type = map.get(u);
  if (!type) return null;
  return DEVICE_TYPES[type]?.ports[idx] ?? null;
}

export function deviceTypeAt(map, portId) {
  return map.get(portU(portId)) ?? null;
}

/**
 * Classify a single connection into a `kind` (see CABLE_KINDS) and a CSS
 * colour token.
 * @param {Map<number,string>} map  u -> deviceType lookup.
 */
export function classifyConnection(map, fromId, toId) {
  const a = portTypeAt(map, fromId);
  const b = portTypeAt(map, toId);
  const mediaA = PORT_MEDIA_TYPES[a];
  const mediaB = PORT_MEDIA_TYPES[b];

  if (mediaA && mediaB && mediaA !== 'any' && mediaB !== 'any' && mediaA !== mediaB) {
    return { kind: 'conflict', color: 'var(--accent-red)' };
  }
  if (a === 'sfp' || b === 'sfp') return { kind: 'sfp', color: 'var(--accent-sfp)' };
  if (a?.startsWith('wan') || b?.startsWith('wan')) return { kind: 'wan', color: 'var(--accent-red)' };
  if (a?.includes('10g') || b?.includes('10g')) return { kind: 'xg', color: 'var(--accent-orange)' };

  const aType = deviceTypeAt(map, fromId);
  const bType = deviceTypeAt(map, toId);
  if (aType?.startsWith('patch') && bType?.startsWith('patch')) {
    return { kind: 'patch', color: 'var(--patch-cable)' };
  }
  return { kind: 'std', color: 'var(--accent-blue)' };
}

/** Count connections by kind for a whole state snapshot. */
export function countCables(state) {
  const map = rackByU(state.rack);
  const counts = { std: 0, xg: 0, wan: 0, sfp: 0, patch: 0, conflict: 0, total: 0 };
  state.connections.forEach((c) => {
    counts[classifyConnection(map, c.from, c.to).kind]++;
    counts.total++;
  });
  return counts;
}
