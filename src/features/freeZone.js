import Matter from 'matter-js';
import { createDevice, applyBayFill } from '../render/deviceFactory.js';

const { Engine, Runner, Composite, Bodies, Events } = Matter;

// Static-body thickness for the floor/walls, and how far off-screen the walls
// sit so nothing visibly clips the zone edge.
const WALL = 200;
// Physics tuning: gentle bounce, enough friction that stacks don't slide apart.
const BODY_OPTS = { restitution: 0.15, friction: 0.6, frictionStatic: 0.8, density: 0.0016 };

/**
 * The "free positioning" easter egg (issue #43). Dropping a device outside the
 * rack drops it into a little 2D physics playground where devices fall, collide,
 * and stack — including piling on top of the rack itself. Free devices are pure
 * fun: they sit in their own overlay and do NOT count toward power/thermal/BoM,
 * but their positions DO persist through save + share-links.
 *
 * Rendering is DOM-based: each Matter body maps to an absolutely-positioned
 * device clone whose transform we sync every physics tick. Free devices are
 * native-draggable (HTML5 DnD), so picking a fallen one up behaves exactly like
 * dragging a fresh device from the library — app.js drives the lift/drop flow.
 */
export const FreeZone = {
  app: null,
  zone: null,
  engine: null,
  runner: null,
  items: new Map(), // body -> { el, type, fills }
  statics: [],
  lifted: null, // the device currently picked up (removed from simulation)
  _running: false,
  _calmTicks: 0,

  init(app) {
    this.app = app;
    this.zone = document.getElementById('free-zone');
    if (!this.zone) return;

    this.engine = Engine.create();
    this.engine.gravity.y = 1;
    this.runner = Runner.create();
    this.items = new Map();

    // Sync DOM transforms to body positions after every physics step.
    Events.on(this.engine, 'afterUpdate', () => this._renderTick());

    this.syncBounds();
    window.addEventListener('resize', () => this.syncBounds());
  },

  count() {
    return this.items.size;
  },

  /* ------------------------------------------------------------ Spawning */

  /**
   * Drop a device into the playground at a client-space point.
   * @returns {boolean} true if it landed inside the zone (i.e. was spawned).
   */
  spawn(type, clientX, clientY, fills = null) {
    if (!this.zone) return false;
    const rect = this.zone.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false;
    this._add(type, x, y, 0, fills);
    this._ensureRunning();
    this.app?.commit();
    return true;
  },

  /** Build the element + body for one free device (no history side-effects). */
  _add(type, x, y, angle, fills) {
    const el = createDevice(type);
    if (!el) return null;
    el.classList.add('free-device');
    el.classList.remove('placed');
    el.draggable = true; // pick a fallen device up like a fresh library drag
    if (Array.isArray(fills) && fills.length) {
      el.querySelectorAll('.carrier-bay').forEach((bay, i) => applyBayFill(bay, fills[i] || null));
    }
    // Measure at (0,0) first so offset dimensions are real before positioning.
    el.style.left = '0px';
    el.style.top = '0px';
    this.zone.appendChild(el);
    const w = el.offsetWidth || 240;
    const h = el.offsetHeight || 38;

    const body = Bodies.rectangle(x, y, w, h, { ...BODY_OPTS, angle });
    body._el = el;
    body._dims = { w, h };
    el._body = body;
    this.items.set(body, { el, type, fills: fills || null });
    Composite.add(this.engine.world, body);
    this._paint(body);
    return body;
  },

  clear() {
    for (const { el } of this.items.values()) el.remove();
    this.items.clear();
    this.lifted?.el.remove();
    this.lifted = null;
    this._stop();
  },

  /* --------------------------------------------------------- Persistence */

  /** Serialise free devices as fractions of the zone, so they survive resize. */
  serialize() {
    if (!this.zone || this.items.size === 0) return [];
    const rect = this.zone.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    const out = [];
    for (const [body, item] of this.items) {
      const entry = {
        type: item.type,
        nx: clamp01(body.position.x / w),
        ny: clamp01(body.position.y / h),
        angle: body.angle,
      };
      if (item.fills) entry.fills = item.fills;
      out.push(entry);
    }
    return out;
  },

  /** Rebuild free devices from serialised state (replaces any current set). */
  load(list) {
    this.clear();
    if (!this.zone || !Array.isArray(list) || list.length === 0) return;
    const rect = this.zone.getBoundingClientRect();
    for (const f of list) {
      if (!f || typeof f.type !== 'string') continue;
      const x = clamp01(f.nx) * rect.width;
      const y = clamp01(f.ny) * rect.height;
      this._add(f.type, x, y, Number(f.angle) || 0, Array.isArray(f.fills) ? f.fills : null);
    }
    if (this.items.size) this._ensureRunning();
  },

  /* --------------------------------------------------------- Static geom */

  /** (Re)build the floor, walls, and the rack obstacle in zone-local space. */
  syncBounds() {
    if (!this.engine || !this.zone) return;
    for (const s of this.statics) Composite.remove(this.engine.world, s);
    this.statics = [];

    const rect = this.zone.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;
    const opt = { isStatic: true };
    this.statics.push(
      Bodies.rectangle(w / 2, h + WALL / 2, w + WALL * 2, WALL, opt), // floor
      Bodies.rectangle(-WALL / 2, h / 2, WALL, h * 3, opt), // left wall
      Bodies.rectangle(w + WALL / 2, h / 2, WALL, h * 3, opt) // right wall
    );

    // Solid box for the rack cabinet, so devices pile on top of and beside it.
    const cab = document.querySelector('.rack-cabinet');
    if (cab) {
      const cr = cab.getBoundingClientRect();
      if (cr.width && cr.height) {
        this.statics.push(
          Bodies.rectangle(cr.left - rect.left + cr.width / 2, cr.top - rect.top + cr.height / 2, cr.width, cr.height, opt)
        );
      }
    }
    Composite.add(this.engine.world, this.statics);
  },

  /* -------------------------------------------------------- Pick up / drop */

  /**
   * Pick up a fallen device: remove it from the simulation (so it no longer
   * collides) and hide the placeholder while the native drag is in flight.
   * @returns {{type:string, fills:Array|null}|null}
   */
  beginDrag(el) {
    const body = el?._body;
    const item = body && this.items.get(body);
    if (!item) return null;
    const rect = this.zone.getBoundingClientRect();
    this.lifted = {
      el,
      type: item.type,
      fills: item.fills,
      nx: clamp01(body.position.x / (rect.width || 1)),
      ny: clamp01(body.position.y / (rect.height || 1)),
      angle: body.angle,
    };
    el.classList.add('lifted');
    Composite.remove(this.engine.world, body);
    this.items.delete(body);
    el._body = null;
    return { type: item.type, fills: item.fills };
  },

  liftedType() {
    return this.lifted?.type ?? null;
  },
  liftedFills() {
    return this.lifted?.fills ?? null;
  },

  /** The lifted device found a home (racked or deleted): drop the placeholder. */
  dropRemoved() {
    if (!this.lifted) return;
    this.lifted.el.remove();
    this.lifted = null;
  },

  /** Re-drop the lifted device into the playground at a point, so it falls again. */
  respawn(clientX, clientY) {
    if (!this.lifted) return;
    const { type, fills } = this.lifted;
    const rect = this.zone.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    this.lifted.el.remove();
    this.lifted = null;
    this._add(type, x, y, 0, fills);
    this._ensureRunning();
    this.app?.commit();
  },

  /** Nothing came of the pickup — return the device to where it was lifted from. */
  cancelDrag() {
    if (!this.lifted) return;
    const { el, type, fills, nx, ny, angle } = this.lifted;
    el.remove();
    this.lifted = null;
    const rect = this.zone.getBoundingClientRect();
    this._add(type, nx * rect.width, ny * rect.height, angle, fills);
    this._ensureRunning();
    this.app?.persistFreeSoon();
  },

  /* ------------------------------------------------------------ Rendering */

  _renderTick() {
    for (const body of this.items.keys()) this._paint(body);
    // Stop the runner once everything has been calm for a beat, to spare the CPU
    // when nothing is moving. A sustained-stillness counter is more reliable than
    // Matter's built-in sleeping, which doesn't engage consistently here.
    if (!this._running) return;
    if (this._isCalm()) {
      if (++this._calmTicks > 45) this._stop();
    } else {
      this._calmTicks = 0;
    }
  },

  _paint(body) {
    const el = body._el;
    if (!el) return;
    const { w, h } = body._dims;
    el.style.left = `${body.position.x - w / 2}px`;
    el.style.top = `${body.position.y - h / 2}px`;
    el.style.transform = `rotate(${body.angle}rad)`;
  },

  _isCalm() {
    for (const body of this.items.keys()) {
      const v = body.velocity;
      if (Math.abs(v.x) > 0.05 || Math.abs(v.y) > 0.05 || Math.abs(body.angularVelocity) > 0.008) return false;
    }
    return true;
  },

  _ensureRunning() {
    if (this._running || !this.runner) return;
    this._calmTicks = 0;
    Runner.run(this.runner, this.engine);
    this._running = true;
  },

  _stop() {
    if (!this._running) return;
    Runner.stop(this.runner);
    this._running = false;
    this.app?.persistFreeSoon();
  },
};

function clamp01(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}
