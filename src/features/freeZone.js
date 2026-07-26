import Matter from 'matter-js';
import { createDevice, applyBayFill } from '../render/deviceFactory.js';

const { Engine, Runner, Composite, Bodies, Body, Query, Events } = Matter;

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
  statics: [], // every static body (walls, floor, obstacles)
  obstacles: [], // just the rack + its handles — things worth lifting out of
  bounds: null, // { leftX, rightX, floorY } in world coordinates
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
    // The stage settles later than init (panels populate, fonts land, the rack
    // height changes), so track its box rather than measuring only once.
    const stage = this.zone.closest('.stage');
    if (stage && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.syncBounds()).observe(stage);
    }
  },

  count() {
    return this.items.size;
  },

  /* ------------------------------------------------------ Coordinate space */

  // The physics simulation and every stored position live in UNSCALED zone-local
  // pixels. The zone is visually scaled by the rack's zoom via a CSS transform
  // (applied in App.setZoom), so we divide out that zoom whenever we cross
  // between client space and simulation space.
  //
  // The world itself is zoom-INDEPENDENT (issue #46): zoom is a camera, and a
  // camera must never touch simulation state. Nothing here may be recomputed on
  // a zoom change — only on a genuine layout change (resize, panel collapse,
  // rack height).

  _zoom() {
    return this.app?.zoom || 1;
  },

  /**
   * Size the world to the stage, in world units, at every zoom level. The camera
   * then scales that fixed world: zooming in crops it, zooming out reveals empty
   * stage around it. The alternative — sizing the world to stage/zoom so the
   * walls stay glued to the panel edges on screen — moves the walls in world
   * space and so mutates the simulation on a camera change (issue #46).
   */
  _sizeZone() {
    const stage = this.zone.closest('.stage');
    if (!stage) return;
    const sr = stage.getBoundingClientRect();
    if (!sr.width || !sr.height) return;
    this.zone.style.width = `${sr.width}px`;
    this.zone.style.height = `${sr.height}px`;
  },

  /** Zone rect (client, i.e. zoom-scaled) plus its unscaled logical size. */
  _metrics() {
    const rect = this.zone.getBoundingClientRect();
    const z = this._zoom();
    return { rect, z, w: rect.width / z || 1, h: rect.height / z || 1 };
  },

  /** Map a client point to unscaled zone-local coordinates. */
  _toLocal(clientX, clientY) {
    const { rect, z } = this._metrics();
    return { x: (clientX - rect.left) / z, y: (clientY - rect.top) / z };
  },

  /* ------------------------------------------------------------ Spawning */

  /**
   * Drop a device into the playground at a client-space point.
   * @returns {boolean} true if it was spawned.
   */
  spawn(type, clientX, clientY, fills = null) {
    if (!this.zone) return false;
    const { w, h } = this._metrics();
    const local = this._toLocal(clientX, clientY);
    // The world has fixed extents, so when zoomed out the stage reaches past its
    // edges. Clamp the drop point in rather than refusing the drop: anything let
    // go over the stage lands, and a device dragged off the rack can never be
    // dropped into nowhere and lost.
    const x = Math.max(0, Math.min(w, local.x));
    const y = Math.max(0, Math.min(h, local.y));
    if (!this._add(type, x, y, 0, fills)) return false;
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

    // Clamp into the side walls rather than letting a half-overlapping drop
    // resolve vertically — being pushed inside the play area is what you expect,
    // where lifting out of a wall would launch the device off the top.
    const left = this.bounds ? this.bounds.leftX : 0;
    const right = this.bounds ? this.bounds.rightX : this._metrics().w;
    const cx = left + w / 2 > right - w / 2 ? (left + right) / 2 : Math.max(left + w / 2, Math.min(right - w / 2, x));
    const cy = Math.max(h / 2, y);

    const body = Bodies.rectangle(cx, cy, w, h, { ...BODY_OPTS, angle });
    body._el = el;
    body._dims = { w, h };
    el._body = body;
    this.items.set(body, { el, type, fills: fills || null });
    Composite.add(this.engine.world, body);
    this._liftClear(body); // lift out of any collider it landed inside
    this._paint(body);
    return body;
  },

  clear() {
    // Remove the physics body too, not just its element — otherwise the collider
    // lingers in the world and invisibly blocks devices dropped afterwards.
    for (const [body, { el }] of this.items) {
      Composite.remove(this.engine.world, body);
      el.remove();
    }
    this.items.clear();
    this.lifted?.el.remove();
    this.lifted = null;
    this._stop();
  },

  /* --------------------------------------------------------- Persistence */

  /** Serialise free devices as fractions of the zone, so they survive resize. */
  serialize() {
    if (!this.zone || this.items.size === 0) return [];
    const { w, h } = this._metrics();
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
    const { w, h } = this._metrics();
    for (const f of list) {
      if (!f || typeof f.type !== 'string') continue;
      const x = clamp01(f.nx) * w;
      const y = clamp01(f.ny) * h;
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
    this.obstacles = [];

    this._sizeZone();
    const { rect, z, w, h } = this._metrics();
    if (rect.width === 0 || rect.height === 0) return;

    // Map a zoom-scaled client rect into unscaled world coordinates. Only valid
    // for elements INSIDE the camera (the rack), which the same transform scales.
    const toWorld = (r) => ({
      left: (r.left - rect.left) / z,
      top: (r.top - rect.top) / z,
      width: r.width / z,
      height: r.height / z,
    });

    // The panels are outside the camera, so they must not be measured through
    // the zoom — that is exactly what used to drag the walls around on a zoom
    // step. Anchor them instead on the two screen points the camera cannot move:
    // the zone's centre-x and its top both sit on the transform origin (top
    // centre), so they hold still at every zoom. Because the zone is stage-sized
    // and stage-centred, this is just "client x, relative to the stage".
    const originX = rect.left + rect.width / 2;
    const unzoomedX = (clientX) => w / 2 + (clientX - originX);

    // Side walls sit at the inner edge of whichever panel is showing, and slide
    // out to the world edge when it's collapsed — so collapsing a panel simply
    // hands its floor space to the playground. Nothing else moves: the rack is
    // centred on the stage, which never changes size.
    const edgeOf = (sel, side) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return side === 'left' ? 0 : w;
      const r = el.getBoundingClientRect();
      return unzoomedX(side === 'left' ? r.right : r.left);
    };
    const leftX = Math.max(0, Math.min(w, edgeOf('.sidebar', 'left')));
    const rightX = Math.max(0, Math.min(w, edgeOf('.right-bar', 'right')));

    // The floor is level with the foot of the rack, not the foot of the window,
    // so fallen devices settle on the same groundline the rack stands on (and
    // stay glued to it through zoom, since both live in world space).
    //
    // ...but only as far down as the world actually goes. A tall rack (10U+ on a
    // short window) reaches past the stage, which clips at its own box, so a
    // floor at the rack's foot would sit below the visible area and everything
    // resting on it would be painted outside the clip and vanish (issue #55).
    // Clamping to `h` keeps the groundline at the rack's foot whenever you can
    // see it, and parks it at the bottom of the world when you can't. `h` is the
    // zone's own height, so this stays zoom-independent (#46).
    const cab = document.querySelector('.rack-cabinet');
    const cabWorld = cab ? toWorld(cab.getBoundingClientRect()) : null;
    const floorY = Math.min(cabWorld ? cabWorld.top + cabWorld.height : h, h);
    this.bounds = { leftX, rightX, floorY };

    const opt = { isStatic: true };
    this.statics.push(
      Bodies.rectangle(w / 2, floorY + WALL / 2, w + WALL * 2, WALL, opt), // floor
      Bodies.rectangle(leftX - WALL / 2, floorY - h, WALL, h * 3, opt), // left wall
      Bodies.rectangle(rightX + WALL / 2, floorY - h, WALL, h * 3, opt) // right wall
    );

    // Obstacles are tracked separately from the walls/floor: only these are worth
    // lifting a freshly-dropped device out of (see _liftClear). The rack cabinet,
    // plus the bumpy handles on its top edge, which stick up above it so devices
    // can perch on and between them.
    const addObstacle = (r) => {
      if (!r.width || !r.height) return;
      const b = Bodies.rectangle(r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, opt);
      this.obstacles.push(b);
      this.statics.push(b);
    };
    if (cabWorld) addObstacle(cabWorld);
    document
      .querySelectorAll('.rack-top-handles .industrial-handle')
      .forEach((handle) => addObstacle(toWorld(handle.getBoundingClientRect())));

    Composite.add(this.engine.world, this.statics);
    this._confineAll();
  },

  /**
   * Keep every device inside the current side walls. Called whenever the bounds
   * change so that a panel sliding back in shoves what it would have covered —
   * settled stacks included — rather than leaving devices stranded underneath it.
   *
   * Only genuine layout changes get here. Zoom must never reach this code: it
   * displaces settled devices and wakes the runner, which is precisely the
   * instability issue #46 describes.
   */
  _confineAll() {
    if (!this.bounds || this.items.size === 0) return;
    const { leftX, rightX } = this.bounds;
    let moved = false;
    for (const body of this.items.keys()) {
      const half = (body.bounds.max.x - body.bounds.min.x) / 2;
      // A device wider than the gap gets centred rather than fought over.
      const min = leftX + half;
      const max = rightX - half;
      const x = min > max ? (leftX + rightX) / 2 : Math.max(min, Math.min(max, body.position.x));
      if (Math.abs(x - body.position.x) > 0.01) {
        Body.setPosition(body, { x, y: body.position.y });
        Body.setVelocity(body, { x: 0, y: body.velocity.y });
        this._paint(body);
        moved = true;
      }
    }
    if (moved) this._ensureRunning();
  },

  /**
   * Flip the scene left↔right to match the rack's front/rear toggle. The rear is
   * a mirror of the front, so a device sitting on the right must move to the left
   * (mirror x about the zone centre) — otherwise the scene is physically
   * inconsistent with the flipped rack. Angle and horizontal momentum mirror too.
   */
  mirror() {
    if (!this.zone || this.items.size === 0) return;
    const { w } = this._metrics();
    for (const body of this.items.keys()) {
      Body.setPosition(body, { x: w - body.position.x, y: body.position.y });
      Body.setAngle(body, -body.angle);
      Body.setVelocity(body, { x: -body.velocity.x, y: body.velocity.y });
      this._paint(body);
    }
    this._ensureRunning(); // let the stack re-settle against the mirrored cabinet
    this.app?.persistFreeSoon();
  },

  /**
   * Lift a freshly-placed body straight up until it no longer overlaps the rack
   * or its handles. Matter leaves a body wedged when it spawns deep inside a
   * collider, so we resolve it up front — deterministically and vertically only,
   * so it lands cleanly on top instead of drifting sideways or staying stuck.
   *
   * Only obstacles are considered: the side walls are effectively infinite, so
   * lifting out of one would fling the device into the sky. Horizontal overlap
   * is handled by clamping into the bounds instead (see `_add`/`_confineAll`).
   */
  _liftClear(body) {
    for (let iter = 0; iter < 40; iter++) {
      const hits = Query.collides(body, this.obstacles);
      if (!hits.length) return;
      // Rise above the highest (smallest top-y) collider we're currently inside.
      let topY = Infinity;
      for (const c of hits) {
        const other = c.bodyA === body ? c.bodyB : c.bodyA;
        if (other.bounds.min.y < topY) topY = other.bounds.min.y;
      }
      if (!Number.isFinite(topY)) return;
      const halfH = (body.bounds.max.y - body.bounds.min.y) / 2;
      Body.setPosition(body, { x: body.position.x, y: topY - halfH - 0.5 });
    }
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
    const { w, h } = this._metrics();
    this.lifted = {
      el,
      type: item.type,
      fills: item.fills,
      nx: clamp01(body.position.x / w),
      ny: clamp01(body.position.y / h),
      angle: body.angle,
    };
    el.classList.add('lifted');
    Composite.remove(this.engine.world, body);
    this.items.delete(body);
    el._body = null;
    // Lifting one out from under a stack drops the others' support — wake the
    // sim so they fall and re-settle instead of hovering in mid-air.
    if (this.items.size) this._ensureRunning();
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
    // Drop upright: the drag ghost is shown upright too, so the two stay
    // consistent, and the device then settles under gravity.
    const { type, fills } = this.lifted;
    const { w, h } = this._metrics();
    const local = this._toLocal(clientX, clientY);
    const x = Math.max(0, Math.min(w, local.x));
    const y = Math.max(0, Math.min(h, local.y));
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
    const { w, h } = this._metrics();
    this._add(type, nx * w, ny * h, angle, fills);
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
