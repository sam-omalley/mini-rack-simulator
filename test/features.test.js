import { describe, it, expect } from 'vitest';
import { computeBom } from '../src/features/bom.js';
import { computePoe } from '../src/features/poe.js';
import { computePdu } from '../src/features/pdu.js';
import { validateRack } from '../src/features/validate.js';

describe('computeBom', () => {
  it('aggregates devices by model and counts cables', () => {
    const bom = computeBom({
      rack: [
        { u: 1, type: 'patch-8' },
        { u: 2, type: 'patch-8' },
        { u: 3, type: 'usw-lite-8-poe' },
      ],
      connections: [{ from: 'u1-p0', to: 'u2-p0' }],
    });
    expect(bom.deviceCount).toBe(3);
    const patch = bom.items.find((i) => i.type === 'patch-8');
    expect(patch.qty).toBe(2);
    expect(bom.cables.total).toBe(1);
    expect(bom.priced).toBe(false);
  });

  it('prices items when a priceFn is supplied', () => {
    const bom = computeBom({ rack: [{ u: 1, type: 'patch-8' }], connections: [] }, () => 20);
    expect(bom.priced).toBe(true);
    expect(bom.totalCost).toBe(20);
  });

  it('lists carrier sub-components as their own line items across carriers', () => {
    const bom = computeBom({
      rack: [
        { u: 1, type: 'drive-cage-6', fills: ['hdd-2tb', 'hdd-2tb', 'ssd-1tb', null, null, null] },
        { u: 2, type: 'drive-cage-6', fills: ['hdd-2tb', null, null, null, null, null] },
      ],
      connections: [],
    });
    expect(bom.deviceCount).toBe(2); // carriers only
    const hdd = bom.items.find((i) => i.type === 'hdd-2tb');
    expect(hdd).toMatchObject({ qty: 3, sub: true, uEach: 0 });
    expect(bom.items.find((i) => i.type === 'ssd-1tb').qty).toBe(1);
    // Sub-components do not inflate rack U.
    expect(bom.totalU).toBe(2);
  });

  it('prices sub-components into the total', () => {
    const price = { 'drive-cage-6': 35, 'hdd-2tb': 65 };
    const bom = computeBom(
      { rack: [{ u: 1, type: 'drive-cage-6', fills: ['hdd-2tb', 'hdd-2tb', null, null, null, null] }], connections: [] },
      (t) => price[t] ?? null
    );
    expect(bom.totalCost).toBe(35 + 65 * 2);
  });
});

describe('computePoe', () => {
  it('attributes a powered device to the switch it is cabled to', () => {
    const state = {
      rack: [
        { u: 6, type: 'usw-lite-8-poe' }, // budget 52, port0 = poe
        { u: 7, type: 'usw-flex-mini' }, // poeIn, 2.5 W, port0 = poe-gbe
      ],
      connections: [{ from: 'u7-p0', to: 'u6-p0' }],
    };
    const poe = computePoe(state);
    const src = poe.sources.find((s) => s.u === 6);
    expect(src.load).toBe(2.5);
    expect(src.over).toBe(false);
    expect(poe.totalBudget).toBe(52);
  });

  it('does not attribute draw when not on a PoE port', () => {
    const state = {
      rack: [
        { u: 6, type: 'usw-lite-8-poe' },
        { u: 7, type: 'usw-flex-mini' },
      ],
      connections: [{ from: 'u7-p0', to: 'u6-p4' }], // p4 = gbe (non-PoE)
    };
    expect(computePoe(state).sources.find((s) => s.u === 6).load).toBe(0);
  });
});

describe('computePdu', () => {
  it('tracks outlets, capacity, and UPS runtime; excludes PoE-powered devices', () => {
    const pdu = computePdu({
      rack: [
        { u: 1, type: 'ups-1u' }, // 4 outlets, 500 W, 400 Wh
        { u: 2, type: 'usw-pro-xg-8-poe' }, // 40 W wall
        { u: 3, type: 'synology-nas-2bay' }, // 30 W wall
        { u: 4, type: 'usw-flex-mini' }, // PoE-powered → excluded
      ],
      connections: [],
    });
    expect(pdu.outletsAvail).toBe(4);
    expect(pdu.outletsNeeded).toBe(2);
    expect(pdu.load).toBe(70);
    expect(pdu.runtimeMin).toBe(343);
    expect(pdu.capacityOver).toBe(false);
  });
});

describe('validateRack', () => {
  it('flags an unconnected network device', () => {
    const warnings = validateRack({ rack: [{ u: 1, type: 'usw-lite-8-poe' }], connections: [] });
    expect(warnings.some((w) => w.code === 'no-link')).toBe(true);
  });

  it('is clean for an empty rack', () => {
    expect(validateRack({ rack: [], connections: [] })).toEqual([]);
  });
});
