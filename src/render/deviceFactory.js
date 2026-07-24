import { DEVICE_TYPES } from '../data/devices.js';

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
  if (spec.uHeight === 2) dev.classList.add('u-2');
  if (spec.uHeight === 3) dev.classList.add('u-3');
  dev.dataset.type = type;
  dev.tabIndex = 0;
  dev.setAttribute('role', 'group');
  dev.setAttribute('aria-label', spec.name);

  const earL = el('div', 'ear-l');
  earL.innerHTML = '<span class="screw-hole"></span>';
  const earR = el('div', 'ear-r');
  earR.innerHTML = '<span class="screw-hole"></span>';

  const body = el('div', 'device-body');

  if (spec.bracket) {
    body.appendChild(buildBracket(type, spec, uSlot));
  } else {
    const ports = buildPorts(type, spec, uSlot);
    if (ports.children.length > 0) body.appendChild(ports);
  }

  // Rear (power-side) face — shown when the rack is flipped to rear view.
  const rear = el('div', 'device-rear');
  const inlets = spec.layout === 'pdu' ? spec.outlets ?? 8 : 1;
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
    port.dataset.portId = `u${uSlot}-p${idx}`;
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
