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

  it('leaves fills absent for plain devices (back-compat)', () => {
    const round = Persistence.fromJSON(Persistence.toJSON({ maxU: 6, rack: [{ u: 1, type: 'patch-8' }], connections: [] }));
    expect(round.rack[0].fills).toBeUndefined();
  });
});
