import { DEVICE_TYPES, subOf } from '../data/devices.js';

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
  let cooling = 0;

  for (const { type, fills } of rack) {
    const spec = DEVICE_TYPES[type];
    if (!spec) continue;
    usedU += spec.uHeight ?? 1;
    // A fan still draws power — cooling offsets heat, never watts.
    totalWatts += spec.watts ?? 0;
    poeSupply += spec.poeBudget ?? 0;
    if (spec.poeIn) poeDemand += spec.watts ?? 0;
    heat += spec.heatWeight ?? 0;
    cooling += spec.coolingWeight ?? 0;

    // Fitted sub-components (drives, compute modules) add their own draw + heat.
    for (const key of fills ?? []) {
      const sub = key && subOf(key);
      if (!sub) continue;
      totalWatts += sub.watts ?? 0;
      heat += sub.heatWeight ?? 0;
    }
  }

  const poeLoad = poeSupply > 0 ? Math.min(100, Math.round((poeDemand / poeSupply) * 100)) : 0;
  // Fans can't chill a rack below ambient, so net heat floors at 0 — otherwise a
  // fan-heavy rack would read as colder than an empty one.
  const netHeat = Math.max(0, heat - cooling);
  // Judge heat per U rather than in absolute units: 12 units of heat in a 6U
  // rack is a very different proposition from the same 12 spread over 16U. The
  // thresholds are the old absolute 6/12 divided by the default 6U rack, so a
  // 6U layout — the default — grades exactly as it always did.
  const density = maxU > 0 ? netHeat / maxU : netHeat;
  return {
    deviceCount: rack.length,
    usedU,
    maxU,
    totalWatts: round1(totalWatts),
    poeSupply,
    poeDemand: round1(poeDemand),
    poeLoad,
    heat: netHeat,
    grossHeat: heat,
    cooling,
    thermalLevel: density >= 2 ? 'high' : density >= 1 ? 'warm' : 'cool',
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
