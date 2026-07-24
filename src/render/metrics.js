import { DEVICE_TYPES } from '../data/devices.js';

/**
 * Compute power, PoE, and thermal figures for a set of placed devices.
 * @param {Array<{u:number,type:string}>} rack  Placed devices.
 * @param {number} maxU  Rack capacity.
 */
export function computeMetrics(rack, maxU) {
  let usedU = 0;
  let totalWatts = 0;
  let poeSupply = 0;
  let poeDemand = 0;
  let heat = 0;

  for (const { type } of rack) {
    const spec = DEVICE_TYPES[type];
    if (!spec) continue;
    usedU += spec.uHeight ?? 1;
    totalWatts += spec.watts ?? 0;
    poeSupply += spec.poeBudget ?? 0;
    if (spec.poeIn) poeDemand += spec.watts ?? 0;
    heat += spec.heatWeight ?? 0;
  }

  const poeLoad = poeSupply > 0 ? Math.min(100, Math.round((poeDemand / poeSupply) * 100)) : 0;
  return {
    deviceCount: rack.length,
    usedU,
    maxU,
    totalWatts: round1(totalWatts),
    poeSupply,
    poeDemand: round1(poeDemand),
    poeLoad,
    heat,
    thermalLevel: heat >= 12 ? 'high' : heat >= 6 ? 'warm' : 'cool',
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
