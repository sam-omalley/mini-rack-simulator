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

/**
 * Clamp a top-anchor so the whole device stays between the rack's rails.
 * A 3U device hovered over the bottom row resolves to the bottom three rows
 * rather than hanging two rows off the end (issue #62).
 */
export function clampAnchor(u, uHeight, maxU) {
  return round(Math.max(uHeight, Math.min(maxU, u)));
}

/**
 * How many half-rows of a device sit ABOVE the point it was picked up by.
 * `fraction` is 0 at the device's top edge and 1 at its bottom, so grabbing a
 * 3U device by the middle gives 3 — the rows that must stay above the cursor.
 */
export function grabRows(fraction, uHeight) {
  const rows = Math.round(uHeight / STEP);
  const f = Number(fraction);
  const clamped = Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
  return Math.max(0, Math.min(rows - 1, Math.floor(clamped * rows)));
}

/**
 * The top-anchor a device actually takes when dropped over the row `pointerU`.
 *
 * Three corrections, all of which the drop preview and the drop itself have to
 * agree on (issue #62): the anchor is offset by where the device was grabbed,
 * so it lands where the drag image showed it rather than hanging off the
 * cursor; it is snapped to the active grid; and it is clamped into the rack
 * instead of being allowed to run off either end.
 */
export function resolveAnchor(pointerU, uHeight, maxU, { fine = false, grab = 0 } = {}) {
  const step = fine || !Number.isInteger(uHeight) ? STEP : 1;
  // The offset moves in WHOLE grid steps. Adding it before the snap instead
  // lands a whole-U device on a half-U tie (a 3U part grabbed centrally is 1.5U
  // from its own top), and the tie rounds away from the cursor — so the part
  // ends up sitting one U above where its drag image was. Rounding the offset
  // down to the grid also leaves 1U drags exactly as they were: grab anywhere
  // in the device and it still lands on the row under the cursor.
  const offset = Math.floor((grab * STEP) / step) * step;
  return clampAnchor(round(snapAnchor(pointerU, uHeight, fine) + offset), uHeight, maxU);
}

function round(n) {
  return Math.round(n * 2) / 2;
}
