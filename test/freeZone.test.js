import { describe, it, expect } from 'vitest';
import { worldWidthFor, clientXToWorld } from '../src/features/freeZone.js';

// Numbers taken from the reproduction in issue #69: a 1500px viewport, 1320px
// stage, 12U rack, fit scale 0.718. The world is centred on the stage, so its
// centre-x is the stage's centre-x.
const STAGE_W = 1320;
const FIT = 0.718;
const ORIGIN_X = 742.5; // stage centre in client coords
const SIDEBAR_RIGHT = 442.5;
const INSPECTOR_LEFT = 1120.5;

describe('worldWidthFor', () => {
  it('leaves the world alone when the camera is not scaling', () => {
    expect(worldWidthFor(STAGE_W, 1)).toBe(STAGE_W);
  });

  it('widens the world so it still covers the stage once scaled down (#69)', () => {
    const w = worldWidthFor(STAGE_W, FIT);
    expect(w).toBeCloseTo(1838.4, 1);
    // The whole point: painted at the fit scale, it spans the stage exactly.
    expect(w * FIT).toBeCloseTo(STAGE_W, 6);
  });

  it('never divides by a nonsense scale', () => {
    expect(worldWidthFor(STAGE_W, 0)).toBe(STAGE_W);
    expect(worldWidthFor(STAGE_W, undefined)).toBe(STAGE_W);
    expect(worldWidthFor(STAGE_W, -1)).toBe(STAGE_W);
  });
});

describe('clientXToWorld', () => {
  const worldW = worldWidthFor(STAGE_W, FIT);
  // Where a world x lands back on screen: the world is centred on the stage.
  const toScreen = (worldX) => ORIGIN_X + (worldX - worldW / 2) * FIT;

  it('is the identity at the origin', () => {
    expect(clientXToWorld(ORIGIN_X, ORIGIN_X, worldW, FIT)).toBe(worldW / 2);
  });

  it('puts the walls exactly on the panel edges (#69)', () => {
    const left = clientXToWorld(SIDEBAR_RIGHT, ORIGIN_X, worldW, FIT);
    const right = clientXToWorld(INSPECTOR_LEFT, ORIGIN_X, worldW, FIT);
    expect(toScreen(left)).toBeCloseTo(SIDEBAR_RIGHT, 6);
    expect(toScreen(right)).toBeCloseTo(INSPECTOR_LEFT, 6);
  });

  it('keeps both walls inside the world, so neither gets clamped away', () => {
    const left = clientXToWorld(SIDEBAR_RIGHT, ORIGIN_X, worldW, FIT);
    const right = clientXToWorld(INSPECTOR_LEFT, ORIGIN_X, worldW, FIT);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(worldW);
    expect(left).toBeLessThan(right);
  });

  it('regression: omitting the scale pulled the walls inside the panels', () => {
    // What the old formula produced — kept as a guard, since the symptom (a
    // dead band ~85px wide) is invisible in any test that only checks ordering.
    const oldLeft = worldW / 2 + (SIDEBAR_RIGHT - ORIGIN_X);
    expect(toScreen(oldLeft) - SIDEBAR_RIGHT).toBeGreaterThan(80);
    const fixedLeft = clientXToWorld(SIDEBAR_RIGHT, ORIGIN_X, worldW, FIT);
    expect(Math.abs(toScreen(fixedLeft) - SIDEBAR_RIGHT)).toBeLessThan(0.001);
  });

  it('is unaffected by the scale when the camera is at 1:1', () => {
    expect(clientXToWorld(442.5, 742.5, STAGE_W, 1)).toBe(STAGE_W / 2 + (442.5 - 742.5));
  });
});
