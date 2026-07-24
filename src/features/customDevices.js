import { DEVICE_TYPES } from '../data/devices.js';

const KEY = 'rack_sim_custom_devices_v1';

/**
 * User-defined devices. Definitions follow the same shape as the built-in
 * catalog and are merged into DEVICE_TYPES at runtime, so rendering, metrics,
 * cabling, and reports treat them exactly like stock gear.
 *
 * Custom defs persist locally (sidebar) and also travel inside exported/shared
 * state (`ensureRegistered`) so a shared layout renders on someone else's machine.
 *
 * The optional `asin`/`amazonSearch` fields are accepted and round-tripped but
 * unused today — room for a future purchase layer.
 */
export const CustomDevices = {
  registry: {},

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY)) || {};
      Object.values(saved).forEach((def) => this._install(def));
    } catch {
      /* ignore malformed storage */
    }
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.registry));
    } catch {
      /* non-fatal */
    }
  },

  list() {
    return Object.values(this.registry);
  },

  isCustom(type) {
    return type in this.registry;
  },

  def(type) {
    return this.registry[type] || null;
  },

  _install(def) {
    if (!def || !def.type) return;
    this.registry[def.type] = def;
    DEVICE_TYPES[def.type] = def;
  },

  create({ name, uHeight, ports, watts }) {
    const cleanName = (name || '').trim() || 'Custom Device';
    const portList = Array.isArray(ports) ? ports : [];
    const w = Number(watts) || 0;
    const def = {
      type: `custom-${slug(cleanName)}-${Date.now().toString(36)}`,
      name: cleanName,
      ports: portList,
      uHeight: clamp(uHeight, 1, 3),
      bracket: true,
      bracketWidth: clamp(60 + portList.length * 20, 90, 280),
      watts: w,
      poeBudget: 0,
      heatWeight: w > 20 ? 3 : w > 0 ? 1 : 0,
      custom: true,
    };
    this._install(def);
    this.save();
    return def;
  },

  remove(type) {
    delete this.registry[type];
    delete DEVICE_TYPES[type];
    this.save();
  },

  /** Register any custom defs carried by an imported/shared state. */
  ensureRegistered(defs = []) {
    let added = false;
    defs.forEach((def) => {
      if (def?.type && def.custom && !this.registry[def.type]) {
        this._install(def);
        added = true;
      }
    });
    if (added) this.save();
    return added;
  },

  /** Custom defs referenced by a rack, for embedding in exported state. */
  usedBy(rack) {
    const types = new Set(rack.map((r) => r.type));
    return this.list().filter((def) => types.has(def.type));
  },
};

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'device'
  );
}

function clamp(n, lo, hi) {
  const parsed = parseInt(n, 10);
  return Math.max(lo, Math.min(hi, Number.isNaN(parsed) ? lo : parsed));
}
