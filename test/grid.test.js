import { describe, it, expect } from 'vitest';
import { deviceHeightPx, halfRows, snapAnchor, moveStep, clampAnchor, grabRows, resolveAnchor } from '../src/render/grid.js';
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

describe('clampAnchor', () => {
  it('keeps a tall device inside the rack instead of overhanging the foot', () => {
    expect(clampAnchor(2, 3, 6)).toBe(3); // 3U hovered at U2 -> bottom three rows
    expect(clampAnchor(0.5, 1, 6)).toBe(1);
  });
  it('clamps to the top rail', () => {
    expect(clampAnchor(9, 2, 6)).toBe(6);
  });
  it('leaves a position that already fits alone', () => {
    expect(clampAnchor(4, 3, 6)).toBe(4);
    expect(clampAnchor(0.5, 0.5, 6)).toBe(0.5);
  });
});

describe('grabRows', () => {
  it('is 0 when the device was picked up by its top edge', () => {
    expect(grabRows(0, 3)).toBe(0);
    expect(grabRows(0, 1)).toBe(0);
  });
  it('counts the half-rows above a mid-body grab', () => {
    expect(grabRows(0.5, 3)).toBe(3); // 3U grabbed centrally: 3 half-rows above
    expect(grabRows(0.5, 1)).toBe(1);
  });
  it('never lifts the anchor past the device itself', () => {
    expect(grabRows(1, 3)).toBe(5); // 6 half-rows tall -> last row index
    expect(grabRows(1, 0.5)).toBe(0);
  });
  it('shrugs off a missing or out-of-range fraction', () => {
    expect(grabRows(undefined, 2)).toBe(0);
    expect(grabRows(-3, 2)).toBe(0);
    expect(grabRows(9, 2)).toBe(3);
  });
});

describe('resolveAnchor', () => {
  it('places a device where the drag image sits, not hanging off the cursor', () => {
    // 3U grabbed centrally and dropped over U3 -> occupies U4..U2.
    expect(resolveAnchor(3, 3, 6, { grab: 3 })).toBe(4);
  });
  it('clamps rather than previewing a position that runs off the rack', () => {
    expect(resolveAnchor(1, 3, 6, {})).toBe(3);
    expect(resolveAnchor(6, 3, 6, { grab: 5 })).toBe(6);
  });
  it('still snaps integer devices to whole U, and to halves in fine mode', () => {
    expect(resolveAnchor(2.5, 1, 6, {})).toBe(3);
    expect(resolveAnchor(2.5, 1, 6, { fine: true })).toBe(2.5);
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
