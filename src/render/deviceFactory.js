import { DEVICE_TYPES, subOf } from '../data/devices.js';
import { deviceHeightPx, previewHeightPx } from './grid.js';
import { makePortId } from '../utils/ports.js';

/**
 * Builds the DOM for a device. Pure construction — no event wiring.
 * Interaction is handled by delegated listeners in app.js so devices can be
 * created cheaply (sidebar previews) or as placed, interactive units.
 *
 * @param {string} type   Device key from DEVICE_TYPES.
 * @param {number|null} uSlot  Rack unit if placed; null for a library preview.
 */
export function createDevice(type, uSlot = null) {
  const spec = DEVICE_TYPES[type];
  if (!spec) return null;

  const dev = el('div', 'device');
  // Height is computed from uHeight (supports 0.5U steps) rather than fixed
  // per-U classes. `u-half` lets CSS shrink faceplates for sub-1U devices.
  dev.style.height = `${uSlot ? deviceHeightPx(spec.uHeight) : previewHeightPx(spec.uHeight)}px`;
  if (spec.uHeight < 1) dev.classList.add('u-half');
  dev.dataset.type = type;
  dev.tabIndex = 0;
  dev.setAttribute('role', 'group');
  dev.setAttribute('aria-label', spec.name);

  const earL = el('div', 'ear-l');
  earL.innerHTML = '<span class="screw-hole"></span>';
  const earR = el('div', 'ear-r');
  earR.innerHTML = '<span class="screw-hole"></span>';

  const body = el('div', 'device-body');

  if (spec.slots) {
    body.appendChild(buildCarrier(spec, uSlot));
  } else if (spec.bracket) {
    body.appendChild(buildBracket(type, spec, uSlot));
  } else {
    const ports = buildPorts(type, spec, uSlot);
    if (ports.children.length > 0) body.appendChild(ports);
  }

  // Rear (power-side) face — shown when the rack is flipped to rear view.
  const rear = el('div', 'device-rear');
  const inlets = spec.layout === 'pdu' ? (spec.outlets ?? 8) : 1;
  const inletHtml = spec.layout === 'pdu' ? '<span class="rear-inlet rear-inlet--iec"></span>' : '<span class="rear-inlet"></span>';
  rear.innerHTML = `${inletHtml}<span class="rear-label">${escapeHtml(spec.name)}</span>${
    inlets > 1 ? '<span class="rear-outlets">' + '<span class="rear-outlet"></span>'.repeat(inlets) + '</span>' : ''
  }`;

  dev.append(earL, body, rear, earR);

  if (uSlot) {
    dev.classList.add('placed');
    dev.draggable = true;

    // Deletion is by drag (to the bin, the library, or off-screen) — see app.js.
    const dup = el('button', 'dup-btn');
    dup.type = 'button';
    dup.dataset.action = 'duplicate';
    dup.setAttribute('aria-label', `Duplicate ${spec.name}`);
    dup.innerHTML = '⧉';

    dev.append(dup);
  }

  return dev;
}

function buildBracket(type, spec, uSlot) {
  const bracket = el('div', 'bracket-3d');

  if (spec.layout === 'dell-optiplex') {
    const chassis = el('div', 'dell-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    chassis.innerHTML = `
      <div class="dell-faceplate">
        <div class="dell-left-panel">
          <span class="dell-power-btn"><span class="power-icon"></span></span>
          <span class="dell-jacks"><span class="dell-jack"></span><span class="dell-jack"></span></span>
          <span class="dell-usb3"></span>
          <span class="dell-usbc"></span>
          <span class="dell-badge">OptiPlex</span>
        </div>
        <div class="dell-right-mesh"><span class="dell-logo-circle">DELL</span></div>
      </div>`;
    bracket.appendChild(chassis);
  } else if (spec.layout === 'deskpi-screen') {
    const screen = el('div', 'deskpi-screen-container');
    screen.innerHTML = `
      <div class="deskpi-hud-display">
        <span class="hud-gauge green">CPU<br>38%</span>
        <span class="hud-gauge orange">TEMP<br>45°C</span>
        <span class="hud-gauge purple">RAM<br>52%</span>
        <span class="hud-gauge">FPS<br>60</span>
      </div>`;
    bracket.appendChild(screen);
  } else if (spec.layout === 'pdu') {
    const chassis = el('div', 'pdu-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    for (let i = 0; i < (spec.outlets || 0); i++) chassis.appendChild(el('span', 'pdu-outlet'));
    bracket.appendChild(chassis);
  } else if (spec.layout === 'fan-unit') {
    const chassis = el('div', 'fan-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    // The OLED readout is what distinguishes the 4-fan unit; the 2-fan one is a
    // bare grille. Driven off `fans` so one branch draws both.
    if (spec.fans >= 4) {
      const oled = el('div', 'fan-oled');
      oled.innerHTML = '<span class="fan-oled-temp">28°C</span><span class="fan-oled-bar"></span>';
      chassis.appendChild(oled);
    }
    for (let i = 0; i < (spec.fans || 0); i++) {
      const cell = el('div', 'fan-cell');
      cell.innerHTML = '<span class="fan-hub"></span><span class="fan-blades"></span>';
      chassis.appendChild(cell);
    }
    bracket.appendChild(chassis);
  } else if (spec.layout === 'uck-g2-plus') {
    // The CloudKey wears its status screen on the right of the port, not the
    // left like the gateways — hence its own dark chassis rather than the
    // shared `unifi-chassis` branch below.
    const chassis = el('div', 'uck-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    chassis.appendChild(buildPorts(type, spec, uSlot));
    if (spec.hasScreen) chassis.appendChild(el('div', 'unifi-screen'));
    bracket.appendChild(chassis);
  } else if (spec.layout === 'rapidanalysis-xerxes') {
    const chassis = el('div', 'xerxes-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    spec.ports.forEach((ptype, idx) => {
      const bay = el('div', 'xerxes-blade-bay');
      const unit = el('div', 'switch-port-unit');
      unit.append(el('div', 'led'), createRJ45(ptype, idx, uSlot));
      bay.appendChild(unit);
      chassis.appendChild(bay);
    });
    bracket.appendChild(chassis);
  } else if (spec.layout === 'deskpi-dp0039' || spec.layout === 'deskpi-dp0046') {
    const chassis = el('div', 'deskpi-chassis');
    spec.ports.forEach((ptype, idx) => {
      const bay = el('div', 'deskpi-pi-bay');
      const badge = el('span', 'pi-badge');
      badge.textContent = `RPi 5 #${idx + 1}`;
      bay.append(badge, createRJ45(ptype, idx, uSlot));
      chassis.appendChild(bay);
    });
    bracket.appendChild(chassis);
  } else {
    const chassis = el('div', 'unifi-chassis');
    chassis.style.width = `${spec.bracketWidth}px`;
    if (spec.hasScreen) chassis.appendChild(el('div', 'unifi-screen'));
    chassis.appendChild(buildPorts(type, spec, uSlot));
    bracket.appendChild(chassis);
  }

  return bracket;
}

/* ------------------------------------------------------------- Carriers */

/**
 * Carrier layouts whose bays render as hot-swap drive caddies instead of the
 * plain labelled bay. `orient` picks the caddy artwork; `perRow` (when set)
 * breaks the bays into rows. Everything else about them is an ordinary carrier
 * bay — same fill menu, same `fills` persistence.
 */
const CADDY_LAYOUTS = {
  'caddy-h': { orient: 'h' },
  'caddy-h-rows': { orient: 'h', perRow: 2 },
  'caddy-v': { orient: 'v' },
};

/** Build the faceplate for a slotted carrier: a row of empty/fillable bays. */
function buildCarrier(spec, uSlot) {
  const layout = spec.slots.layout || 'bays';
  const caddy = CADDY_LAYOUTS[layout];
  const carrier = el('div', `slot-carrier slot-carrier--${layout}`);

  if (caddy?.perRow) {
    for (let i = 0; i < spec.slots.count; i += caddy.perRow) {
      const row = el('div', 'caddy-row');
      for (let j = i; j < Math.min(i + caddy.perRow, spec.slots.count); j++) {
        row.appendChild(buildBay(j, null, uSlot, caddy.orient));
      }
      carrier.appendChild(row);
    }
  } else {
    for (let i = 0; i < spec.slots.count; i++) {
      carrier.appendChild(buildBay(i, null, uSlot, caddy?.orient));
    }
  }

  if (!spec.bracket) return carrier;
  // Bracket-mounted cages sit in a metal chassis, like the other 10" gear.
  const chassis = el('div', 'hdd-chassis');
  chassis.style.width = `${spec.bracketWidth}px`;
  chassis.appendChild(carrier);
  const bracket = el('div', 'bracket-3d');
  bracket.appendChild(chassis);
  return bracket;
}

/**
 * Build one carrier bay. `fillKey` is a SUBCOMPONENTS key or null (empty).
 * `orient` opts the bay into the drive-caddy artwork ('h' or 'v').
 * Exported so app.js can rebuild a single bay when the user changes its fill.
 */
export function buildBay(index, fillKey, uSlot = null, orient = null) {
  const bay = el('div', 'carrier-bay');
  bay.dataset.bay = String(index);
  if (orient) {
    bay.classList.add('carrier-bay--caddy', `carrier-bay--caddy-${orient}`);
    // applyBayFill re-reads this on every fill change, so the bay keeps its
    // artwork without the caller having to remember which carrier it came from.
    bay.dataset.caddy = orient;
  }
  if (uSlot) {
    bay.tabIndex = 0;
    bay.setAttribute('role', 'button');
    bay.dataset.action = 'fill-bay';
  }
  applyBayFill(bay, fillKey);
  return bay;
}

/** Set (or clear) a bay's fill in place: dataset, label, and styling. */
export function applyBayFill(bay, fillKey) {
  const sub = fillKey ? subOf(fillKey) : null;
  const caddy = bay.dataset.caddy;
  if (sub) {
    bay.dataset.fill = fillKey;
    bay.classList.add('filled');
    // A fitted caddy is drawn, not labelled — the drive is named in the tooltip
    // and aria-label below, and itemised in the BoM.
    bay.innerHTML = caddy ? caddyHtml(caddy) : `<span class="bay-fill">${escapeHtml(bayBadge(sub))}</span>`;
    bay.setAttribute('aria-label', `${sub.name} — activate to change`);
    bay.title = sub.name;
  } else {
    delete bay.dataset.fill;
    bay.classList.remove('filled');
    // An empty caddy bay is the bare slot the caddy slides into: rails only.
    bay.innerHTML = caddy ? '' : '<span class="bay-empty" aria-hidden="true">+</span>';
    bay.setAttribute('aria-label', 'Empty slot — activate to fit a component');
    bay.title = 'Empty slot';
  }
}

/** A fitted hot-swap caddy: latch, orange release button, and vented handle. */
function caddyHtml(orient) {
  if (orient === 'v') {
    return (
      '<span class="caddy-latch-top"><span class="caddy-btn"></span></span>' +
      `<span class="caddy-handle-vert">${'<span class="caddy-vent-slot-horiz"></span>'.repeat(4)}</span>`
    );
  }
  return (
    '<span class="caddy-latch"><span class="caddy-btn"></span><span class="caddy-plus">+</span></span>' +
    `<span class="caddy-handle-horiz">${'<span class="caddy-vent-slot"></span>'.repeat(4)}</span>`
  );
}

/** Compact label for a filled bay (full name stays in the tooltip/aria). */
function bayBadge(sub) {
  if (sub.capacityTB != null) {
    return sub.capacityTB < 1 ? `${Math.round(sub.capacityTB * 1000)} GB` : `${sub.capacityTB} TB`;
  }
  return sub.name.replace(/^Raspberry /, '');
}

function buildPorts(type, spec, uSlot) {
  const group = el('div', 'ports-group');

  if (spec.isGrid) {
    group.className = 'switch-grid-16';
    const row1 = el('div', 'grid-row');
    const row2 = el('div', 'grid-row');
    spec.ports.forEach((ptype, idx) => {
      (idx % 2 === 0 ? row1 : row2).appendChild(createRJ45(ptype, idx, uSlot));
    });
    group.append(row1, row2);
    return group;
  }

  spec.ports.forEach((ptype, idx) => {
    const gap = gapBefore(type, spec.layout, idx);
    if (gap) group.appendChild(createGap(gap));

    if (ptype === 'patch') {
      const unit = el('div', 'patch-port-unit');
      const input = el('input', 'port-label');
      input.type = 'text';
      input.placeholder = String(idx + 1);
      input.maxLength = 8;
      input.setAttribute('aria-label', `Patch port ${idx + 1} label`);
      unit.append(input, createRJ45(ptype, idx, uSlot));
      group.appendChild(unit);
    } else {
      const unit = el('div', 'switch-port-unit');
      unit.append(el('div', 'led'), createRJ45(ptype, idx, uSlot));
      group.appendChild(unit);
    }
  });

  return group;
}

/** Extra spacing before a port index, to mimic real faceplate layouts. */
function gapBefore(type, layout, idx) {
  if (layout === 'ucg-max' && idx === 1) return 8;
  if (layout === 'ucg-ultra' && idx === 4) return 8;
  if (layout === 'ucg-fiber' && (idx === 4 || idx === 5)) return 6;
  if (layout === 'unvr-instant' && idx === 6) return 8; // PoE bank | uplink
  if (type === 'usw-pro-xg-8-poe' && idx === 8) return 6;
  return 0;
}

function createRJ45(ptype, idx, uSlot) {
  const port = el('div', 'port-rj45');
  if (ptype.includes('poe')) port.classList.add('port-poe');
  if (ptype.includes('10g')) port.classList.add('port-10g');
  if (ptype === 'sfp') port.classList.add('port-sfp');
  if (ptype.startsWith('wan')) port.classList.add('port-wan');

  port.tabIndex = uSlot ? 0 : -1;
  port.dataset.ptype = ptype;
  port.dataset.portIdx = String(idx);
  if (uSlot) {
    port.dataset.portId = makePortId(uSlot, idx);
    port.setAttribute('role', 'button');
    port.setAttribute('aria-label', `Port ${idx + 1}, ${ptype}. Activate to patch a cable.`);
  }
  return port;
}

function createGap(width) {
  const gap = el('div', 'port-gap');
  gap.style.width = `${width}px`;
  return gap;
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
