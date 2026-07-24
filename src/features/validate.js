import { DEVICE_TYPES } from '../data/devices.js';
import { rackByU, classifyConnection, portTypeAt } from '../render/cableClassify.js';
import { computePoe } from './poe.js';

/**
 * Static design checks over a rack state. Pure — takes a snapshot, returns a
 * list of warnings (most severe first). Used by the Design Checks panel.
 *
 * @returns {Array<{severity:'error'|'warn'|'info', code:string, message:string}>}
 */
export function validateRack(state) {
  const map = rackByU(state.rack);
  const warnings = [];

  const connected = new Set();
  state.connections.forEach((c) => {
    connected.add(c.from);
    connected.add(c.to);
  });

  const otherEnd = (portId) => {
    const c = state.connections.find((x) => x.from === portId || x.to === portId);
    return c ? (c.from === portId ? c.to : c.from) : null;
  };

  // 1. Media mismatches (RJ45 <-> SFP+).
  state.connections.forEach((c) => {
    if (classifyConnection(map, c.from, c.to).kind === 'conflict') {
      warnings.push({
        severity: 'error',
        code: 'media-mismatch',
        message: `Media mismatch: ${fmtPort(map, c.from)} ↔ ${fmtPort(map, c.to)}.`,
      });
    }
  });

  // 2. Per-device checks.
  state.rack.forEach((d) => {
    const spec = DEVICE_TYPES[d.type];
    if (!spec) return;
    const ports = spec.ports || [];
    const isNetworkDevice = ports.length > 0 && !d.type.startsWith('patch');

    if (isNetworkDevice) {
      const anyConnected = ports.some((_, idx) => connected.has(`u${d.u}-p${idx}`));
      if (!anyConnected) {
        warnings.push({ severity: 'warn', code: 'no-link', message: `${spec.name} (U${d.u}) has no cables connected.` });
      }
      const wanIdx = ports.findIndex((p) => p.startsWith('wan'));
      if (wanIdx >= 0 && !connected.has(`u${d.u}-p${wanIdx}`)) {
        warnings.push({ severity: 'warn', code: 'no-wan', message: `${spec.name} (U${d.u}) WAN port isn't connected.` });
      }
    }

    if (spec.poeIn) {
      const powered = ports.some((_, idx) => {
        const pid = `u${d.u}-p${idx}`;
        if (!connected.has(pid)) return false;
        const otherType = portTypeAt(map, otherEnd(pid));
        return Boolean(otherType && otherType.includes('poe'));
      });
      if (!powered) {
        warnings.push({ severity: 'warn', code: 'no-poe-in', message: `${spec.name} (U${d.u}) is PoE-powered but not on a PoE port.` });
      }
    }
  });

  // 3. Per-switch PoE over-budget (connection-aware).
  computePoe(state).sources.forEach((s) => {
    if (s.over) {
      warnings.push({ severity: 'error', code: 'poe-over', message: `${s.name} (U${s.u}) PoE over budget: ${s.load} W of ${s.budget} W.` });
    }
  });

  const order = { error: 0, warn: 1, info: 2 };
  return warnings.sort((a, b) => order[a.severity] - order[b.severity]);
}

function fmtPort(map, portId) {
  const [uPart, pPart] = portId.split('-');
  const u = parseInt(uPart.slice(1), 10);
  const idx = parseInt(pPart.slice(1), 10);
  const name = DEVICE_TYPES[map.get(u)]?.name ?? 'Unknown';
  return `${name} U${u}·P${idx + 1}`;
}
