import { DEVICE_TYPES, PORT_SPECS, CATEGORIES, uHeightOf, subsFor } from './data/devices.js';
import { CustomDevices } from './features/customDevices.js';
import { TEMPLATES } from './data/templates.js';
import { createDevice, applyBayFill } from './render/deviceFactory.js';
import { computeMetrics } from './render/metrics.js';
import { CableManager } from './render/cableManager.js';
import { classifyConnection, rackByU } from './render/cableClassify.js';
import { STEP, snapAnchor, moveStep, halfRows } from './render/grid.js';
import { parsePortId, portU, makePortId } from './utils/ports.js';
import { Persistence } from './features/persistence.js';
import { FreeZone } from './features/freeZone.js';
import { computeBom, bomToCsv } from './features/bom.js';
import { computeSchedule, scheduleToCsv } from './features/cableSchedule.js';
import { Pricing, priceFn } from './features/pricing.js';
import { validateRack } from './features/validate.js';
import { computePoe } from './features/poe.js';
import { computePdu } from './features/pdu.js';
import { getPortCenterInSVG, cablePath } from './utils/geometry.js';
import { Tooltip } from './ui/tooltip.js';
import { Toast } from './ui/toast.js';
import { Theme } from './ui/theme.js';
import { exportPNG } from './features/exportPng.js';

const MAX_HISTORY = 100;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
// Smallest the fit-to-stage scale may go, so a very tall rack stays legible
// rather than shrinking to nothing (issue #63).
const FIT_SCALE_MIN = 0.4;

// Momentary fine-placement modifier read from an event. Hold-to-reveal was
// dropped: browsers (Firefox especially) deliver Alt/Shift keydown/keyup
// unreliably, so it stuck or lagged. The fine grid is now an explicit toggle
// (see `_fineMode`); these modifiers still give a per-event snap override,
// which is read at event time and so is always reliable.
const fineMode = (e) => Boolean(e && (e.shiftKey || e.altKey));

export const App = {
  connections: [],
  maxU: 6,
  zoom: 1, // user's multiplier; on-screen scale is cameraScale()
  fitScale: 1, // shrinks the view so the whole world fits the stage (#63)
  draggedEl: null,
  fromSidebar: false,
  placingType: null,
  _fineMode: false, // sticky ½U grid toggle (button / "G")
  history: [],
  historyIndex: -1,
  redrawPending: false,
  labelTimer: null,
  costSignature: '',

  init() {
    Tooltip.init();
    Toast.init();
    Theme.init();
    Pricing.load();
    CustomDevices.load();

    this.cacheDom();
    this.renderSidebar();
    this.renderCustomSection();
    this.setupDeviceModal();
    this.setupCableEditor();
    this.setupHelp();
    this.setupLayouts();
    this.bindGlobalControls();
    this.bindDelegatedEvents();
    CableManager.init(this);
    FreeZone.init(this);

    // Priority: shared URL > saved session > empty rack.
    const initial = Persistence.loadFromUrl() || Persistence.load() || { maxU: 6, rack: [], connections: [] };
    if (Persistence.loadFromUrl()) Toast.show('Loaded a shared rack layout.');
    this.loadState(initial, { record: true, resetHistory: true });
  },

  cacheDom() {
    this.$slots = document.getElementById('slots-container');
    this.$svg = document.getElementById('cable-svg');
    this.$wrapper = document.getElementById('rack-wrapper');
    this.$camera = document.querySelector('.rack-wrapper-container');
    this.$report = document.getElementById('report-list');
    this.$power = document.getElementById('power-summary');
    this.$cableBreakdown = document.getElementById('cable-breakdown');
    this.$schedule = document.getElementById('schedule-list');
    this.$scheduleCount = document.getElementById('schedule-count');
    this.$costList = document.getElementById('cost-list');
    this.$costTotal = document.getElementById('cost-total');
    this.$costNote = document.getElementById('cost-note');
    this.$warnings = document.getElementById('warnings-list');
    this.$warningsCount = document.getElementById('warnings-count');
    this.$hint = document.getElementById('placement-hint');
  },

  /* ---------------------------------------------------------------- Sidebar */

  renderSidebar() {
    const container = document.getElementById('sidebar-categories');
    container.innerHTML = '';

    CATEGORIES.forEach((cat) => {
      const block = document.createElement('div');
      block.className = 'sidebar-category';
      block.innerHTML = `<div class="category-title">${cat.title}</div>`;

      cat.types.forEach((type) => block.appendChild(this.buildDeviceCard(type)));
      container.appendChild(block);
    });

    document.getElementById('search-sidebar').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.device-card').forEach((card) => {
        const name = DEVICE_TYPES[card.dataset.deviceType].name.toLowerCase();
        card.hidden = !name.includes(q);
      });
      document.querySelectorAll('.sidebar-category').forEach((cat) => {
        const anyVisible = [...cat.querySelectorAll('.device-card')].some((c) => !c.hidden);
        cat.hidden = !anyVisible;
      });
    });

    document.getElementById('btn-sidebar-toggle').addEventListener('click', (e) => {
      const body = document.getElementById('sidebar-body');
      const collapsed = body.toggleAttribute('hidden');
      e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
      e.currentTarget.textContent = collapsed ? '▸' : '▾';
    });
  },

  /** Build a draggable/tappable library card for a device type. */
  buildDeviceCard(type, { removable = false } = {}) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'device-card';
    card.draggable = true;
    card.dataset.deviceType = type;
    card.setAttribute('aria-label', `Add ${DEVICE_TYPES[type].name}`);
    card.innerHTML = `<span class="device-card-title">${escapeHtml(DEVICE_TYPES[type].name)}</span>`;
    if (removable) {
      const del = document.createElement('span');
      del.className = 'device-card-remove';
      del.dataset.removeType = type;
      del.setAttribute('role', 'button');
      del.setAttribute('aria-label', `Delete custom device ${DEVICE_TYPES[type].name}`);
      del.textContent = '×';
      card.querySelector('.device-card-title').appendChild(del);
    }
    card.appendChild(createDevice(type));

    card.addEventListener('dragstart', (e) => {
      this.draggedEl = card;
      this.fromSidebar = true;
      e.dataTransfer.effectAllowed = 'copy';
      card.classList.add('dragging');
      // The sidebar isn't zoomed, so the native drag image would preview at 100%
      // even when the rack is scaled — match the zoom so it looks like the drop.
      // At 100% the native image is already correct, so skip the custom ghost.
      if (this.cameraScale() !== 1) this.setScaledDragImage(e, card.querySelector('.device'));
      this.beginDrag(type, 'sidebar');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this.endDrag();
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove-type]')) {
        e.stopPropagation();
        this.removeCustomDevice(type);
        return;
      }
      this.togglePlacement(type);
    });
    return card;
  },

  renderCustomSection() {
    const list = document.getElementById('custom-devices-list');
    list.innerHTML = '';
    const customs = CustomDevices.list();
    if (customs.length === 0) {
      list.innerHTML = '<p class="custom-empty text-muted">None yet. Add gear not in the catalog.</p>';
    } else {
      customs.forEach((def) => list.appendChild(this.buildDeviceCard(def.type, { removable: true })));
    }
  },

  removeCustomDevice(type) {
    const inUse = this.getState().rack.some((r) => r.type === type);
    if (inUse && !confirm('This custom device is placed in the rack. Delete it and remove those units?')) return;
    document.querySelectorAll(`.slot .device[data-type="${type}"]`).forEach((d) => this.removeDevice(d));
    CustomDevices.remove(type);
    if (this.placingType === type) {
      this.placingType = null;
      this.updatePlacementUi();
    }
    this.renderCustomSection();
  },

  /* ------------------------------------------------------------- Help modal */

  setupHelp() {
    const modal = document.getElementById('help-modal');
    document.getElementById('btn-help').addEventListener('click', () => modal.showModal());
    document.getElementById('help-close').addEventListener('click', () => modal.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        modal.open ? modal.close() : modal.showModal();
      }
    });
  },

  /* --------------------------------------------------------- Saved layouts */

  setupLayouts() {
    this.$layoutSelect = document.getElementById('layout-select');
    this.refreshLayoutSelect();

    document.getElementById('btn-save-layout').addEventListener('click', () => {
      const input = document.getElementById('layout-name');
      const name = input.value.trim();
      if (!name) {
        Toast.show('Enter a name to save this layout.');
        input.focus();
        return;
      }
      const exists = Persistence.listLayouts().includes(name);
      if (exists && !confirm(`Overwrite the saved layout "${name}"?`)) return;
      Persistence.saveLayout(name, this.getState());
      input.value = '';
      this.refreshLayoutSelect(name);
      Toast.show(`Saved layout "${name}".`);
    });

    document.getElementById('btn-load-layout').addEventListener('click', () => {
      const name = this.$layoutSelect.value;
      if (!name) return;
      const state = Persistence.loadLayout(name);
      if (!state) {
        Toast.show('That layout could not be loaded.');
        return;
      }
      this.loadState(state, { record: true });
      Toast.show(`Loaded layout "${name}".`);
    });

    document.getElementById('btn-delete-layout').addEventListener('click', () => {
      const name = this.$layoutSelect.value;
      if (!name) return;
      if (!confirm(`Delete the saved layout "${name}"?`)) return;
      Persistence.deleteLayout(name);
      this.refreshLayoutSelect();
      Toast.show(`Deleted layout "${name}".`);
    });

    // Templates.
    const tSelect = document.getElementById('template-select');
    tSelect.innerHTML =
      '<option value="">— start from template —</option>' +
      TEMPLATES.map((t) => `<option value="${t.id}" title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</option>`).join('');

    document.getElementById('btn-load-template').addEventListener('click', () => {
      const tpl = TEMPLATES.find((t) => t.id === tSelect.value);
      if (!tpl) return;
      const notEmpty = this.getState().rack.length > 0 || this.connections.length > 0;
      if (notEmpty && !confirm(`Replace the current rack with the "${tpl.name}" template?`)) return;
      this.loadState(structuredClone(tpl.state), { record: true });
      tSelect.value = '';
      Toast.show(`Loaded the "${tpl.name}" template.`);
    });
  },

  refreshLayoutSelect(selected = '') {
    const names = Persistence.listLayouts();
    this.$layoutSelect.innerHTML =
      '<option value="">— saved layouts —</option>' +
      names.map((n) => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
  },

  /* ------------------------------------------------------- Cable editor */

  setupCableEditor() {
    this.$cableEditor = document.getElementById('cable-editor');
    this.editingCable = null;

    const swatches = [
      { name: 'Auto', color: null },
      { name: 'Blue', color: '#3b82f6' },
      { name: 'Green', color: '#10b981' },
      { name: 'Orange', color: '#f97316' },
      { name: 'Red', color: '#ef4444' },
      { name: 'Purple', color: '#a855f7' },
      { name: 'Cyan', color: '#06b6d4' },
      { name: 'Gray', color: '#94a3b8' },
    ];
    document.getElementById('cable-swatches').innerHTML = swatches
      .map(
        (s) =>
          `<button type="button" class="swatch${s.color ? '' : ' swatch-auto'}" data-color="${s.color ?? ''}" title="${s.name}" aria-label="${s.name}"${s.color ? ` style="background:${s.color}"` : ''}>${s.color ? '' : 'A'}</button>`
      )
      .join('');

    // Open on cable click.
    this.$svg.addEventListener('click', (e) => {
      const path = e.target.closest('path.cable-path');
      if (path) this.openCableEditor(parseInt(path.dataset.cidx, 10), e);
    });

    // Label edits (debounced commit).
    const input = document.getElementById('cable-label-input');
    input.addEventListener('input', () => {
      if (this.editingCable == null) return;
      this.connections[this.editingCable].label = input.value.trim() || undefined;
      clearTimeout(this.labelTimer);
      this.labelTimer = setTimeout(() => this.commit(), 500);
    });

    document.getElementById('cable-swatches').addEventListener('click', (e) => {
      const btn = e.target.closest('.swatch');
      if (!btn || this.editingCable == null) return;
      this.connections[this.editingCable].color = btn.dataset.color || undefined;
      this.markActiveSwatch();
      this.commit();
    });

    document.getElementById('cable-delete').addEventListener('click', () => {
      if (this.editingCable == null) return;
      this.connections.splice(this.editingCable, 1);
      this.closeCableEditor();
      this.commit();
    });

    // Dismiss on outside click / Escape.
    document.addEventListener('pointerdown', (e) => {
      if (!this.$cableEditor.hidden && !e.target.closest('#cable-editor') && !e.target.closest('path.cable-path')) {
        this.closeCableEditor();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.$cableEditor.hidden) this.closeCableEditor();
    });
  },

  openCableEditor(index, e) {
    const c = this.connections[index];
    if (!c) return;
    this.editingCable = index;
    const input = document.getElementById('cable-label-input');
    input.value = c.label || '';
    this.markActiveSwatch();

    this.$cableEditor.hidden = false;
    const x = Math.min(e.clientX, window.innerWidth - this.$cableEditor.offsetWidth - 12);
    const y = Math.min(e.clientY + 8, window.innerHeight - this.$cableEditor.offsetHeight - 12);
    this.$cableEditor.style.left = `${Math.max(12, x)}px`;
    this.$cableEditor.style.top = `${Math.max(12, y)}px`;
    input.focus();
  },

  markActiveSwatch() {
    if (this.editingCable == null) return;
    const current = this.connections[this.editingCable].color || '';
    document.querySelectorAll('#cable-swatches .swatch').forEach((s) => {
      s.classList.toggle('swatch-active', s.dataset.color === current);
    });
  },

  closeCableEditor() {
    this.$cableEditor.hidden = true;
    this.editingCable = null;
  },

  /* ---------------------------------------------------- Carrier bay menu */

  /** Open the fill menu for a carrier bay. `e` is the click event, or null for
   *  keyboard activation (positions off the bay itself). */
  openBayMenu(bay, e) {
    const device = bay.closest('.device.placed');
    const spec = DEVICE_TYPES[device?.dataset.type];
    if (!spec?.slots) return;
    this.editingBay = bay;
    const menu = this.ensureBayMenu();
    const current = bay.dataset.fill || '';
    const opts = subsFor(spec.slots.accepts)
      .map(
        (o) =>
          `<button type="button" class="bay-opt${o.key === current ? ' bay-opt--active' : ''}" data-fill="${o.key}">${escapeHtml(o.name)}</button>`
      )
      .join('');
    menu.innerHTML =
      `<div class="bay-menu-title">Fit component</div>${opts}` +
      `<button type="button" class="bay-opt bay-opt--empty${current ? '' : ' bay-opt--active'}" data-fill="">Leave empty</button>`;

    menu.hidden = false;
    const rect = bay.getBoundingClientRect();
    const px = e ? e.clientX : rect.left;
    const py = e ? e.clientY + 8 : rect.bottom + 6;
    const x = Math.min(px, window.innerWidth - menu.offsetWidth - 12);
    const y = Math.min(py, window.innerHeight - menu.offsetHeight - 12);
    menu.style.left = `${Math.max(12, x)}px`;
    menu.style.top = `${Math.max(12, y)}px`;
    menu.querySelector('.bay-opt--active')?.focus();
  },

  ensureBayMenu() {
    if (this.$bayMenu) return this.$bayMenu;
    const menu = document.createElement('div');
    menu.className = 'bay-menu';
    menu.id = 'bay-menu';
    menu.hidden = true;
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-fill]');
      if (!opt || !this.editingBay) return;
      applyBayFill(this.editingBay, opt.dataset.fill || null);
      const focusTarget = this.editingBay;
      this.closeBayMenu();
      focusTarget.focus();
      this.commit();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !e.target.closest('#bay-menu') && !e.target.closest('[data-action="fill-bay"]')) {
        this.closeBayMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) this.closeBayMenu();
    });
    document.body.appendChild(menu);
    this.$bayMenu = menu;
    return menu;
  },

  closeBayMenu() {
    if (this.$bayMenu) this.$bayMenu.hidden = true;
    this.editingBay = null;
  },

  /* -------------------------------------------------- Custom device modal */

  setupDeviceModal() {
    this.$modal = document.getElementById('device-modal');
    const form = document.getElementById('device-form');
    const portsHost = document.getElementById('cd-ports');

    document.getElementById('btn-new-custom').addEventListener('click', () => this.openDeviceModal());
    document.getElementById('cd-cancel').addEventListener('click', () => this.$modal.close());
    document.getElementById('cd-add-port').addEventListener('click', () => this.addPortRow());

    portsHost.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove-port]')) e.target.closest('.port-row').remove();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitDeviceForm();
    });
  },

  openDeviceModal() {
    document.getElementById('cd-name').value = '';
    document.getElementById('cd-uheight').value = '1';
    document.getElementById('cd-watts').value = '';
    document.getElementById('cd-cooling').value = '';
    document.getElementById('cd-ports').innerHTML = '';
    this.addPortRow();
    this.$modal.showModal();
    document.getElementById('cd-name').focus();
  },

  addPortRow() {
    const row = document.createElement('div');
    row.className = 'port-row';
    const options = Object.entries(PORT_SPECS)
      .map(([key, spec]) => `<option value="${key}">${escapeHtml(spec.title)}</option>`)
      .join('');
    row.innerHTML = `
      <input class="port-count" type="number" min="1" max="48" value="1" aria-label="Port count" />
      <span class="port-times">×</span>
      <select class="port-type" aria-label="Port type">${options}</select>
      <button type="button" class="btn btn-icon" data-remove-port aria-label="Remove port row">×</button>`;
    document.getElementById('cd-ports').appendChild(row);
  },

  submitDeviceForm() {
    const name = document.getElementById('cd-name').value;
    const uHeight = document.getElementById('cd-uheight').value;
    const watts = document.getElementById('cd-watts').value;
    const cooling = document.getElementById('cd-cooling').value;

    const ports = [];
    document.querySelectorAll('#cd-ports .port-row').forEach((row) => {
      const count = Math.max(1, Math.min(48, parseInt(row.querySelector('.port-count').value, 10) || 1));
      const type = row.querySelector('.port-type').value;
      for (let i = 0; i < count; i++) ports.push(type);
    });
    if (ports.length > 48) ports.length = 48;

    CustomDevices.create({ name, uHeight, ports, watts, cooling });
    this.renderCustomSection();
    this.$modal.close();
    Toast.show('Custom device added to the library.');
  },

  /* --------------------------------------------------- Tap-to-place (a11y) */

  togglePlacement(type) {
    this.placingType = this.placingType === type ? null : type;
    this.updatePlacementUi();
  },

  updatePlacementUi() {
    const active = this.placingType;
    document.querySelectorAll('.device-card').forEach((c) => {
      c.classList.toggle('placing', c.dataset.deviceType === active);
    });
    this.$slots.classList.toggle('picking', Boolean(active));
    if (active) {
      this.$hint.hidden = false;
      this.$hint.textContent = `Placing ${DEVICE_TYPES[active].name} — tap a free slot (Esc to cancel).`;
    } else {
      this.$hint.hidden = true;
    }
    this.refreshHalfGrid();
  },

  /* ------------------------------------------------------------ Rack slots */

  renderSlots() {
    this.$slots.innerHTML = '';
    // Half-row grid: two slots per U. Whole-U rows carry the "U" label + rail
    // holes; the intermediate .5 rows are slimmer, unlabeled dividers.
    for (const u of halfRows(this.maxU)) {
      const whole = Number.isInteger(u);
      const row = document.createElement('div');
      row.className = `slot-row${whole ? '' : ' slot-row--half'}`;
      row.innerHTML = `
        <div class="slot${whole ? '' : ' slot--half'}" data-u="${u}" role="listitem" aria-label="Rack unit ${u}">
          ${
            whole
              ? '<span class="rail-screw-hole-l h1"></span><span class="rail-screw-hole-l h2"></span><span class="rail-screw-hole-l h3"></span>' +
                '<span class="rail-screw-hole-r h1"></span><span class="rail-screw-hole-r h2"></span><span class="rail-screw-hole-r h3"></span>'
              : ''
          }
          <div class="slot-bay">${whole ? `U${u}` : ''}</div>
        </div>`;
      this.$slots.appendChild(row);
    }
    // Rack height just changed — refit it to the stage, then resync the physics
    // obstacle for the cabinet. Order matters: fitting moves the cabinet, and
    // the floor is measured from where the cabinet ends up.
    this.fitCameraToStage();
    FreeZone.syncBounds();
  },

  /**
   * Make 100% mean "the whole world fits on screen" (issue #63).
   *
   * A 12U rack used to run off the bottom of the stage. The stage clips at its
   * own box and the physics floor tracks the rack's foot, so the overflow took
   * the floor out of view and fallen devices landed on an invisible ledge part
   * way up. The playground headroom above the rack is NOT the space to take
   * back — it exists so you can stack things on top of the rack — so the camera
   * scales instead: `fitScale` shrinks the view until headroom + rack + footroom
   * all fit, and the user's zoom multiplies on top of it.
   *
   * The world itself is untouched, so this stays a pure camera operation and
   * #46 still holds: FreeZone reads the combined scale through cameraScale().
   */
  fitCameraToStage() {
    const container = document.querySelector('.rack-wrapper-container');
    const stage = document.getElementById('rack-stage');
    if (!container || !stage) return;
    const stageH = stage.clientHeight;
    const worldH = container.offsetHeight; // layout height, unaffected by the camera
    const next = stageH && worldH ? Math.max(FIT_SCALE_MIN, Math.min(1, stageH / worldH)) : 1;
    if (Math.abs(next - this.fitScale) < 0.0005) return;
    this.fitScale = next;
    this.applyCamera();
  },

  /** Total on-screen scale: the fit-to-stage scale times the user's zoom. */
  cameraScale() {
    return this.fitScale * this.zoom;
  },

  applyCamera() {
    this.$camera.style.transform = `scale(${this.cameraScale()})`;
    this.$camera.style.transformOrigin = 'top center';
  },

  bindDelegatedEvents() {
    // Drag & drop onto slots.
    this.$slots.addEventListener('dragover', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    this.$slots.addEventListener('dragleave', (e) => {
      e.target.closest('.slot')?.classList.remove('drag-over');
    });
    this.$slots.addEventListener('drop', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      slot.classList.remove('drag-over');
      this.handleDrop(slot, this.fine(e));
      // A successful dock removes the drag source, so its `dragend` never fires
      // and endDrag() wouldn't run — finish the drag explicitly here instead.
      if (this._dropHandled) this.endDrag();
    });

    // Free-positioning easter egg: dropping a device on the stage but OUTSIDE any
    // rack slot drops it into the physics playground (issue #43).
    const stage = document.getElementById('rack-stage');
    stage.addEventListener('dragover', (e) => {
      if (this.draggedEl && !e.target.closest('.slot')) e.preventDefault();
    });
    stage.addEventListener('drop', (e) => {
      if (e.target.closest('.slot') || !this.draggedEl) return;
      e.preventDefault();
      this.dropIntoFreeZone(e);
      // Spawning/respawning can replace the drag source, killing its `dragend`;
      // end the drag explicitly so the bin and drag state always reset.
      if (this._dropHandled) this.endDrag();
    });

    this.bindDeleteZones();

    // Tap-to-place, device select, duplicate.
    this.$slots.addEventListener('click', (e) => {
      const dup = e.target.closest('[data-action="duplicate"]');
      if (dup) {
        this.selectDevice(dup.closest('.device'), false);
        this.duplicateSelected();
        return;
      }
      const bay = e.target.closest('[data-action="fill-bay"]');
      if (bay) {
        e.stopPropagation();
        this.openBayMenu(bay, e);
        return;
      }
      const slot = e.target.closest('.slot');
      if (this.placingType && slot && !e.target.closest('.device')) {
        this.placeType(this.placingType, Number(slot.dataset.u), this.fine(e));
        return;
      }
      const device = e.target.closest('.device.placed');
      if (device && !e.target.closest('.port-rj45') && !e.target.closest('.port-label')) {
        this.selectDevice(device, e.shiftKey || e.ctrlKey || e.metaKey);
      }
    });

    // Placed-device drag to move.
    this.$slots.addEventListener('dragstart', (e) => {
      const device = e.target.closest('.device.placed');
      if (!device) return;
      this.draggedEl = device;
      this.fromSidebar = false;
      e.dataTransfer.effectAllowed = 'copyMove';
      // The native drag image snapshots the device at its LAYOUT size, ignoring
      // the camera's zoom transform — so dragging a device off a zoomed-out rack
      // produced a ghost far bigger than the thing under the cursor. Same custom
      // ghost the library cards and free devices already use.
      if (this.cameraScale() !== 1) this.setScaledDragImage(e, device);
      device.classList.add('dragging');
      this.beginDrag(device.dataset.type, 'placed');
    });
    this.$slots.addEventListener('dragend', (e) => {
      e.target.closest('.device.placed')?.classList.remove('dragging');
      this.endDrag();
    });

    // Patch-panel label edits (debounced into history).
    this.$slots.addEventListener('input', (e) => {
      if (!e.target.classList.contains('port-label')) return;
      this.refresh();
      clearTimeout(this.labelTimer);
      this.labelTimer = setTimeout(() => this.commit(), 500);
    });

    // Tooltips + cable highlight via delegation (pointer + keyboard).
    this.$slots.addEventListener('pointerover', (e) => {
      this.maybeTooltip(e);
      this.highlightCablesFor(e.target.closest('.device.placed'));
    });
    this.$slots.addEventListener('pointerout', (e) => {
      if (e.target.closest('.port-rj45')) Tooltip.hide();
    });
    this.$slots.addEventListener('pointerleave', () => this.highlightCablesFor(null));
    this.$slots.addEventListener('focusin', (e) => {
      this.maybeTooltip(e);
      this.highlightCablesFor(e.target.closest('.device.placed'));
    });
    this.$slots.addEventListener('focusout', (e) => {
      if (e.target.closest('.port-rj45')) Tooltip.hide();
    });
  },

  maybeTooltip(e) {
    const port = e.target.closest('.port-rj45');
    if (!port || !port.dataset.portId) return;
    const { u, idx } = parsePortId(port.dataset.portId);
    Tooltip.show(port, port.dataset.ptype, u, idx);
  },

  /** Emphasise the cables touching a device; dim the rest. Pass null to clear. */
  highlightCablesFor(device) {
    const u = device ? parseInt(device.parentElement.dataset.u, 10) : null;
    if (this._hlU === u) return;
    this._hlU = u;

    const paths = this.$svg.querySelectorAll('path.cable-path');
    let any = false;
    paths.forEach((p) => {
      const [a, b] = (p.dataset.uPair || '').split('|').map(Number);
      const on = u != null && (a === u || b === u);
      p.classList.toggle('cable-focus', on);
      if (on) any = true;
    });
    this.$svg.classList.toggle('focusing', any);
  },

  handleDrop(slot, fine = false) {
    const dropU = Number(slot.dataset.u);
    if (this.dragOrigin === 'sidebar' && this.draggedEl) {
      this.placeType(this.draggedEl.dataset.deviceType, dropU, fine);
      this._dropHandled = true;
    } else if (this.dragOrigin === 'free') {
      // A lifted free device docking into the rack — identical to a fresh place.
      const type = FreeZone.liftedType();
      const u = snapAnchor(dropU, uHeightOf(type), fine);
      if (!this.canPlace(u, uHeightOf(type))) {
        Toast.show(`Can't place here — needs ${uHeightOf(type)}U of free space.`);
        return; // unhandled → endDrag drops it back into the playground
      }
      const dev = createDevice(type, u);
      const fills = FreeZone.liftedFills();
      this.slot(u).appendChild(dev);
      if (fills) dev.querySelectorAll('.carrier-bay').forEach((bay, i) => applyBayFill(bay, fills[i] || null));
      FreeZone.dropRemoved();
      this._dropHandled = true;
      this.commit();
    } else if (this.draggedEl?.classList.contains('placed')) {
      const type = this.draggedEl.dataset.type;
      const u = snapAnchor(dropU, uHeightOf(type), fine);
      if (!this.canPlace(u, uHeightOf(type), this.draggedEl)) {
        Toast.show(`Can't move here — needs ${uHeightOf(type)}U of free space.`);
        return;
      }
      this.slot(u).appendChild(this.draggedEl);
      this.rebindPorts(this.draggedEl, u);
      this._dropHandled = true;
      this.commit();
    }
  },

  /**
   * Drop a device into the free-positioning playground. A sidebar drag spawns a
   * fresh copy; a placed device is lifted off the rack; a lifted free device
   * simply falls again from the new spot.
   */
  dropIntoFreeZone(e) {
    if (this.dragOrigin === 'sidebar') {
      if (FreeZone.spawn(this.draggedEl.dataset.deviceType, e.clientX, e.clientY)) this._dropHandled = true;
    } else if (this.dragOrigin === 'free') {
      FreeZone.respawn(e.clientX, e.clientY);
      this._dropHandled = true;
    } else if (this.draggedEl?.classList.contains('placed')) {
      const dev = this.draggedEl;
      const fills = [...dev.querySelectorAll('.carrier-bay')].map((b) => b.dataset.fill || null);
      this.detachConnections(dev);
      dev.remove();
      // spawn() commits, capturing both the removal and the new free device.
      FreeZone.spawn(dev.dataset.type, e.clientX, e.clientY, fills.length ? fills : null);
      this._dropHandled = true;
    }
  },

  placeType(type, dropU, fine = false) {
    const uHeight = uHeightOf(type);
    const u = snapAnchor(dropU, uHeight, fine);
    if (!this.canPlace(u, uHeight)) {
      Toast.show(`Can't place — needs ${uHeight}U of free space here.`);
      return;
    }
    this.slot(u).appendChild(createDevice(type, u));
    this.placingType = null;
    this.updatePlacementUi();
    this.commit();
  },

  canPlace(targetU, uHeight, ignore = null) {
    const ignores = ignore ? (Array.isArray(ignore) ? ignore : [ignore]) : [];
    targetU = Number(targetU);
    for (let i = 0; i < uHeight; i += STEP) {
      const u = targetU - i;
      if (u < STEP || u > this.maxU) return false;
      const slot = this.slot(u);
      if (!slot) return false;
      const dev = slot.querySelector('.device');
      if (dev && !ignores.includes(dev)) return false;
      const coveredBy = slot.getAttribute('data-occupied-by');
      if (coveredBy) {
        const covering = this.slot(Number(coveredBy))?.querySelector('.device');
        if (!ignores.includes(covering)) return false;
      }
    }
    return true;
  },

  selectDevice(device, additive = false) {
    if (!additive) {
      document.querySelectorAll('.device.placed.selected').forEach((d) => d.classList.remove('selected'));
      device.classList.add('selected');
    } else {
      device.classList.toggle('selected');
    }
    device.focus();
  },

  selected() {
    return [...document.querySelectorAll('.device.placed.selected')];
  },

  removeDevice(device) {
    if (!device) return;
    this.detachConnections(device);
    device.remove();
    this.commit();
  },

  removeSelected() {
    const selected = this.selected();
    if (selected.length === 0) return;
    selected.forEach((d) => {
      this.detachConnections(d);
      d.remove();
    });
    this.commit();
  },

  detachConnections(device) {
    device.querySelectorAll('.port-rj45').forEach((port) => {
      const id = port.dataset.portId;
      this.connections = this.connections.filter((c) => c.from !== id && c.to !== id);
    });
  },

  moveSelected(direction, fine = false) {
    const selected = this.selected();
    if (selected.length === 0) return;
    const delta = direction * moveStep(fine);
    // Every device must fit at its shifted position, ignoring the moving set.
    const ok = selected.every((d) => this.canPlace(Number(d.parentElement.dataset.u) + delta, uHeightOf(d.dataset.type), selected));
    if (!ok) return;
    // Move in travel order so appends never land on an occupied slot mid-shift.
    const ordered = selected.sort((a, b) => {
      const ua = Number(a.parentElement.dataset.u);
      const ub = Number(b.parentElement.dataset.u);
      return direction > 0 ? ub - ua : ua - ub;
    });
    ordered.forEach((d) => {
      const nu = Number(d.parentElement.dataset.u) + delta;
      this.slot(nu).appendChild(d);
      this.rebindPorts(d, nu);
      this.updateOccupiedSlots();
    });
    ordered[0].focus();
    this.commit();
  },

  duplicateSelected() {
    const selected = this.selected();
    if (selected.length === 0) return;
    let placed = 0;
    selected.forEach((d) => {
      const type = d.dataset.type;
      const u = this.findFreeSlot(uHeightOf(type));
      if (u == null) return;
      const dev = createDevice(type, u);
      const labels = [...d.querySelectorAll('.port-label')].map((i) => i.value);
      const fills = [...d.querySelectorAll('.carrier-bay')].map((b) => b.dataset.fill || null);
      this.slot(u).appendChild(dev);
      dev.querySelectorAll('.port-label').forEach((inp, idx) => (inp.value = labels[idx] ?? ''));
      dev.querySelectorAll('.carrier-bay').forEach((bay, idx) => applyBayFill(bay, fills[idx] || null));
      this.updateOccupiedSlots();
      placed += 1;
    });
    if (placed > 0) this.commit();
    else Toast.show('No free slot to duplicate into.');
  },

  findFreeSlot(uHeight) {
    const step = Number.isInteger(uHeight) ? 1 : STEP;
    for (let u = uHeight; u <= this.maxU; u += step) {
      if (this.canPlace(u, uHeight)) return u;
    }
    return null;
  },

  rebindPorts(device, u) {
    device.querySelectorAll('.port-rj45').forEach((port, idx) => {
      const oldId = port.dataset.portId;
      const newId = makePortId(u, idx);
      port.dataset.portId = newId;
      this.connections.forEach((c) => {
        if (c.from === oldId) c.from = newId;
        if (c.to === oldId) c.to = newId;
      });
    });
  },

  /* ------------------------------------------------------- State lifecycle */

  /** Snapshot the current DOM + connections into a plain state object. */
  getState() {
    // Read devices straight from the DOM so half-U anchors are captured too.
    const rack = [...this.$slots.querySelectorAll('.slot > .device.placed')]
      .map((dev) => {
        const item = {
          u: Number(dev.parentElement.dataset.u),
          type: dev.dataset.type,
          labels: [...dev.querySelectorAll('.port-label')].map((i) => i.value),
        };
        const bays = dev.querySelectorAll('.carrier-bay');
        if (bays.length) item.fills = [...bays].map((b) => b.dataset.fill || null);
        return item;
      })
      .sort((a, b) => b.u - a.u);
    // Free-positioned devices (the physics easter egg) live outside the rack.
    const free = FreeZone.serialize();
    return {
      maxU: this.maxU,
      rack,
      connections: structuredClone(this.connections),
      custom: CustomDevices.usedBy([...rack, ...free]),
      free,
    };
  },

  /** Debounced autosave for physics settling, which never enters undo history. */
  persistFreeSoon() {
    clearTimeout(this._freeSaveTimer);
    this._freeSaveTimer = setTimeout(() => Persistence.save(this.getState()), 400);
  },

  /** Rebuild the rack DOM from a state object. */
  loadState(state, { record = false, resetHistory = false } = {}) {
    // A shared/imported layout may reference custom devices we don't have yet.
    if (CustomDevices.ensureRegistered(state.custom)) this.renderCustomSection();

    this.maxU = state.maxU;
    document.getElementById('input-max-u').value = this.maxU;
    this.renderSlots();

    state.rack.forEach((item) => {
      const slot = this.slot(item.u);
      if (!slot) return;
      const dev = createDevice(item.type, item.u);
      slot.appendChild(dev);
      dev.querySelectorAll('.port-label').forEach((inp, idx) => {
        inp.value = item.labels?.[idx] ?? '';
      });
      if (item.fills) {
        dev.querySelectorAll('.carrier-bay').forEach((bay, idx) => applyBayFill(bay, item.fills[idx] || null));
      }
    });

    FreeZone.load(state.free || []);

    this.connections = structuredClone(state.connections);
    if (resetHistory) {
      this.history = [];
      this.historyIndex = -1;
    }
    if (record) this.pushHistory(this.getState());
    this.refresh();
  },

  /** Record a user action: push a history entry and refresh derived views. */
  commit() {
    this.pushHistory(this.getState());
    this.refresh();
  },

  pushHistory(snapshot) {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.updateUndoRedoButtons();
  },

  undo() {
    if (this.historyIndex <= 0) return;
    this.historyIndex--;
    this.loadState(this.history[this.historyIndex]);
    this.updateUndoRedoButtons();
  },

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex++;
    this.loadState(this.history[this.historyIndex]);
    this.updateUndoRedoButtons();
  },

  updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = this.historyIndex <= 0;
    document.getElementById('btn-redo').disabled = this.historyIndex >= this.history.length - 1;
  },

  /** Recompute all derived views from the current DOM (no history push). */
  refresh() {
    this.updateOccupiedSlots();
    this.pruneConnections();
    this.updateThermalMap();
    this.requestRedraw();
    this.updateReport();
    this.updateCableSchedule();
    this.updateCostSummary();
    this.updateWarnings();
    this.updatePowerSummary();
    Persistence.save(this.getState());
  },

  updateOccupiedSlots() {
    document.querySelectorAll('.slot').forEach((slot) => {
      slot.removeAttribute('data-occupied-by');
      slot.classList.remove('slot-blocked');
      const bay = slot.querySelector('.slot-bay');
      if (bay && !slot.querySelector('.device')) {
        bay.textContent = Number.isInteger(Number(slot.dataset.u)) ? `U${slot.dataset.u}` : '';
        // Clear the inline override so the stylesheet governs visibility: whole-U
        // bays show, half-U bays stay hidden unless the fine grid (.show-half) is
        // active. Forcing 'flex' here would beat that CSS and reveal the .5 rows.
        bay.style.display = '';
      }
    });

    document.querySelectorAll('.slot .device.placed').forEach((dev) => {
      const u = Number(dev.parentElement.dataset.u);
      const uHeight = uHeightOf(dev.dataset.type);
      for (let i = STEP; i < uHeight; i += STEP) {
        const covered = this.slot(u - i);
        if (!covered) continue;
        covered.setAttribute('data-occupied-by', String(u));
        covered.classList.add('slot-blocked');
        const bay = covered.querySelector('.slot-bay');
        if (bay) bay.style.display = 'none';
      }
    });
  },

  pruneConnections() {
    this.connections = this.connections.filter(
      (c) => document.querySelector(`[data-port-id="${c.from}"]`) && document.querySelector(`[data-port-id="${c.to}"]`)
    );
  },

  requestRedraw() {
    if (this.redrawPending) return;
    this.redrawPending = true;
    requestAnimationFrame(() => {
      this.redrawConnections();
      this.redrawPending = false;
    });
  },

  redrawConnections() {
    const svg = this.$svg;
    if (!svg) return;
    svg.querySelectorAll('path.cable-path').forEach((p) => p.remove());
    svg.classList.remove('focusing');
    this._hlU = undefined;
    document.querySelectorAll('.slot .led').forEach((led) => (led.className = 'led'));

    const state = this.getState();
    const map = rackByU(state.rack);
    const organizers = state.rack.filter((d) => d.type === 'brush-panel').map((d) => d.u);
    const counts = { std: 0, xg: 0, wan: 0, sfp: 0, patch: 0, conflict: 0 };

    this.connections.forEach((c, index) => {
      const portA = document.querySelector(`[data-port-id="${c.from}"]`);
      const portB = document.querySelector(`[data-port-id="${c.to}"]`);
      if (!portA || !portB) return;

      const a = getPortCenterInSVG(svg, portA);
      const b = getPortCenterInSVG(svg, portB);

      const uA = portU(c.from);
      const uB = portU(c.to);
      let routeY = null;
      organizers.forEach((uOrg) => {
        if ((uA > uOrg && uOrg > uB) || (uB > uOrg && uOrg > uA)) {
          const org = this.slot(uOrg);
          if (org) routeY = getPortCenterInSVG(svg, org).y;
        }
      });

      const { color: autoColor, kind } = classifyConnection(map, c.from, c.to);
      counts[kind]++;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'cable-path');
      path.dataset.uPair = `${uA}|${uB}`;
      path.dataset.cidx = index;
      path.setAttribute('d', cablePath(a.x, a.y, b.x, b.y, routeY));
      path.setAttribute('stroke', c.color || autoColor);
      if (c.label) {
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = c.label;
        path.appendChild(title);
      }
      path.setAttribute('stroke-width', '2.8');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('filter', 'url(#cable-shadow)');
      svg.appendChild(path);

      this.lightLED(portA);
      this.lightLED(portB);
    });

    document.getElementById('cable-count-badge').textContent = this.connections.length;
    this.$cableBreakdown.innerHTML = `
      ${metricRow('🔵 Standard / PoE', counts.std, 'var(--accent-blue)')}
      ${metricRow('🟠 10G copper', counts.xg, 'var(--accent-orange)')}
      ${metricRow('🔴 WAN uplink', counts.wan, 'var(--accent-red)')}
      ${metricRow('🌐 SFP+ fiber', counts.sfp, 'var(--accent-sfp)')}
      ${metricRow('⚪ Patch jumpers', counts.patch, 'var(--text-muted)')}
      ${metricRow('❌ Media mismatch', counts.conflict, 'var(--accent-red)')}
    `;
  },

  lightLED(port) {
    const led = port.closest('.switch-port-unit')?.querySelector('.led');
    if (!led) return;
    if (port.classList.contains('port-sfp')) led.className = 'led active-cyan blink-slow';
    else if (port.classList.contains('port-10g')) led.className = 'led active-orange blink';
    else if (port.classList.contains('port-poe')) led.className = 'led active-blue blink';
    else led.className = 'led active-green blink';
  },

  updateThermalMap() {
    document.querySelectorAll('.slot').forEach((s) => s.classList.remove('thermal-hotspot'));
    // Two vertically touching devices whose combined heat is high form a hot spot.
    const devices = [...document.querySelectorAll('.slot .device.placed')].map((dev) => {
      const spec = DEVICE_TYPES[dev.dataset.type];
      const u = Number(dev.parentElement.dataset.u);
      const h = uHeightOf(dev.dataset.type);
      return { dev, u, bottom: u - h + STEP, heat: spec.heatWeight ?? 0, cooling: spec.coolingWeight ?? 0 };
    });
    const touching = (a, b) => a.bottom - STEP === b.u || b.bottom - STEP === a.u;

    // Cooling is local, not just a rack-wide figure: a fan pulls heat off
    // whatever it's bolted against, so mounting one between two hot devices
    // breaks the hot spot up while parking it at the other end of the rack
    // doesn't. Effective heat floors at 0 — a fan can't make a device cold.
    for (const d of devices) {
      const adjacentCooling = devices.reduce((sum, o) => (o !== d && touching(d, o) ? sum + o.cooling : sum), 0);
      d.effectiveHeat = Math.max(0, d.heat - adjacentCooling);
    }

    for (let i = 0; i < devices.length; i++) {
      for (let j = i + 1; j < devices.length; j++) {
        const a = devices[i];
        const b = devices[j];
        if (touching(a, b) && a.effectiveHeat + b.effectiveHeat >= 6) {
          a.dev.parentElement.classList.add('thermal-hotspot');
          b.dev.parentElement.classList.add('thermal-hotspot');
        }
      }
    }
  },

  updateReport() {
    this.$report.innerHTML = '';
    // Walk half-rows top-down: list device anchors, and collapse runs of empty
    // half-rows into a single "free" entry.
    let emptyRun = 0;
    const flushEmpty = () => {
      if (emptyRun === 0) return;
      const item = document.createElement('div');
      item.className = 'report-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `<span class="u-badge text-muted">—</span><span class="text-muted">${emptyRun * STEP}U free</span>`;
      this.$report.appendChild(item);
      emptyRun = 0;
    };

    for (const u of halfRows(this.maxU)) {
      const slot = this.slot(u);
      const device = slot?.querySelector('.device');
      const coveredBy = slot?.getAttribute('data-occupied-by');
      if (device) {
        flushEmpty();
        const item = document.createElement('div');
        item.className = 'report-item occupied';
        item.setAttribute('role', 'listitem');
        item.innerHTML = `<span class="u-badge">U${u}</span><span class="text-blue">${DEVICE_TYPES[device.dataset.type].name}</span>`;
        this.$report.appendChild(item);
      } else if (!coveredBy) {
        emptyRun += 1;
      }
    }
    flushEmpty();
    if (!this.$report.children.length) {
      this.$report.innerHTML = '<div class="report-item"><span class="text-muted">Empty rack</span></div>';
    }
  },

  updateCableSchedule() {
    const schedule = computeSchedule(this.getState());
    this.$scheduleCount.textContent = schedule.length;
    if (schedule.length === 0) {
      this.$schedule.innerHTML = '<div class="schedule-empty text-muted">No cables yet.</div>';
      return;
    }
    this.$schedule.innerHTML = schedule
      .map(
        (r) => `<div class="schedule-row" role="listitem" title="${escapeHtml(r.kindLabel)}${r.label ? ' — ' + escapeHtml(r.label) : ''}">
          <span class="sched-end">U${r.from.u}·P${r.from.port}${r.from.label ? ` <em>${escapeHtml(r.from.label)}</em>` : ''}</span>
          <span class="sched-arrow" data-kind="${r.kind}">→</span>
          <span class="sched-end">U${r.to.u}·P${r.to.port}${r.to.label ? ` <em>${escapeHtml(r.to.label)}</em>` : ''}</span>
          ${r.label ? `<span class="sched-tag">${escapeHtml(r.label)}</span>` : ''}
        </div>`
      )
      .join('');
  },

  updateCostSummary() {
    const bom = computeBom(this.getState(), priceFn);
    // Rebuild the editable list only when rack composition changes, so typing
    // in a price field doesn't blow away focus.
    const sig = bom.items.map((i) => `${i.type}:${i.qty}`).join('|');
    if (sig !== this.costSignature) {
      this.renderCostList(bom.items);
      this.costSignature = sig;
    }
    this.updateCostTotals(bom);
  },

  renderCostList(items) {
    if (items.length === 0) {
      this.$costList.innerHTML = '<div class="cost-empty text-muted">Add devices to estimate cost.</div>';
      this.$costNote.textContent = '';
      return;
    }
    this.$costList.innerHTML = items
      .map((i) => {
        const seedVal = Pricing.seedFor(i.type);
        const override = Pricing.isOverridden(i.type) ? Pricing.overrides[i.type] : '';
        return `<div class="cost-row">
          <span class="cost-name" title="${escapeHtml(i.name)}">${escapeHtml(i.name)}</span>
          <span class="cost-qty">×${i.qty}</span>
          <span class="cost-input-wrap">${Pricing.currency === 'USD' ? '$' : ''}<input
            class="cost-input" type="number" min="0" step="1"
            inputmode="decimal" data-type="${i.type}"
            value="${override}" placeholder="${seedVal ?? '0'}"
            aria-label="Unit price for ${escapeHtml(i.name)}"></span>
          <span class="cost-sub" data-cost-sub="${i.type}"></span>
        </div>`;
      })
      .join('');
    this.$costNote.textContent = `Seed prices approximate (${Pricing.currency}, ${Pricing.lastUpdated}) — edit to your quotes.`;
  },

  updateCostTotals(bom) {
    this.$costTotal.textContent = bom.deviceCount === 0 ? '—' : formatMoney(bom.totalCost ?? 0, Pricing.currency);
    bom.items.forEach((i) => {
      const el = this.$costList.querySelector(`[data-cost-sub="${i.type}"]`);
      if (el) el.textContent = i.subtotal != null ? formatMoney(i.subtotal, Pricing.currency) : '—';
    });
  },

  updateWarnings() {
    const warnings = validateRack(this.getState());
    this.$warningsCount.textContent = warnings.length;
    if (warnings.length === 0) {
      this.$warnings.innerHTML = '<div class="warning-ok">✓ No issues detected.</div>';
      return;
    }
    const icon = { error: '❌', warn: '⚠️', info: 'ℹ️' };
    this.$warnings.innerHTML = warnings
      .map(
        (w) => `<div class="warning-item warning-${w.severity}" role="listitem">
          <span class="warning-icon">${icon[w.severity]}</span>
          <span>${escapeHtml(w.message)}</span>
        </div>`
      )
      .join('');
  },

  updatePowerSummary() {
    const state = this.getState();
    const m = computeMetrics(state.rack, this.maxU);
    const poe = computePoe(state);
    const thermalLabel = { cool: '🟢 Cool', warm: '🟡 Warm', high: '🔴 High' }[m.thermalLevel];

    const perSwitch = poe.sources
      .map(
        (s) =>
          `<div class="metric-row metric-sub"><span>↳ ${escapeHtml(s.name)} (U${s.u})</span><strong style="color:${
            s.over ? 'var(--accent-red)' : 'var(--text-color)'
          }">${s.load} / ${s.budget} W · ${s.pct}%</strong></div>`
      )
      .join('');

    const pdu = computePdu(state);
    const pduRows = pdu.hasSource
      ? `${metricRow('PDU outlets', `${pdu.outletsNeeded} / ${pdu.outletsAvail}`, pdu.outletsOver ? 'var(--accent-red)' : undefined)}
         ${metricRow('PDU capacity', `${pdu.load} / ${pdu.capacity} W`, pdu.capacityOver ? 'var(--accent-red)' : undefined)}
         ${pdu.runtimeMin != null ? metricRow('Est. UPS runtime', `${pdu.runtimeMin} min`) : ''}`
      : '';

    this.$power.innerHTML = `
      ${metricRow('Devices', m.deviceCount)}
      ${metricRow('Units used', `${m.usedU} / ${m.maxU} U`)}
      ${metricRow('Est. power draw', `${m.totalWatts} W`)}
      ${metricRow('PoE supply', `${poe.totalBudget} W`)}
      ${metricRow('PoE load', `${poe.totalLoad} W`)}
      ${perSwitch}
      ${pduRows}
      ${m.cooling > 0 ? metricRow('Cooling', `−${m.cooling} of ${m.grossHeat} heat`) : ''}
      ${metricRow('Thermal load', thermalLabel)}
    `;
  },

  /* ----------------------------------------------------------- Controls */

  bindGlobalControls() {
    // The stage is sized off the viewport, so its height changes with the
    // window — refit the rack before FreeZone re-measures the floor from it.
    window.addEventListener('resize', () => {
      this.fitCameraToStage();
      FreeZone.syncBounds();
    });

    document.getElementById('input-max-u').addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) val = 6;
      val = Math.max(1, Math.min(16, val));
      e.target.value = val;
      this.changeMaxU(val);
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => this.setZoom(this.zoom + 0.1));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.setZoom(this.zoom - 0.1));
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.setZoom(1));
    document.getElementById('btn-face').addEventListener('click', () => this.toggleFace());

    document.getElementById('btn-collapse-left').addEventListener('click', (e) => this.toggleSidebar('left', e.currentTarget));
    document.getElementById('btn-collapse-right').addEventListener('click', (e) => this.toggleSidebar('right', e.currentTarget));

    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (this.getState().rack.length === 0 && this.connections.length === 0 && FreeZone.count() === 0) return;
      if (confirm('Clear the entire rack?')) {
        document.querySelectorAll('.slot .device').forEach((d) => d.remove());
        this.connections = [];
        FreeZone.clear(); // also sweep away any fallen free devices
        this.commit();
      }
    });

    document.getElementById('btn-export-png').addEventListener('click', (e) => exportPNG(e.currentTarget));
    document.getElementById('btn-export-bom').addEventListener('click', () => this.downloadBom());
    document.getElementById('btn-copy-bom').addEventListener('click', () => this.copyBom());
    this.$costList.addEventListener('input', (e) => {
      const input = e.target.closest('.cost-input');
      if (!input) return;
      Pricing.setPrice(input.dataset.type, input.value);
      // Recompute totals only — don't rebuild the list, to keep focus.
      this.updateCostTotals(computeBom(this.getState(), priceFn));
    });

    document.getElementById('btn-export-schedule').addEventListener('click', () => this.downloadSchedule());
    document.getElementById('btn-copy-schedule').addEventListener('click', () => this.copySchedule());
    document.getElementById('btn-copy-report').addEventListener('click', () => this.copyReport());
    document.getElementById('btn-share').addEventListener('click', () => this.copyShareLink());
    document.getElementById('btn-export-json').addEventListener('click', () => this.downloadJSON());

    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-import-json').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.importJSON(e.target.files[0]));

    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // The fine (0.5U) grid is an explicit toggle — reliable in every browser,
    // unlike hold-to-reveal which browsers deliver too unreliably to trust.
    document.getElementById('btn-fine-grid').addEventListener('click', () => this.toggleFineGrid());
  },

  /** Whether a placement/drag/move should snap to the 0.5U grid: the sticky
   *  toggle, or a per-event Shift/Alt override (read at event time). */
  fine(e) {
    return this._fineMode || fineMode(e);
  },

  /** Toggle the sticky ½U grid (button / "G"). */
  toggleFineGrid(on = !this._fineMode) {
    this._fineMode = on;
    const btn = document.getElementById('btn-fine-grid');
    btn.classList.toggle('btn-active', on);
    btn.setAttribute('aria-pressed', String(on));
    this.refreshHalfGrid();
  },

  /**
   * Show the fine (0.5U) grid when it's relevant: the toggle is on, or a sub-1U
   * device is being dragged or is armed for tap-to-place. Otherwise the rack
   * reads as a clean 1U grid.
   */
  refreshHalfGrid() {
    const placingFractional = this.placingType && !Number.isInteger(uHeightOf(this.placingType));
    const show = this._fineMode || this._fractionalDrag || placingFractional;
    this.$slots.classList.toggle('show-half', Boolean(show));
  },

  beginDrag(type, origin = 'sidebar') {
    this.dragOrigin = origin;
    this._dropHandled = false;
    this._dragLeftWindow = false;
    // The bin is a delete affordance — only meaningful for something already placed.
    if (origin !== 'sidebar') document.getElementById('drag-bin')?.removeAttribute('hidden');
    this._fractionalDrag = !Number.isInteger(uHeightOf(type));
    this.refreshHalfGrid();
  },

  endDrag() {
    // Resolve an unhandled release: off-window deletes; a lifted free device that
    // found no home falls back into the playground.
    if (!this._dropHandled) {
      if (this._dragLeftWindow) this.deleteDragged();
      else if (this.dragOrigin === 'free') FreeZone.cancelDrag();
    }
    document.getElementById('drag-bin')?.setAttribute('hidden', '');
    document.getElementById('drag-bin')?.classList.remove('drag-over');
    this.dragOrigin = null;
    this._dropHandled = false;
    this._dragLeftWindow = false;
    this._fractionalDrag = false;
    this.refreshHalfGrid();
  },

  /**
   * Give a drag an upright drag image scaled to the current zoom. Two sources
   * need this: a library card (its sidebar is never zoomed, so the native
   * preview shows 100%) and a picked-up fallen device (the native preview
   * ignores the zone's zoom transform, and would keep the body's rotation). We
   * snapshot an upright, zoom-scaled clone so the preview matches how the device
   * looks once dropped. Sizing uses offsetWidth/Height — the intrinsic layout
   * size, unaffected by any ancestor CSS transform.
   */
  setScaledDragImage(e, deviceEl) {
    if (!deviceEl || !e.dataTransfer) return;
    const z = this.cameraScale();
    const vis = deviceEl.getBoundingClientRect(); // visual rect, for the grab hotspot
    const iw = deviceEl.offsetWidth || 240;
    const ih = deviceEl.offsetHeight || 38;
    const ghost = document.createElement('div');
    ghost.style.cssText = `position:absolute;top:-10000px;left:-10000px;pointer-events:none;width:${iw * z}px;height:${ih * z}px;overflow:hidden;`;
    const clone = deviceEl.cloneNode(true);
    clone.style.position = 'static';
    clone.style.margin = '0';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = `${iw}px`;
    clone.style.opacity = '1'; // in case the source is dimmed while lifted
    clone.style.transform = `scale(${z})`; // upright — strips any rotation
    clone.style.transformOrigin = 'top left';
    ghost.appendChild(clone);
    document.body.appendChild(ghost);
    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    const fx = vis.width ? clamp01((e.clientX - vis.left) / vis.width) : 0.5;
    const fy = vis.height ? clamp01((e.clientY - vis.top) / vis.height) : 0.2;
    e.dataTransfer.setDragImage(ghost, fx * iw * z, fy * ih * z);
    setTimeout(() => ghost.remove(), 0); // remove once the browser has snapshotted it
  },

  /**
   * Wire up drag-to-delete: the bin, the library/inspector panels, and dragging
   * off the window all remove a placed or lifted device. Also lifts a fallen
   * free device into a normal drag when the user picks it up.
   */
  bindDeleteZones() {
    // Lifting a fallen device: mirror a fresh library drag so it can be re-racked.
    const zone = document.getElementById('free-zone');
    zone.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.free-device');
      if (!el) return;
      const info = FreeZone.beginDrag(el);
      if (!info) return;
      this.draggedEl = el;
      this.fromSidebar = false;
      e.dataTransfer.effectAllowed = 'copyMove';
      // The native preview ignores the zone's zoom and keeps the body's tilt;
      // use an upright, zoom-matched ghost so it matches how it'll drop.
      this.setScaledDragImage(e, el);
      this.beginDrag(info.type, 'free');
    });
    zone.addEventListener('dragend', () => this.endDrag());

    // Track leaving/re-entering the window so an off-screen release deletes.
    document.addEventListener('dragover', () => {
      this._dragLeftWindow = false;
    });
    document.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) this._dragLeftWindow = true;
    });

    // Explicit delete targets: the bin plus the two side panels ("back to library").
    const asDeleteTarget = (el) => {
      if (!el) return;
      el.addEventListener('dragover', (e) => {
        if (this.dragOrigin === 'placed' || this.dragOrigin === 'free') {
          e.preventDefault();
          el.classList.add('drag-over');
        }
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        if (this.dragOrigin !== 'placed' && this.dragOrigin !== 'free') return;
        e.preventDefault();
        el.classList.remove('drag-over');
        this.deleteDragged();
        // Deleting removes the drag source before `dragend` can fire; end the
        // drag here so the bin hides and drag state resets.
        this.endDrag();
      });
    };
    asDeleteTarget(document.getElementById('drag-bin'));
    asDeleteTarget(document.querySelector('.sidebar'));
    asDeleteTarget(document.querySelector('.right-bar'));
  },

  /** Delete whatever is being dragged (a placed device or a lifted free device). */
  deleteDragged() {
    if (this._dropHandled) return;
    if (this.dragOrigin === 'placed' && this.draggedEl) {
      this.detachConnections(this.draggedEl);
      this.draggedEl.remove();
      this._dropHandled = true;
      this.commit();
    } else if (this.dragOrigin === 'free') {
      FreeZone.dropRemoved();
      this._dropHandled = true;
      this.commit();
    }
  },

  handleKeydown(e) {
    const editing = document.activeElement?.tagName === 'INPUT';
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      if (this.selected().length) {
        e.preventDefault();
        this.duplicateSelected();
      }
      return;
    }
    if (editing) return;

    if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      this.toggleFineGrid();
      return;
    }

    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.dataset?.action === 'fill-bay') {
      e.preventDefault();
      this.openBayMenu(document.activeElement, null);
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selected().length) {
        e.preventDefault();
        this.removeSelected();
      }
    } else if (e.key === 'ArrowUp' && this.selected().length) {
      e.preventDefault();
      this.moveSelected(1, this.fine(e));
    } else if (e.key === 'ArrowDown' && this.selected().length) {
      e.preventDefault();
      this.moveSelected(-1, this.fine(e));
    } else if (e.key === 'Escape') {
      if (this.placingType) {
        this.placingType = null;
        this.updatePlacementUi();
      } else {
        this.selected().forEach((d) => d.classList.remove('selected'));
      }
    }
  },

  /** Collapse/expand a side panel to give the physics playground more room. */
  toggleSidebar(side, btn) {
    const collapsed = document.querySelector('.workspace').classList.toggle(`${side}-collapsed`);
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.textContent = collapsed ? (side === 'left' ? '⟩' : '⟨') : side === 'left' ? '⟨' : '⟩';
    // The stage — and so the play area — just changed width.
    FreeZone.syncBounds();
    this.requestRedraw();
  },

  toggleFace() {
    const rear = this.$wrapper.classList.toggle('rear-view');
    // Fallen devices flip with the rack, so the whole scene shares one face...
    document.getElementById('free-zone')?.classList.toggle('rear-view', rear);
    // ...and mirror their positions left↔right, since the rear is a mirror image.
    FreeZone.mirror();
    const btn = document.getElementById('btn-face');
    btn.textContent = rear ? '🔀 Rear' : '🔀 Front';
    btn.setAttribute('aria-pressed', String(rear));
  },

  setZoom(z) {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 10) / 10));
    // Zoom is a pure camera operation: one transform on the container that wraps
    // BOTH the rack and the physics playground, so they scale together about the
    // exact same origin. The simulation itself lives in unscaled world space and
    // is deliberately NOT resynced here (issue #46) — the world has fixed extents,
    // so zooming changes only what you see. FreeZone maps client↔world
    // coordinates through cameraScale() for input only.
    //
    // The user's zoom multiplies the fit-to-stage scale rather than replacing
    // it, so 100% always means "the whole world on screen" (issue #63).
    this.applyCamera();
    const pct = Math.round(this.zoom * 100);
    // The readout is also the reset control (issue #49). Its text is the live
    // region that announces zoom changes; the button's label has to spell out
    // both the current level and what pressing it does, since "100%" alone
    // tells a screen-reader user nothing about the action.
    document.getElementById('zoom-label').textContent = `${pct}%`;
    document.getElementById('btn-zoom-reset').setAttribute('aria-label', `Zoom ${pct}%. Activate to zoom to 100%.`);
    this.requestRedraw();
  },

  changeMaxU(newMaxU) {
    if (newMaxU === this.maxU) return;
    const state = this.getState();
    state.maxU = newMaxU;
    state.rack = state.rack.filter((item) => item.u <= newMaxU);
    this.loadState(state, { record: true });
  },

  copyReport() {
    const rack = this.getState().rack;
    let report = `Mini Rack Simulator — Assembly Report (${this.maxU}U)\n`;
    report += '='.repeat(48) + '\n';
    if (rack.length === 0) report += '(empty rack)\n';
    rack
      .slice()
      .reverse()
      .forEach((r) => (report += `[U${r.u}] ${DEVICE_TYPES[r.type].name}\n`));
    report += `\nCables: ${this.connections.length}`;
    this.copyText(report, 'Report copied to clipboard.');
  },

  downloadBom() {
    const bom = computeBom(this.getState(), priceFn);
    if (bom.deviceCount === 0) {
      Toast.show('Rack is empty — nothing to export.');
      return;
    }
    downloadText(bomToCsv(bom), `rack-bom-${dateStamp()}.csv`, 'text/csv');
  },

  copyBom() {
    const bom = computeBom(this.getState(), priceFn);
    if (bom.deviceCount === 0) {
      Toast.show('Rack is empty — nothing to export.');
      return;
    }
    this.copyText(bomToCsv(bom), 'Bill of Materials copied to clipboard.');
  },

  downloadSchedule() {
    const schedule = computeSchedule(this.getState());
    if (schedule.length === 0) {
      Toast.show('No cables to export.');
      return;
    }
    downloadText(scheduleToCsv(schedule), `rack-cable-schedule-${dateStamp()}.csv`, 'text/csv');
  },

  copySchedule() {
    const schedule = computeSchedule(this.getState());
    if (schedule.length === 0) {
      Toast.show('No cables to export.');
      return;
    }
    this.copyText(scheduleToCsv(schedule), 'Cable schedule copied to clipboard.');
  },

  copyShareLink() {
    const url = Persistence.buildShareUrl(this.getState());
    this.copyText(url, 'Share link copied to clipboard.');
  },

  copyText(text, successMsg) {
    navigator.clipboard?.writeText(text).then(
      () => Toast.show(successMsg),
      () => Toast.show('Copy failed — clipboard unavailable.')
    );
  },

  downloadJSON() {
    downloadText(Persistence.toJSON(this.getState()), `rack-${dateStamp()}.json`, 'application/json');
  },

  async importJSON(file) {
    if (!file) return;
    try {
      const text = await file.text();
      this.loadState(Persistence.fromJSON(text), { record: true });
      Toast.show('Layout imported.');
    } catch {
      Toast.show('Import failed — invalid JSON file.');
    }
    document.getElementById('file-import').value = '';
  },

  slot(u) {
    return this.$slots.querySelector(`.slot[data-u="${u}"]`);
  },
};

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)}`;
  }
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function metricRow(label, value, color) {
  const style = color ? ` style="color:${color}"` : '';
  return `<div class="metric-row"><span>${label}</span><strong${style}>${value}</strong></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
