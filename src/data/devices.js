/**
 * Device catalog.
 *
 * Every entry describes one piece of rack equipment:
 *   name        Human-readable label shown in the library and reports.
 *   ports       Ordered list of port type keys (see PORT_SPECS). Empty = no ports.
 *   uHeight     Rack units the device occupies (0.5–3, in 0.5 steps).
 *   bracket     True if the device mounts on a 10" adapter bracket.
 *   bracketWidth Visual width of the chassis inside the bracket, in px.
 *   layout      Optional custom faceplate renderer key.
 *   hasScreen   Show the small UniFi status screen on the faceplate.
 *   isGrid      Render ports as a 2-row grid (dense 16-port switches).
 *   poeIn       Device is powered *by* PoE rather than sourcing it.
 *   watts       Typical power draw of the device itself (W).
 *   poeBudget   PoE power the device can supply to attached gear (W).
 *   heatWeight  Relative heat output, used for the thermal hot-spot map (0–5).
 *   coolingWeight  Heat the device REMOVES, same 0–5 scale as heatWeight. Only
 *               fans set this. Kept separate rather than allowing a negative
 *               heatWeight so "how hot is this thing" and "how much does it
 *               shift" stay distinct — a fan draws watts and makes noise, it
 *               just happens to move heat out. Cooling counts against the rack
 *               total AND against whatever the device is touching (see
 *               App.updateThermalMap), so where you mount a fan matters.
 *   slots       Carrier descriptor: { count, accepts, layout }. Marks the device
 *               as a container whose bays hold SUBCOMPONENTS of class `accepts`.
 */
export const DEVICE_TYPES = {
  blank: { name: '1U White Blank Panel', ports: [], uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'brush-panel': { name: '1U Brush Cable Management Panel', ports: [], uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'patch-8': { name: '8-Port White Patch Panel', ports: Array(8).fill('patch'), uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'patch-12': { name: '12-Port White Patch Panel', ports: Array(12).fill('patch'), uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },

  'usw-pro-xg-8-poe': {
    name: 'USW-Pro-XG-8-PoE',
    ports: [...Array(8).fill('10g-poe'), 'sfp', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 220,
    watts: 40,
    poeBudget: 200,
    heatWeight: 5,
  },
  'usw-lite-16-poe': {
    name: 'USW-Lite-16-PoE',
    ports: Array(16).fill('poe'),
    uHeight: 1,
    bracket: true,
    bracketWidth: 170,
    isGrid: true,
    watts: 15,
    poeBudget: 45,
    heatWeight: 3,
  },
  'usw-lite-8-poe': {
    name: 'USW-Lite-8-PoE',
    ports: [...Array(4).fill('poe'), ...Array(4).fill('gbe')],
    uHeight: 1,
    bracket: true,
    bracketWidth: 170,
    watts: 8,
    poeBudget: 52,
    heatWeight: 2,
  },
  'usw-flex-2.5g-8-poe': {
    name: 'USW-Flex-2.5G-8-PoE',
    ports: [...Array(8).fill('poe-2.5g'), '10g', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 220,
    watts: 12,
    poeBudget: 160,
    heatWeight: 3,
  },
  'usw-flex-2.5g-8': {
    name: 'USW-Flex-2.5G-8',
    ports: [...Array(8).fill('2.5g'), '10g', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 220,
    watts: 12,
    poeBudget: 0,
    heatWeight: 3,
  },
  'usw-flex-2.5g-5': {
    name: 'USW-Flex-2.5G-5',
    ports: ['poe-2.5g', ...Array(4).fill('2.5g')],
    uHeight: 1,
    bracket: true,
    bracketWidth: 120,
    watts: 8,
    poeBudget: 0,
    heatWeight: 2,
    poeIn: true,
  },
  'usw-flex-mini': {
    name: 'USW-Flex-Mini',
    ports: ['poe-gbe', ...Array(4).fill('gbe')],
    uHeight: 1,
    bracket: true,
    bracketWidth: 120,
    watts: 2.5,
    poeBudget: 0,
    heatWeight: 1,
    poeIn: true,
  },
  'usw-flex': {
    name: 'USW-Flex',
    ports: Array(5).fill('poe-gbe'),
    uHeight: 1,
    bracket: true,
    bracketWidth: 125,
    watts: 5,
    poeBudget: 46,
    heatWeight: 2,
    poeIn: true,
  },
  'usw-flex-xg': {
    name: 'USW-Flex-XG',
    ports: ['poe-gbe', ...Array(4).fill('10g')],
    uHeight: 1,
    bracket: true,
    bracketWidth: 130,
    watts: 15,
    poeBudget: 0,
    heatWeight: 4,
    poeIn: true,
  },

  'ucg-max': {
    name: 'Cloud Gateway Max (UCG-Max)',
    ports: ['wan-2.5g', ...Array(4).fill('2.5g')],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 180,
    layout: 'ucg-max',
    watts: 16,
    poeBudget: 0,
    heatWeight: 3,
  },
  'ucg-ultra': {
    name: 'Cloud Gateway Ultra (UCG-Ultra)',
    ports: [...Array(4).fill('gbe'), 'wan-2.5g'],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 180,
    layout: 'ucg-ultra',
    watts: 10,
    poeBudget: 0,
    heatWeight: 2,
  },
  'ucg-fiber': {
    name: 'Cloud Gateway Fiber (UCG-Fiber)',
    ports: [...Array(3).fill('2.5g'), 'poe-2.5g', 'wan-10g', 'sfp', 'sfp'],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 220,
    layout: 'ucg-fiber',
    watts: 18,
    poeBudget: 0,
    heatWeight: 4,
  },
  'uck-g2-plus': {
    name: 'CloudKey Gen2 Plus (UCK-G2-PLUS)',
    ports: ['poe-gbe'],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 140,
    layout: 'uck-g2-plus',
    watts: 10,
    poeBudget: 0,
    heatWeight: 2,
    poeIn: true,
  },
  'unvr-instant': {
    name: 'Network Video Recorder Instant (UNVR-Instant)',
    ports: [...Array(6).fill('poe'), 'gbe'],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 250,
    layout: 'unvr-instant',
    watts: 25,
    poeBudget: 45,
    heatWeight: 3,
  },
  ux7: {
    name: 'UniFi Express 7 (UX7)',
    ports: ['2.5g', 'wan-10g'],
    uHeight: 1,
    hasScreen: true,
    bracket: true,
    bracketWidth: 140,
    layout: 'ux7',
    watts: 15,
    poeBudget: 0,
    heatWeight: 3,
  },

  'dell-optiplex-micro': {
    name: 'Dell OptiPlex Micro (10" Adapter)',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 235,
    layout: 'dell-optiplex',
    watts: 35,
    poeBudget: 0,
    heatWeight: 4,
  },

  'deskpi-dp0039': {
    name: 'DeskPi 1U · 2× Pi 5 NVMe (DP-0039)',
    ports: ['gbe', 'gbe'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 260,
    layout: 'deskpi-dp0039',
    watts: 15,
    poeBudget: 0,
    heatWeight: 2,
  },
  'deskpi-dp0046': {
    name: 'DeskPi 2U · 4× Pi 5 NVMe (DP-0046)',
    ports: ['gbe', 'gbe', 'gbe', 'gbe'],
    uHeight: 2,
    bracket: true,
    bracketWidth: 260,
    layout: 'deskpi-dp0046',
    watts: 30,
    poeBudget: 0,
    heatWeight: 4,
  },
  'deskpi-dp0101': {
    name: 'DeskPi 6.91" 1U Touch Screen (DP-0101)',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 270,
    layout: 'deskpi-screen',
    watts: 5,
    poeBudget: 0,
    heatWeight: 1,
  },
  'deskpi-dp0059': {
    name: 'DeskPi 7.84" 2U Touch Screen (DP-0059)',
    ports: [],
    uHeight: 2,
    bracket: true,
    bracketWidth: 270,
    layout: 'deskpi-screen',
    watts: 8,
    poeBudget: 0,
    heatWeight: 1,
  },
  'deskpi-dp0100': {
    name: 'DeskPi 9" 3U Touch Screen (DP-0100)',
    ports: [],
    uHeight: 3,
    bracket: true,
    bracketWidth: 270,
    layout: 'deskpi-screen',
    watts: 12,
    poeBudget: 0,
    heatWeight: 2,
  },
  'rapidanalysis-xerxes-6x': {
    name: 'Rapid Analysis Xerxes Pi 6× Blade Cluster',
    ports: Array(6).fill('poe-gbe'),
    uHeight: 1,
    bracket: true,
    bracketWidth: 270,
    layout: 'rapidanalysis-xerxes',
    watts: 45,
    poeBudget: 0,
    heatWeight: 3,
  },

  // Other vendors
  'mikrotik-crs310': {
    name: 'MikroTik CRS310-8G+2S+',
    ports: [...Array(8).fill('2.5g'), 'sfp', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 220,
    watts: 18,
    poeBudget: 0,
    heatWeight: 3,
  },
  'mikrotik-crs112': {
    name: 'MikroTik CRS112-8P-4S',
    ports: [...Array(8).fill('poe'), 'sfp', 'sfp', 'sfp', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 240,
    isGrid: true,
    watts: 20,
    poeBudget: 60,
    heatWeight: 3,
  },
  'mikrotik-css318': {
    name: 'MikroTik CSS318-16G-2S+',
    ports: [...Array(16).fill('gbe'), 'sfp', 'sfp'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 240,
    isGrid: true,
    watts: 20,
    poeBudget: 0,
    heatWeight: 3,
  },
  'intellinet-16': {
    name: 'Intellinet 16-Port Gigabit',
    ports: Array(16).fill('gbe'),
    uHeight: 1,
    bracket: true,
    bracketWidth: 240,
    isGrid: true,
    watts: 12,
    poeBudget: 0,
    heatWeight: 2,
  },
  'synology-nas-2bay': {
    name: 'Synology 2-bay NAS (shelf)',
    ports: ['2.5g', 'gbe'],
    uHeight: 2,
    bracket: true,
    bracketWidth: 200,
    watts: 30,
    poeBudget: 0,
    heatWeight: 3,
  },

  // Power & accessories. `capacity` = watt rating the source can supply;
  // `outlets` = how many devices it can power; `batteryWh` = UPS runtime energy.
  'pdu-8': {
    name: '8-Outlet PDU (10")',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 250,
    layout: 'pdu',
    outlets: 8,
    capacity: 1200,
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'netio-powerpdu-4c': {
    name: 'NETIO PowerPDU 4C (metered)',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 200,
    layout: 'pdu',
    outlets: 4,
    capacity: 900,
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'ups-1u': {
    name: '1U UPS (10")',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 250,
    layout: 'pdu',
    outlets: 4,
    capacity: 500,
    batteryWh: 400,
    watts: 0,
    poeBudget: 0,
    heatWeight: 1,
  },
  'shelf-1u': { name: '1U Vented Shelf', ports: [], uHeight: 1, layout: 'shelf', watts: 0, poeBudget: 0, heatWeight: 0 },

  // GeeekPi 10" gear. The fan units are the only devices that cool: `fans` is
  // just how many blades the faceplate draws.
  'geeekpi-fan-1u-4x': {
    name: 'GeeekPi 1U Rack Fan Unit (4× 80 mm, OLED)',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 270,
    layout: 'fan-unit',
    fans: 4,
    watts: 8,
    poeBudget: 0,
    heatWeight: 0,
    coolingWeight: 4,
  },
  'geeekpi-fan-2u-2x': {
    name: 'GeeekPi 2U Rack Fan Unit (2× 70 mm)',
    ports: [],
    uHeight: 2,
    bracket: true,
    bracketWidth: 270,
    layout: 'fan-unit',
    fans: 2,
    watts: 4,
    poeBudget: 0,
    heatWeight: 0,
    coolingWeight: 2,
  },
  'geeekpi-dc-pdu-7': {
    name: 'GeeekPi 0.5U DC PDU Lite (7-Channel)',
    ports: [],
    uHeight: 0.5,
    bracket: true,
    bracketWidth: 250,
    layout: 'pdu',
    outlets: 7,
    capacity: 192, // 24 V × 8 A
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'geeekpi-sbc-shelf-1u': {
    name: 'GeeekPi 1U SBC Shelf (Pi / Jetson / 2.5")',
    ports: [],
    uHeight: 1,
    layout: 'shelf',
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'geeekpi-itx-shelf-1u': {
    name: 'GeeekPi 1U Mini-ITX Shelf',
    ports: [],
    uHeight: 1,
    layout: 'shelf',
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'geeekpi-minipc-shelf-1u': {
    name: 'GeeekPi 1U Mini PC Shelf (RJ45 + HDMI)',
    ports: ['gbe'],
    uHeight: 1,
    bracket: true,
    bracketWidth: 200,
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'geeekpi-vented-shelf-half': {
    name: 'GeeekPi 0.5U Heavy-Duty Vented Shelf',
    ports: [],
    uHeight: 0.5,
    layout: 'shelf',
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },

  // Carriers: containers whose `slots` hold sub-components (see SUBCOMPONENTS).
  // Bays are filled/emptied in place; the carrier itself has no faceplate ports.
  'drive-cage-6': {
    name: '6-Bay 2.5" Drive Cage',
    ports: [],
    uHeight: 1,
    slots: { count: 6, accepts: 'drive', layout: 'bays' },
    watts: 2,
    poeBudget: 0,
    heatWeight: 1,
  },
  'shelf-2slot': {
    name: '2-Slot Compute Shelf',
    ports: [],
    uHeight: 1,
    slots: { count: 2, accepts: 'compute', layout: 'shelf' },
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },

  // 3.5" hot-swap cages. Carriers like the ones above, but their bays render as
  // drive caddies (see deviceFactory `CADDY_LAYOUTS`): a filled bay is a caddy
  // with latch, release button and vented handle, an empty one the bare slot.
  //
  // `watts` and `heatWeight` are the EMPTY enclosure — backplane and fans only.
  // Upstream quotes fully-populated figures, which would double-count here
  // because each fitted drive contributes its own watts and heat (same
  // convention as `drive-cage-6`).
  'hdd-cage-1u-2x': {
    name: '1U 10" 2× 3.5" Hot-Swap HDD Cage',
    ports: [],
    uHeight: 1,
    bracket: true,
    bracketWidth: 270,
    slots: { count: 2, accepts: 'drive-35', layout: 'caddy-h' },
    watts: 3,
    poeBudget: 0,
    heatWeight: 1,
  },
  'hdd-cage-2u-6x': {
    name: '2U 10" 6× 3.5" Hot-Swap HDD Cage',
    ports: [],
    uHeight: 2,
    bracket: true,
    bracketWidth: 270,
    slots: { count: 6, accepts: 'drive-35', layout: 'caddy-h-rows' },
    watts: 5,
    poeBudget: 0,
    heatWeight: 1,
  },
  'hdd-cage-3u-7x': {
    name: '3U 10" 7× 3.5" Hot-Swap HDD Cage',
    ports: [],
    uHeight: 3,
    bracket: true,
    bracketWidth: 270,
    slots: { count: 7, accepts: 'drive-35', layout: 'caddy-v' },
    watts: 6,
    poeBudget: 0,
    heatWeight: 2,
  },

  // Half-height (0.5U)
  'blank-half': { name: '0.5U Blank Panel', ports: [], uHeight: 0.5, watts: 0, poeBudget: 0, heatWeight: 0 },
  'deskpi-dp0043': {
    name: 'DeskPi 0.5U Brush Cable Entry Panel (DP-0043)',
    ports: [],
    uHeight: 0.5,
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'deskpi-dp0034': {
    name: 'DeskPi Rackmate 0.5U 12-Port CAT6 Patch Panel (DP-0034)',
    ports: Array(12).fill('patch'),
    uHeight: 0.5,
    watts: 0,
    poeBudget: 0,
    heatWeight: 0,
  },
  'shelf-half': { name: '0.5U Vented Shelf', ports: [], uHeight: 0.5, layout: 'shelf', watts: 0, poeBudget: 0, heatWeight: 0 },
  'pi-half': {
    name: '0.5U Single-Pi Mount',
    ports: ['gbe'],
    uHeight: 0.5,
    bracket: true,
    bracketWidth: 120,
    watts: 5,
    poeBudget: 0,
    heatWeight: 1,
  },
};

/**
 * Sub-components live INSIDE a carrier device's slots (a DEVICE_TYPES entry with
 * a `slots` descriptor). They are never placed directly on the rack, so they are
 * deliberately kept out of DEVICE_TYPES and CATEGORIES. In a placed rack item they
 * appear as an optional `fills` array aligned to the carrier's slot count.
 *   name        Label shown in the fill menu and BoM.
 *   class       Slot category this fits — matches a carrier slot's `accepts`.
 *   watts       Power draw added when fitted (W).
 *   heatWeight  Heat added when fitted (0–5, same scale as DEVICE_TYPES).
 *   capacityTB  Storage capacity for drives — informational, shown on the bay.
 */
export const SUBCOMPONENTS = {
  'hdd-1tb': { name: '1 TB 2.5" HDD', class: 'drive', watts: 2, heatWeight: 1, capacityTB: 1 },
  'hdd-2tb': { name: '2 TB 2.5" HDD', class: 'drive', watts: 2, heatWeight: 1, capacityTB: 2 },
  'ssd-500gb': { name: '500 GB SSD', class: 'drive', watts: 1, heatWeight: 0, capacityTB: 0.5 },
  'ssd-1tb': { name: '1 TB SSD', class: 'drive', watts: 1, heatWeight: 0, capacityTB: 1 },
  'ssd-2tb': { name: '2 TB SSD', class: 'drive', watts: 1, heatWeight: 0, capacityTB: 2 },
  // 3.5" spinners are their own class: they only fit the hot-swap cages, never
  // the 2.5" drive cage.
  'hdd35-4tb': { name: '4 TB 3.5" HDD', class: 'drive-35', watts: 6, heatWeight: 2, capacityTB: 4 },
  'hdd35-8tb': { name: '8 TB 3.5" HDD', class: 'drive-35', watts: 7, heatWeight: 2, capacityTB: 8 },
  'hdd35-12tb': { name: '12 TB 3.5" HDD', class: 'drive-35', watts: 8, heatWeight: 3, capacityTB: 12 },
  'hdd35-16tb': { name: '16 TB 3.5" HDD', class: 'drive-35', watts: 9, heatWeight: 3, capacityTB: 16 },
  'pi5-4gb': { name: 'Raspberry Pi 5 (4 GB)', class: 'compute', watts: 6, heatWeight: 2 },
  'pi5-8gb': { name: 'Raspberry Pi 5 (8 GB)', class: 'compute', watts: 7, heatWeight: 2 },
  'nuc-mini': { name: 'Mini PC (N100)', class: 'compute', watts: 15, heatWeight: 3 },
};

/** Sub-component spec lookup with a safe null. */
export function subOf(key) {
  return SUBCOMPONENTS[key] ?? null;
}

/** Sub-components whose `class` matches a carrier slot's `accepts`. */
export function subsFor(accepts) {
  return Object.entries(SUBCOMPONENTS)
    .filter(([, s]) => s.class === accepts)
    .map(([key, s]) => ({ key, ...s }));
}

/** Port metadata for tooltips. */
export const PORT_SPECS = {
  patch: { title: 'Patch Panel Port', speed: 'Pass-through · no bandwidth limit' },
  poe: { title: 'PoE 1GbE Port', speed: '10/100/1000 Mbps · 802.3af PoE' },
  gbe: { title: 'Standard 1GbE Port', speed: '10/100/1000 Mbps Ethernet' },
  '10g-poe': { title: 'PoE++ 10G Port', speed: '10 Gbps · 802.3bt PoE++' },
  'poe-2.5g': { title: 'PoE+ 2.5G Port', speed: '2.5 Gbps · 802.3at PoE+' },
  '2.5g': { title: 'Standard 2.5G Port', speed: '2.5 Gbps Ethernet' },
  'poe-gbe': { title: 'PoE-Powered GbE Port', speed: '1 Gbps · 802.3af/at PoE In' },
  'wan-2.5g': { title: '2.5G WAN Port', speed: '2.5 Gbps · Internet uplink' },
  'wan-10g': { title: '10G WAN Port', speed: '10 Gbps · Internet uplink' },
  '10g': { title: '10G Copper Port', speed: '10 Gbps copper' },
  sfp: { title: '10G SFP+ Fiber Slot', speed: '1/10 Gbps SFP+ module' },
};

/**
 * Physical media a port uses. Cross-media patches (rj45 <-> sfp) are flagged
 * as mismatches when drawing cables.
 */
export const PORT_MEDIA_TYPES = {
  patch: 'any',
  poe: 'rj45',
  gbe: 'rj45',
  '10g-poe': 'rj45',
  'poe-2.5g': 'rj45',
  '2.5g': 'rj45',
  'poe-gbe': 'rj45',
  'wan-2.5g': 'rj45',
  'wan-10g': 'rj45',
  '10g': 'rj45',
  sfp: 'sfp',
};

/** Library groupings shown in the sidebar. */
export const CATEGORIES = [
  { title: '📂 Panels & Cable Management', types: ['blank', 'brush-panel', 'deskpi-dp0043'] },
  { title: '🔌 Patch Panels', types: ['deskpi-dp0034', 'patch-8', 'patch-12'] },
  {
    title: '⚡ UniFi Switches',
    types: [
      'usw-pro-xg-8-poe',
      'usw-lite-16-poe',
      'usw-lite-8-poe',
      'usw-flex-2.5g-8-poe',
      'usw-flex-2.5g-8',
      'usw-flex-2.5g-5',
      'usw-flex-mini',
      'usw-flex',
      'usw-flex-xg',
    ],
  },
  { title: '🌐 Routers & Gateways', types: ['ucg-max', 'ucg-ultra', 'ucg-fiber', 'ux7'] },
  { title: '📹 Consoles & Protect NVR', types: ['uck-g2-plus', 'unvr-instant'] },
  {
    title: '🍓 Clusters, Blades & Displays',
    types: ['rapidanalysis-xerxes-6x', 'deskpi-dp0039', 'deskpi-dp0046', 'deskpi-dp0101', 'deskpi-dp0059', 'deskpi-dp0100'],
  },
  { title: '💻 Servers & Mini PCs', types: ['dell-optiplex-micro', 'synology-nas-2bay'] },
  { title: '🧩 Carriers & Drives', types: ['drive-cage-6', 'shelf-2slot', 'hdd-cage-1u-2x', 'hdd-cage-2u-6x', 'hdd-cage-3u-7x'] },
  { title: '🌍 Other Vendors', types: ['mikrotik-crs310', 'mikrotik-crs112', 'mikrotik-css318', 'intellinet-16'] },
  { title: '🔩 Power & Accessories', types: ['pdu-8', 'netio-powerpdu-4c', 'ups-1u', 'geeekpi-dc-pdu-7'] },
  { title: '❄️ Rack Cooling', types: ['geeekpi-fan-1u-4x', 'geeekpi-fan-2u-2x'] },
  // Shelves gathered from Power & Accessories and Half-Height, so the growing
  // set sits together rather than being split by height.
  {
    title: '🗄️ Shelves & Trays',
    types: [
      'shelf-1u',
      'shelf-half',
      'geeekpi-sbc-shelf-1u',
      'geeekpi-itx-shelf-1u',
      'geeekpi-minipc-shelf-1u',
      'geeekpi-vented-shelf-half',
    ],
  },
  // The two 0.5U DeskPi parts live with their functional peers (cable management
  // / patch panels) rather than here, so each type gets exactly one library card.
  { title: '📐 Half-Height (0.5U)', types: ['blank-half', 'pi-half'] },
];

/** Convenience: uHeight with a safe default. */
export function uHeightOf(type) {
  return DEVICE_TYPES[type]?.uHeight ?? 1;
}
