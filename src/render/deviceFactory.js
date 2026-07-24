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

    const dup = el('button', 'dup-btn');
    dup.type = 'button';
    dup.dataset.action = 'duplicate';
    dup.setAttribute('aria-label', `Duplicate ${spec.name}`);
    dup.innerHTML = '⧉';

    const del = el('button', 'delete-btn');
    del.type = 'button';
    del.dataset.action = 'delete';
    del.setAttribute('aria-label', `Remove ${spec.name}`);
    del.innerHTML = '×';

    dev.append(dup, del);
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

/** Build the faceplate for a slotted carrier: a row of empty/fillable bays. */
function buildCarrier(spec, uSlot) {
  const carrier = el('div', `slot-carrier slot-carrier--${spec.slots.layout || 'bays'}`);
  for (let i = 0; i < spec.slots.count; i++) {
    carrier.appendChild(buildBay(i, null, uSlot));
  }
  return carrier;
}

/**
 * Build one carrier bay. `fillKey` is a SUBCOMPONENTS key or null (empty).
 * Exported so app.js can rebuild a single bay when the user changes its fill.
 */
export function buildBay(index, fillKey, uSlot = null) {
  const bay = el('div', 'carrier-bay');
  bay.dataset.bay = String(index);
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
  if (sub) {
    bay.dataset.fill = fillKey;
    bay.classList.add('filled');
    bay.innerHTML = `<span class="bay-fill">${escapeHtml(bayBadge(sub))}</span>`;
    bay.setAttribute('aria-label', `${sub.name} — activate to change`);
    bay.title = sub.name;
  } else {
    delete bay.dataset.fill;
    bay.classList.remove('filled');
    bay.innerHTML = '<span class="bay-empty" aria-hidden="true">+</span>';
    bay.setAttribute('aria-label', 'Empty slot — activate to fit a component');
    bay.title = 'Empty slot';
  }
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
