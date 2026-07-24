import { DEVICE_TYPES } from '../data/devices.js';

/**
 * PDU / UPS power-source tracking. Aggregates outlet count and watt capacity of
 * any placed power sources (devices with an `outlets`/`capacity`), sums the draw
 * of the wall-powered devices that need an outlet, and estimates UPS runtime
 * from total battery energy. Pure — takes a state snapshot.
 *
 * A device needs an outlet if it draws power and isn't itself a power source or
 * PoE-powered (those draw from a switch, not the PDU).
 */
export function computePdu(state) {
  let outletsAvail = 0;
  let capacity = 0;
  let batteryWh = 0;

  state.rack.forEach((d) => {
    const spec = DEVICE_TYPES[d.type];
    if (!spec) return;
    if (spec.outlets || spec.capacity) {
      outletsAvail += spec.outlets || 0;
      capacity += spec.capacity || 0;
      batteryWh += spec.batteryWh || 0;
    }
  });

  let outletsNeeded = 0;
  let load = 0;
  state.rack.forEach((d) => {
    const spec = DEVICE_TYPES[d.type];
    if (!spec || spec.outlets || spec.capacity || spec.poeIn) return;
    if ((spec.watts || 0) > 0) {
      outletsNeeded += 1;
      load += spec.watts;
    }
  });

  const hasSource = outletsAvail > 0 || capacity > 0;
  return {
    hasSource,
    outletsAvail,
    outletsNeeded,
    capacity,
    load: round(load),
    batteryWh,
    runtimeMin: batteryWh > 0 && load > 0 ? Math.round((batteryWh / load) * 60) : null,
    outletsOver: outletsNeeded > outletsAvail,
    capacityOver: capacity > 0 && load > capacity,
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
