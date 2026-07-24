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
