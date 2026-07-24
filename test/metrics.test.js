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
});
