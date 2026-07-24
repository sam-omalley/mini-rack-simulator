import { DEVICE_TYPES } from '../data/devices.js';
import { rackByU } from '../render/cableClassify.js';
import { parsePortId } from '../utils/ports.js';

/**
 * Connection-aware PoE accounting. For each PoE-sourcing switch, sum the draw of
 * the powered devices (poeIn) actually cabled to one of its PoE ports, and
 * compare to its poeBudget. Pure — takes a state snapshot.
 */
export function computePoe(state) {
  const map = rackByU(state.rack);

  const sources = new Map();
  state.rack.forEach((d) => {
    const spec = DEVICE_TYPES[d.type];
    if (spec && spec.poeBudget > 0) {
      sources.set(d.u, { u: d.u, name: spec.name, budget: spec.poeBudget, load: 0, powered: [] });
    }
  });

  state.rack.forEach((d) => {
    const spec = DEVICE_TYPES[d.type];
    if (!spec?.poeIn) return;
    const watts = spec.watts || 0;
    const ports = spec.ports || [];

    // Find the first PoE source this device is cabled to; attribute its draw there.
    for (let idx = 0; idx < ports.length; idx++) {
      const other = otherEnd(state.connections, `u${d.u}-p${idx}`);
      if (!other) continue;
      const { u: otherU, idx: otherIdx } = parsePortId(other);
      const otherPort = DEVICE_TYPES[map.get(otherU)]?.ports[otherIdx];
      const src = sources.get(otherU);
      if (src && otherPort && otherPort.includes('poe')) {
        src.load += watts;
        src.powered.push({ name: spec.name, u: d.u, watts });
        break;
      }
    }
  });

  const list = [...sources.values()].map((s) => ({
    ...s,
    load: round(s.load),
    over: s.load > s.budget,
    pct: s.budget ? Math.round((s.load / s.budget) * 100) : 0,
  }));

  return {
    sources: list,
    totalBudget: list.reduce((a, s) => a + s.budget, 0),
    totalLoad: round(list.reduce((a, s) => a + s.load, 0)),
  };
}

function otherEnd(connections, portId) {
  const c = connections.find((x) => x.from === portId || x.to === portId);
  return c ? (c.from === portId ? c.to : c.from) : null;
}

function round(n) {
  return Math.round(n * 10) / 10;
}
