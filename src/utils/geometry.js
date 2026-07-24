/** Convert an element's centre point into the SVG's coordinate space. */
export function getPortCenterInSVG(svg, el) {
  const rect = el.getBoundingClientRect();
  return clientToSVG(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/** Convert a mouse/touch event's client point into the SVG's coordinate space. */
export function getPointerInSVG(svg, e) {
  return clientToSVG(svg, e.clientX, e.clientY);
}

function clientToSVG(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

/**
 * Build the SVG path `d` string for a hanging cable between two points.
 * `routeY`, when provided, forces the cable to sag through a cable-management
 * row (e.g. a brush panel) at that Y coordinate.
 */
export function cablePath(x1, y1, x2, y2, routeY = null) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sag = Math.max(dy, 60) + dx * 0.25;

  let cx1 = x1;
  let cx2 = x2;
  if (dx < 40) {
    const loop = (40 - dx) * 0.8;
    cx1 += loop;
    cx2 += loop;
  }

  const cy1 = routeY !== null ? routeY : y1 + sag;
  const cy2 = routeY !== null ? routeY : y2 + sag;
  return `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
}
