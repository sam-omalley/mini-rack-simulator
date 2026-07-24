/**
 * Port identity helpers. A port id is `u{U}-p{idx}`, where U is the device's
 * top-anchor rack position (a multiple of 0.5) and idx is the port index.
 *
 * U must be parsed with parseFloat — half-U anchors like `u2.5-p0` would be
 * silently truncated by parseInt. This is the single place that knows the format.
 */
export function parsePortId(portId) {
  const [uPart, pPart] = portId.split('-');
  return { u: parseFloat(uPart.slice(1)), idx: parseInt(pPart.slice(1), 10) };
}

export function makePortId(u, idx) {
  return `u${u}-p${idx}`;
}

/** Just the anchor U of a port id. */
export function portU(portId) {
  return parseFloat(portId.split('-')[0].slice(1));
}
