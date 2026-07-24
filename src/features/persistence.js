const STORAGE_KEY = 'rack_sim_state_v3';
const LAYOUTS_KEY = 'rack_sim_layouts_v1';

/** Serialise/restore rack state to localStorage, a share URL, or a JSON file. */
export const Persistence = {
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable — non-fatal */
    }
  },

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return normalize(JSON.parse(raw));
    } catch {
      return null;
    }
  },

  /** Read state encoded in the URL hash (#s=...), if present. */
  loadFromUrl() {
    const match = location.hash.match(/[#&]s=([^&]+)/);
    if (!match) return null;
    try {
      return normalize(JSON.parse(decodeState(match[1])));
    } catch {
      return null;
    }
  },

  clearUrl() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  },

  buildShareUrl(state) {
    return `${location.origin}${location.pathname}#s=${encodeState(JSON.stringify(state))}`;
  },

  // --- Named layouts (separate from the autosaved working layout) ---

  listLayouts() {
    return Object.keys(this._layouts()).sort((a, b) => a.localeCompare(b));
  },

  saveLayout(name, state) {
    const all = this._layouts();
    all[name] = state;
    this._writeLayouts(all);
  },

  loadLayout(name) {
    const state = this._layouts()[name];
    return state ? normalize(state) : null;
  },

  deleteLayout(name) {
    const all = this._layouts();
    delete all[name];
    this._writeLayouts(all);
  },

  _layouts() {
    try {
      return JSON.parse(localStorage.getItem(LAYOUTS_KEY)) || {};
    } catch {
      return {};
    }
  },

  _writeLayouts(all) {
    try {
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(all));
    } catch {
      /* non-fatal */
    }
  },

  toJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  fromJSON(text) {
    return normalize(JSON.parse(text));
  },
};

// Base64url encoding of a UTF-8 string, safe for URLs.
function encodeState(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(encoded) {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Coerce arbitrary parsed data into a valid state object. */
function normalize(data) {
  const maxU = clamp(Math.round(Number(data?.maxU) || 6), 1, 16);
  const rack = Array.isArray(data?.rack)
    ? data.rack
        .filter((r) => r && typeof r.type === 'string' && Number.isFinite(r.u))
        .map((r) => ({ u: r.u, type: r.type, labels: Array.isArray(r.labels) ? r.labels : [] }))
    : [];
  const connections = Array.isArray(data?.connections)
    ? data.connections
        .filter((c) => c && typeof c.from === 'string' && typeof c.to === 'string')
        .map((c) => {
          const out = { from: c.from, to: c.to };
          if (typeof c.label === 'string' && c.label) out.label = c.label;
          if (typeof c.color === 'string' && c.color) out.color = c.color;
          return out;
        })
    : [];
  const custom = Array.isArray(data?.custom) ? data.custom.filter((d) => d && typeof d.type === 'string' && Array.isArray(d.ports)) : [];
  return { maxU, rack, connections, custom };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
