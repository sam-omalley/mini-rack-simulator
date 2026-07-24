import { describe, it, expect } from 'vitest';
import { rackByU, classifyConnection, countCables } from '../src/render/cableClassify.js';

// Reference devices used below:
//   patch-8              → 8× patch
//   usw-pro-xg-8-poe     → 8× 10g-poe, 2× sfp
//   ucg-ultra            → 4× gbe, 1× wan-2.5g
//   usw-lite-8-poe       → 4× poe, 4× gbe
const rack = [
  { u: 1, type: 'patch-8' },
  { u: 2, type: 'patch-8' },
  { u: 3, type: 'usw-pro-xg-8-poe' },
  { u: 4, type: 'ucg-ultra' },
  { u: 5, type: 'usw-lite-8-poe' },
];
const map = rackByU(rack);

describe('classifyConnection', () => {
  it('classifies patch↔patch as a patch jumper', () => {
    expect(classifyConnection(map, 'u1-p0', 'u2-p0').kind).toBe('patch');
  });

  it('classifies SFP+ links', () => {
    expect(classifyConnection(map, 'u3-p8', 'u3-p9').kind).toBe('sfp');
  });

  it('classifies WAN uplinks', () => {
    expect(classifyConnection(map, 'u4-p4', 'u5-p0').kind).toBe('wan');
  });

  it('classifies 10G copper', () => {
    expect(classifyConnection(map, 'u3-p0', 'u1-p0').kind).toBe('xg');
  });

  it('flags media mismatch (rj45 ↔ sfp) as conflict', () => {
    expect(classifyConnection(map, 'u4-p0', 'u3-p8').kind).toBe('conflict');
  });

  it('defaults to standard/PoE', () => {
    expect(classifyConnection(map, 'u5-p0', 'u4-p0').kind).toBe('std');
  });
});

describe('countCables', () => {
  it('tallies connections by kind', () => {
    const counts = countCables({
      rack,
      connections: [
        { from: 'u1-p0', to: 'u2-p0' }, // patch
        { from: 'u5-p0', to: 'u4-p0' }, // std
        { from: 'u4-p4', to: 'u5-p1' }, // wan
      ],
    });
    expect(counts.total).toBe(3);
    expect(counts.patch).toBe(1);
    expect(counts.std).toBe(1);
    expect(counts.wan).toBe(1);
  });
});
