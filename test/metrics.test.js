import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../src/render/metrics.js';

describe('computeMetrics', () => {
  it('sums power, PoE supply, and units', () => {
    const rack = [
      { u: 1, type: 'usw-pro-xg-8-poe' }, // 40 W, 200 W PoE budget, heat 5
      { u: 2, type: 'ucg-ultra' }, // 10 W, heat 2
    ];
    const m = computeMetrics(rack, 6);
    expect(m.deviceCount).toBe(2);
    expect(m.usedU).toBe(2);
    expect(m.totalWatts).toBe(50);
    expect(m.poeSupply).toBe(200);
    expect(m.maxU).toBe(6);
  });

  it('reports thermal level from combined heat weight', () => {
    const cool = computeMetrics([{ u: 1, type: 'blank' }], 6);
    expect(cool.thermalLevel).toBe('cool');

    const hot = computeMetrics(
      [
        { u: 1, type: 'usw-pro-xg-8-poe' }, // heat 5
        { u: 2, type: 'ucg-fiber' }, // heat 4
        { u: 3, type: 'dell-optiplex-micro' }, // heat 4
      ],
      6
    );
    expect(hot.thermalLevel).toBe('high');
  });

  it('handles an empty rack', () => {
    const m = computeMetrics([], 6);
    expect(m.deviceCount).toBe(0);
    expect(m.totalWatts).toBe(0);
    expect(m.thermalLevel).toBe('cool');
  });

  it('adds power and heat from fitted carrier sub-components', () => {
    // drive-cage-6: 2 W / heat 1. hdd-2tb: 2 W / heat 1 each. ssd-1tb: 1 W / heat 0.
    const base = computeMetrics([{ u: 1, type: 'drive-cage-6' }], 6);
    expect(base.totalWatts).toBe(2);
    expect(base.heat).toBe(1);

    const filled = computeMetrics([{ u: 1, type: 'drive-cage-6', fills: ['hdd-2tb', 'hdd-2tb', 'ssd-1tb', null, null, null] }], 6);
    expect(filled.totalWatts).toBe(2 + 2 + 2 + 1);
    expect(filled.heat).toBe(1 + 1 + 1 + 0);
  });

  it('ignores empty and unknown bay fills', () => {
    const m = computeMetrics([{ u: 1, type: 'drive-cage-6', fills: [null, 'nonsense', undefined] }], 6);
    expect(m.totalWatts).toBe(2); // just the cage itself
  });
});

describe('cooling', () => {
  // usw-pro-xg-8-poe: 40 W / heat 5. geeekpi-fan-1u-4x: 8 W / heat 0 / cooling 4.
  const hotPair = [
    { u: 1, type: 'usw-pro-xg-8-poe' }, // heat 5
    { u: 2, type: 'ucg-fiber' }, // heat 4
  ];

  it('subtracts cooling from heat but never from power draw', () => {
    const m = computeMetrics([...hotPair, { u: 3, type: 'geeekpi-fan-1u-4x' }], 6);
    expect(m.grossHeat).toBe(9);
    expect(m.cooling).toBe(4);
    expect(m.heat).toBe(5);
    // The fan draws its 8 W regardless — cooling offsets heat, not watts.
    expect(m.totalWatts).toBe(40 + 18 + 8);
  });

  it('floors net heat at zero rather than going negative', () => {
    const m = computeMetrics(
      [
        { u: 1, type: 'blank' }, // heat 0
        { u: 2, type: 'geeekpi-fan-1u-4x' }, // cooling 4
        { u: 4, type: 'geeekpi-fan-2u-2x' }, // cooling 2
      ],
      6
    );
    expect(m.cooling).toBe(6);
    expect(m.heat).toBe(0);
    expect(m.thermalLevel).toBe('cool');
  });

  it('lets a fan pull a rack back down a thermal grade', () => {
    const without = computeMetrics(hotPair, 6);
    const withFan = computeMetrics([...hotPair, { u: 3, type: 'geeekpi-fan-1u-4x' }], 6);
    expect(without.thermalLevel).toBe('warm'); // 9 heat over 6U = 1.5/U
    expect(withFan.thermalLevel).toBe('cool'); // 5 heat over 6U = 0.83/U
  });

  it('grades heat per U, so rack size matters', () => {
    const rack = [
      { u: 1, type: 'usw-pro-xg-8-poe' }, // heat 5
      { u: 2, type: 'ucg-fiber' }, // heat 4
      { u: 3, type: 'dell-optiplex-micro' }, // heat 4
    ];
    // 13 units of heat is 'high' packed into 6U, but merely 'warm' spread over 12U.
    expect(computeMetrics(rack, 6).thermalLevel).toBe('high');
    expect(computeMetrics(rack, 12).thermalLevel).toBe('warm');
  });

  it('grades a 6U rack exactly as the old absolute thresholds did', () => {
    // The thresholds are the previous 6/12 divided by the default 6U rack, so
    // the default rack size is unaffected by the switch to heat-per-U.
    const at = (heatTypes) => computeMetrics(heatTypes, 6).thermalLevel;
    expect(at([{ u: 1, type: 'ucg-ultra' }])).toBe('cool'); // heat 2
    expect(
      at([
        { u: 1, type: 'usw-pro-xg-8-poe' },
        { u: 2, type: 'pi-half' },
      ])
    ).toBe('warm'); // heat 6
    expect(
      at([
        { u: 1, type: 'usw-pro-xg-8-poe' },
        { u: 2, type: 'ucg-fiber' },
        { u: 3, type: 'deskpi-dp0046' },
      ])
    ).toBe('high'); // heat 13
  });
});
