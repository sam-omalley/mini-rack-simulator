import { DEVICE_TYPES, PORT_SPECS, CATEGORIES, uHeightOf } from './data/devices.js';
import { CustomDevices } from './features/customDevices.js';
import { createDevice } from './render/deviceFactory.js';
import { computeMetrics } from './render/metrics.js';
import { CableManager } from './render/cableManager.js';
import { classifyConnection, rackByU } from './render/cableClassify.js';
import { Persistence } from './features/persistence.js';
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

export const App = {
  connections: [],
  maxU: 6,
  zoom: 1,
  draggedEl: null,
  fromSidebar: false,
  placingType: null,
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
    this.setupLayouts();
    this.bindGlobalControls();
    this.bindDelegatedEvents();
    CableManager.init(this);

    // Priority: shared URL > saved session > empty rack.
    const initial = Persistence.loadFromUrl() || Persistence.load() || { maxU: 6, rack: [], connections: [] };
    if (Persistence.loadFromUrl()) Toast.show('Loaded a shared rack layout.');
    this.loadState(initial, { record: true, resetHistory: true });
  },

  cacheDom() {
    this.$slots = document.getElementById('slots-container');
    this.$svg = document.getElementById('cable-svg');
    this.$wrapper = document.getElementById('rack-wrapper');
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
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
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

    const ports = [];
    document.querySelectorAll('#cd-ports .port-row').forEach((row) => {
      const count = Math.max(1, Math.min(48, parseInt(row.querySelector('.port-count').value, 10) || 1));
      const type = row.querySelector('.port-type').value;
      for (let i = 0; i < count; i++) ports.push(type);
    });
    if (ports.length > 48) ports.length = 48;

    CustomDevices.create({ name, uHeight, ports, watts });
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
  },

  /* ------------------------------------------------------------ Rack slots */

  renderSlots() {
    this.$slots.innerHTML = '';
    for (let u = this.maxU; u >= 1; u--) {
      const row = document.createElement('div');
      row.className = 'slot-row';
      row.innerHTML = `
        <div class="slot" data-u="${u}" role="listitem" aria-label="Rack unit ${u}">
          <span class="rail-screw-hole-l h1"></span><span class="rail-screw-hole-l h2"></span><span class="rail-screw-hole-l h3"></span>
          <span class="rail-screw-hole-r h1"></span><span class="rail-screw-hole-r h2"></span><span class="rail-screw-hole-r h3"></span>
          <div class="slot-bay">U${u}</div>
        </div>`;
      this.$slots.appendChild(row);
    }
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
      this.handleDrop(slot);
    });

    // Tap-to-place, device select, delete.
    this.$slots.addEventListener('click', (e) => {
      const del = e.target.closest('[data-action="delete"]');
      if (del) {
        this.removeDevice(del.closest('.device'));
        return;
      }
      const slot = e.target.closest('.slot');
      if (this.placingType && slot && !e.target.closest('.device')) {
        this.placeType(this.placingType, parseInt(slot.dataset.u, 10));
        return;
      }
      const device = e.target.closest('.device.placed');
      if (device && !e.target.closest('.port-rj45') && !e.target.closest('.port-label')) {
        this.selectDevice(device);
      }
    });

    // Placed-device drag to move.
    this.$slots.addEventListener('dragstart', (e) => {
      const device = e.target.closest('.device.placed');
      if (!device) return;
      this.draggedEl = device;
      this.fromSidebar = false;
      e.dataTransfer.effectAllowed = 'move';
      device.classList.add('dragging');
    });
    this.$slots.addEventListener('dragend', (e) => {
      e.target.closest('.device.placed')?.classList.remove('dragging');
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
      this.maybeTooltip(e, true);
      this.highlightCablesFor(e.target.closest('.device.placed'));
    });
    this.$slots.addEventListener('pointerout', (e) => {
      if (e.target.closest('.port-rj45')) Tooltip.hide();
    });
    this.$slots.addEventListener('pointerleave', () => this.highlightCablesFor(null));
    this.$slots.addEventListener('focusin', (e) => {
      this.maybeTooltip(e, false);
      this.highlightCablesFor(e.target.closest('.device.placed'));
    });
    this.$slots.addEventListener('focusout', (e) => {
      if (e.target.closest('.port-rj45')) Tooltip.hide();
    });
  },

  maybeTooltip(e, isPointer) {
    const port = e.target.closest('.port-rj45');
    if (!port || !port.dataset.portId) return;
    const [uPart, pPart] = port.dataset.portId.split('-');
    Tooltip.show(port, port.dataset.ptype, parseInt(uPart.slice(1), 10), parseInt(pPart.slice(1), 10));
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

  handleDrop(slot) {
    const u = parseInt(slot.dataset.u, 10);
    if (this.fromSidebar && this.draggedEl) {
      this.placeType(this.draggedEl.dataset.deviceType, u);
    } else if (this.draggedEl?.classList.contains('placed')) {
      const type = this.draggedEl.dataset.type;
      if (!this.canPlace(u, uHeightOf(type), this.draggedEl)) {
        Toast.show(`Can't move here — needs ${uHeightOf(type)}U of free space.`);
        return;
      }
      slot.appendChild(this.draggedEl);
      this.rebindPorts(this.draggedEl, u);
      this.commit();
    }
  },

  placeType(type, u) {
    const uHeight = uHeightOf(type);
    if (!this.canPlace(u, uHeight)) {
      Toast.show(`Can't place — needs ${uHeight}U of free space here.`);
      return;
    }
    const slot = this.slot(u);
    slot.appendChild(createDevice(type, u));
    this.placingType = null;
    this.updatePlacementUi();
    this.commit();
  },

  canPlace(targetU, uHeight, ignore = null) {
    targetU = parseInt(targetU, 10);
    for (let i = 0; i < uHeight; i++) {
      const u = targetU - i;
      if (u < 1 || u > this.maxU) return false;
      const slot = this.slot(u);
      if (!slot) return false;
      const dev = slot.querySelector('.device');
      if (dev && dev !== ignore) return false;
      const coveredBy = slot.getAttribute('data-occupied-by');
      if (coveredBy && !(ignore && ignore.parentElement?.dataset.u === coveredBy)) return false;
    }
    return true;
  },

  selectDevice(device) {
    document.querySelectorAll('.device.placed.selected').forEach((d) => d.classList.remove('selected'));
    device.classList.add('selected');
    device.focus();
  },

  removeDevice(device) {
    if (!device) return;
    device.querySelectorAll('.port-rj45').forEach((port) => {
      const id = port.dataset.portId;
      this.connections = this.connections.filter((c) => c.from !== id && c.to !== id);
    });
    device.remove();
    this.commit();
  },

  moveSelected(direction) {
    const device = document.querySelector('.device.placed.selected');
    if (!device) return;
    const fromU = parseInt(device.parentElement.dataset.u, 10);
    const type = device.dataset.type;
    const uHeight = uHeightOf(type);
    const targetU = fromU + direction;
    if (!this.canPlace(targetU, uHeight, device)) return;
    this.slot(targetU).appendChild(device);
    this.rebindPorts(device, targetU);
    device.focus();
    this.commit();
  },

  rebindPorts(device, u) {
    device.querySelectorAll('.port-rj45').forEach((port, idx) => {
      const oldId = port.dataset.portId;
      const newId = `u${u}-p${idx}`;
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
    const rack = [];
    for (let u = 1; u <= this.maxU; u++) {
      const dev = this.slot(u)?.querySelector('.device');
      if (dev) {
        const labels = [...dev.querySelectorAll('.port-label')].map((i) => i.value);
        rack.push({ u, type: dev.dataset.type, labels });
      }
    }
    return {
      maxU: this.maxU,
      rack,
      connections: structuredClone(this.connections),
      custom: CustomDevices.usedBy(rack),
    };
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
    });

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
        bay.textContent = `U${slot.dataset.u}`;
        bay.style.display = 'flex';
      }
    });

    document.querySelectorAll('.slot .device.placed').forEach((dev) => {
      const u = parseInt(dev.parentElement.dataset.u, 10);
      const uHeight = uHeightOf(dev.dataset.type);
      for (let i = 1; i < uHeight; i++) {
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

      const uA = parseInt(c.from.split('-')[0].slice(1), 10);
      const uB = parseInt(c.to.split('-')[0].slice(1), 10);
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
    for (let u = 1; u < this.maxU; u++) {
      const dev1 = this.slot(u)?.querySelector('.device');
      const dev2 = this.slot(u + 1)?.querySelector('.device');
      if (!dev1 || !dev2) continue;
      const h1 = DEVICE_TYPES[dev1.dataset.type].heatWeight ?? 0;
      const h2 = DEVICE_TYPES[dev2.dataset.type].heatWeight ?? 0;
      if (h1 + h2 >= 6) {
        this.slot(u).classList.add('thermal-hotspot');
        this.slot(u + 1).classList.add('thermal-hotspot');
      }
    }
  },

  updateReport() {
    this.$report.innerHTML = '';
    for (let u = this.maxU; u >= 1; u--) {
      const slot = this.slot(u);
      const device = slot?.querySelector('.device');
      const coveredBy = slot?.getAttribute('data-occupied-by');
      const item = document.createElement('div');
      item.className = 'report-item';
      item.setAttribute('role', 'listitem');
      if (device) {
        item.classList.add('occupied');
        item.innerHTML = `<span class="u-badge">U${u}</span><span class="text-blue">${DEVICE_TYPES[device.dataset.type].name}</span>`;
      } else if (coveredBy) {
        item.innerHTML = `<span class="u-badge text-muted">U${u}</span><span class="text-muted">↳ covered by U${coveredBy}</span>`;
      } else {
        item.innerHTML = `<span class="u-badge text-muted">U${u}</span><span class="text-muted">empty</span>`;
      }
      this.$report.appendChild(item);
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
      ${metricRow('Thermal load', thermalLabel)}
    `;
  },

  /* ----------------------------------------------------------- Controls */

  bindGlobalControls() {
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

    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (this.getState().rack.length === 0 && this.connections.length === 0) return;
      if (confirm('Clear the entire rack?')) {
        document.querySelectorAll('.slot .device').forEach((d) => d.remove());
        this.connections = [];
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
    if (editing) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = document.querySelector('.device.placed.selected');
      if (selected) {
        e.preventDefault();
        this.removeDevice(selected);
      }
    } else if (e.key === 'ArrowUp' && document.querySelector('.device.placed.selected')) {
      e.preventDefault();
      this.moveSelected(1);
    } else if (e.key === 'ArrowDown' && document.querySelector('.device.placed.selected')) {
      e.preventDefault();
      this.moveSelected(-1);
    } else if (e.key === 'Escape' && this.placingType) {
      this.placingType = null;
      this.updatePlacementUi();
    }
  },

  toggleFace() {
    const rear = this.$wrapper.classList.toggle('rear-view');
    const btn = document.getElementById('btn-face');
    btn.textContent = rear ? '🔀 Rear' : '🔀 Front';
    btn.setAttribute('aria-pressed', String(rear));
  },

  setZoom(z) {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 10) / 10));
    this.$wrapper.style.transform = `scale(${this.zoom})`;
    this.$wrapper.style.transformOrigin = 'top center';
    document.getElementById('zoom-label').textContent = `${Math.round(this.zoom * 100)}%`;
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
