import { describe, it, expect } from 'vitest';
import { deviceHeightPx, halfRows, snapAnchor, moveStep } from '../src/render/grid.js';
import { parsePortId, makePortId, portU } from '../src/utils/ports.js';

describe('deviceHeightPx', () => {
  it('keeps integer-U sizes pixel-identical to the pre-0.5U layout', () => {
    expect(deviceHeightPx(1)).toBe(48);
    expect(deviceHeightPx(2)).toBe(100);
    expect(deviceHeightPx(3)).toBe(152);
  });
  it('sizes fractional heights', () => {
    expect(deviceHeightPx(0.5)).toBe(22);
    expect(deviceHeightPx(1.5)).toBe(74);
  });
});

describe('halfRows', () => {
  it('enumerates top-down in 0.5 steps', () => {
    expect(halfRows(2)).toEqual([2, 1.5, 1, 0.5]);
  });
});

describe('snapAnchor', () => {
  it('snaps integer-height devices to whole U by default', () => {
    expect(snapAnchor(2.5, 1, false)).toBe(3); // rounds to nearest whole
    expect(snapAnchor(2.4, 1, false)).toBe(2);
  });
  it('lets integer-height devices reach half positions with Alt', () => {
    expect(snapAnchor(2.5, 1, true)).toBe(2.5);
  });
  it('snaps fractional-height devices to the 0.5 grid by default', () => {
    expect(snapAnchor(2.5, 0.5, false)).toBe(2.5);
    expect(snapAnchor(2, 0.5, false)).toBe(2);
  });
});

describe('moveStep', () => {
  it('is 1U normally and 0.5U with Alt', () => {
    expect(moveStep(false)).toBe(1);
    expect(moveStep(true)).toBe(0.5);
  });
});

describe('port ids', () => {
  it('round-trips whole and half-U anchors', () => {
    expect(parsePortId(makePortId(3, 0))).toEqual({ u: 3, idx: 0 });
    expect(parsePortId(makePortId(2.5, 4))).toEqual({ u: 2.5, idx: 4 });
  });
  it('parses fractional U without truncating (regression: parseInt bug)', () => {
    expect(parsePortId('u2.5-p1').u).toBe(2.5);
    expect(portU('u2.5-p1')).toBe(2.5);
  });
});
