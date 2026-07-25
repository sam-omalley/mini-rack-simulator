import { describe, it, expect } from 'vitest';
import { Persistence } from '../src/features/persistence.js';

describe('Persistence normalize (via fromJSON)', () => {
  it('round-trips a valid state', () => {
    const state = {
      maxU: 8,
      rack: [{ u: 1, type: 'patch-8', labels: ['a', 'b'] }],
      connections: [{ from: 'u1-p0', to: 'u2-p0', label: 'x', color: '#fff' }],
      custom: [{ type: 'custom-x', name: 'X', ports: ['gbe'], uHeight: 1, custom: true }],
    };
    const round = Persistence.fromJSON(Persistence.toJSON(state));
    expect(round.maxU).toBe(8);
    expect(round.rack).toHaveLength(1);
    expect(round.connections[0]).toMatchObject({ from: 'u1-p0', to: 'u2-p0', label: 'x', color: '#fff' });
    expect(round.custom).toHaveLength(1);
  });

  it('clamps maxU into range and defaults missing fields', () => {
    const s = Persistence.fromJSON(JSON.stringify({ maxU: 99 }));
    expect(s.maxU).toBe(16);
    expect(s.rack).toEqual([]);
    expect(s.connections).toEqual([]);
    expect(s.custom).toEqual([]);
  });

  it('drops malformed rack entries and connections', () => {
    const s = Persistence.fromJSON(
      JSON.stringify({
        maxU: 4,
        rack: [{ u: 1, type: 'patch-8' }, { type: 'no-u' }, { u: 2 }, null],
        connections: [{ from: 'a', to: 'b' }, { from: 1 }, 'nope'],
      })
    );
    expect(s.rack).toHaveLength(1);
    expect(s.connections).toHaveLength(1);
  });

  it('strips label/color when absent or empty', () => {
    const s = Persistence.fromJSON(JSON.stringify({ connections: [{ from: 'a', to: 'b', label: '' }] }));
    expect(s.connections[0]).toEqual({ from: 'a', to: 'b' });
  });
});

describe('Persistence normalize — free-positioned devices (#43)', () => {
  it('round-trips free devices, clamping coordinates and defaulting angle', () => {
    const s = Persistence.fromJSON(
      JSON.stringify({
        free: [
          { type: 'usw-flex', nx: 0.4, ny: 0.9, angle: 1.2 },
          { type: 'blank', nx: 5, ny: -3 }, // out-of-range → clamped, angle defaults 0
        ],
      })
    );
    expect(s.free).toHaveLength(2);
    expect(s.free[0]).toEqual({ type: 'usw-flex', nx: 0.4, ny: 0.9, angle: 1.2 });
    expect(s.free[1]).toEqual({ type: 'blank', nx: 1, ny: 0, angle: 0 });
  });

  it('sanitizes free-device bay fills and drops malformed entries', () => {
    const s = Persistence.fromJSON(
      JSON.stringify({
        free: [{ type: 'drive-cage-6', nx: 0.5, ny: 0.5, fills: ['hdd-2tb', '', null] }, { nx: 0.1 }, null, 'x'],
      })
    );
    expect(s.free).toHaveLength(1);
    expect(s.free[0].fills).toEqual(['hdd-2tb', null, null]);
  });

  it('defaults free to an empty array when absent', () => {
    expect(Persistence.fromJSON(JSON.stringify({ maxU: 4 })).free).toEqual([]);
  });
});
