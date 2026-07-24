/**
 * Rack grid geometry. The rack is modelled in 0.5U steps ("half-rows").
 * Positions (a device's top-anchor `u`) and heights are multiples of 0.5, which
 * are exactly representable in floating point, so stepping never drifts.
 *
 * Pixel sizes mirror rack.css: a 1U device stays 48px (2 half-rows of 22px +
 * one 4px gap) so integer layouts render identically to the pre-0.5U version.
 */
export const STEP = 0.5;
export const HALF_ROW_PX = 22;
export const ROW_GAP_PX = 4;
const PREVIEW_1U_PX = 38;

/** Height in px for a placed device of the given U height. */
export function deviceHeightPx(uHeight) {
  const halfRows = Math.round(uHeight / STEP);
  return halfRows * HALF_ROW_PX + (halfRows - 1) * ROW_GAP_PX;
}

/** Height in px for a sidebar preview device. */
export function previewHeightPx(uHeight) {
  return uHeight * PREVIEW_1U_PX;
}

/** Top-anchor positions from the top of the rack down to 0.5, in 0.5 steps. */
export function halfRows(maxU) {
  const rows = [];
  for (let u = maxU; u >= STEP - 1e-9; u -= STEP) rows.push(round(u));
  return rows;
}

/**
 * Snap a candidate anchor to the active grid.
 * Integer-height devices snap to whole U; fractional-height devices snap to
 * 0.5U (their natural grid). Holding Alt forces the 0.5U grid for everything.
 */
export function snapAnchor(u, uHeight, alt) {
  const step = alt || !Number.isInteger(uHeight) ? STEP : 1;
  return round(Math.round(u / step) * step);
}

/** Snap distance in U to move by, given a keyboard/drag modifier. */
export function moveStep(alt) {
  return alt ? STEP : 1;
}

function round(n) {
  return Math.round(n * 2) / 2;
}
