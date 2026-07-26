import { describe, it, expect } from 'vitest';
import { DEVICE_TYPES, SUBCOMPONENTS, subOf, subsFor } from '../src/data/devices.js';
import { Persistence } from '../src/features/persistence.js';

describe('SUBCOMPONENTS registry', () => {
  it('keeps sub-components out of the placeable device catalog', () => {
    Object.keys(SUBCOMPONENTS).forEach((key) => {
      expect(DEVICE_TYPES[key]).toBeUndefined();
    });
  });

  it('gives every sub-component a class, watts, and heatWeight', () => {
    Object.entries(SUBCOMPONENTS).forEach(([, s]) => {
      expect(typeof s.class).toBe('string');
      expect(typeof s.watts).toBe('number');
      expect(typeof s.heatWeight).toBe('number');
    });
  });

  it('subOf resolves known keys and null otherwise', () => {
    expect(subOf('hdd-2tb')?.class).toBe('drive');
    expect(subOf('does-not-exist')).toBeNull();
  });
});

describe('carrier / sub-component compatibility', () => {
  const carriers = Object.entries(DEVICE_TYPES).filter(([, spec]) => spec.slots);

  it('has at least one carrier', () => {
    expect(carriers.length).toBeGreaterThan(0);
  });

  it('every carrier slot accepts a class that at least one sub-component provides', () => {
    carriers.forEach(([, spec]) => {
      expect(spec.slots.count).toBeGreaterThan(0);
      const options = subsFor(spec.slots.accepts);
      expect(options.length).toBeGreaterThan(0);
      options.forEach((o) => expect(o.class).toBe(spec.slots.accepts));
    });
  });

  it('keeps 3.5" drives out of the 2.5" cage and vice versa', () => {
    const keys = (accepts) => subsFor(accepts).map((s) => s.key);
    const small = keys('drive');
    const large = keys('drive-35');
    expect(large.length).toBeGreaterThan(0);
    expect(small.some((k) => large.includes(k))).toBe(false);
    expect(DEVICE_TYPES['drive-cage-6'].slots.accepts).toBe('drive');
    expect(DEVICE_TYPES['hdd-cage-3u-7x'].slots.accepts).toBe('drive-35');
  });

  it('sizes each hot-swap cage to its bay count', () => {
    expect(DEVICE_TYPES['hdd-cage-1u-2x'].slots.count).toBe(2);
    expect(DEVICE_TYPES['hdd-cage-2u-6x'].slots.count).toBe(6);
    expect(DEVICE_TYPES['hdd-cage-3u-7x'].slots.count).toBe(7);
  });
});

describe('persistence preserves carrier bay fills', () => {
  it('round-trips fills through JSON, sanitizing empties', () => {
    const state = {
      maxU: 6,
      rack: [{ u: 1, type: 'drive-cage-6', labels: [], fills: ['hdd-2tb', null, 'ssd-1tb', '', null, null] }],
      connections: [],
    };
    const round = Persistence.fromJSON(Persistence.toJSON(state));
    expect(round.rack[0].fills).toEqual(['hdd-2tb', null, 'ssd-1tb', null, null, null]);
  });

  it('round-trips a 7-bay hot-swap cage', () => {
    const fills = ['hdd35-16tb', null, 'hdd35-8tb', null, null, 'hdd35-4tb', null];
    const state = { maxU: 6, rack: [{ u: 3, type: 'hdd-cage-3u-7x', labels: [], fills }], connections: [] };
    const round = Persistence.fromJSON(Persistence.toJSON(state));
    expect(round.rack[0].fills).toEqual(fills);
  });

  it('leaves fills absent for plain devices (back-compat)', () => {
    const round = Persistence.fromJSON(Persistence.toJSON({ maxU: 6, rack: [{ u: 1, type: 'patch-8' }], connections: [] }));
    expect(round.rack[0].fills).toBeUndefined();
  });
});
