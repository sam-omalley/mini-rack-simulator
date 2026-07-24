/**
 * Device catalog.
 *
 * Every entry describes one piece of rack equipment:
 *   name        Human-readable label shown in the library and reports.
 *   ports       Ordered list of port type keys (see PORT_SPECS). Empty = no ports.
 *   uHeight     Rack units the device occupies (1–3).
 *   bracket     True if the device mounts on a 10" adapter bracket.
 *   bracketWidth Visual width of the chassis inside the bracket, in px.
 *   layout      Optional custom faceplate renderer key.
 *   hasScreen   Show the small UniFi status screen on the faceplate.
 *   isGrid      Render ports as a 2-row grid (dense 16-port switches).
 *   poeIn       Device is powered *by* PoE rather than sourcing it.
 *   watts       Typical power draw of the device itself (W).
 *   poeBudget   PoE power the device can supply to attached gear (W).
 *   heatWeight  Relative heat output, used for the thermal hot-spot map (0–5).
 */
export const DEVICE_TYPES = {
  blank: { name: '1U White Blank Panel', ports: [], uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'brush-panel': { name: '1U Brush Cable Management Panel', ports: [], uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'patch-8': { name: '8-Port White Patch Panel', ports: Array(8).fill('patch'), uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },
  'patch-12': { name: '12-Port White Patch Panel', ports: Array(12).fill('patch'), uHeight: 1, watts: 0, poeBudget: 0, heatWeight: 0 },

  'usw-pro-xg-8-poe': { name: 'USW-Pro-XG-8-PoE', ports: [...Array(8).fill('10g-poe'), 'sfp', 'sfp'], uHeight: 1, bracket: true, bracketWidth: 220, watts: 40, poeBudget: 200, heatWeight: 5 },
  'usw-lite-16-poe': { name: 'USW-Lite-16-PoE', ports: Array(16).fill('poe'), uHeight: 1, bracket: true, bracketWidth: 170, isGrid: true, watts: 15, poeBudget: 45, heatWeight: 3 },
  'usw-lite-8-poe': { name: 'USW-Lite-8-PoE', ports: [...Array(4).fill('poe'), ...Array(4).fill('gbe')], uHeight: 1, bracket: true, bracketWidth: 170, watts: 8, poeBudget: 52, heatWeight: 2 },
  'usw-flex-2.5g-8-poe': { name: 'USW-Flex-2.5G-8-PoE', ports: [...Array(8).fill('poe-2.5g'), '10g', 'sfp'], uHeight: 1, bracket: true, bracketWidth: 220, watts: 12, poeBudget: 160, heatWeight: 3 },
  'usw-flex-2.5g-8': { name: 'USW-Flex-2.5G-8', ports: [...Array(8).fill('2.5g'), '10g', 'sfp'], uHeight: 1, bracket: true, bracketWidth: 220, watts: 12, poeBudget: 0, heatWeight: 3 },
  'usw-flex-2.5g-5': { name: 'USW-Flex-2.5G-5', ports: ['poe-2.5g', ...Array(4).fill('2.5g')], uHeight: 1, bracket: true, bracketWidth: 120, watts: 8, poeBudget: 0, heatWeight: 2, poeIn: true },
  'usw-flex-mini': { name: 'USW-Flex-Mini', ports: ['poe-gbe', ...Array(4).fill('gbe')], uHeight: 1, bracket: true, bracketWidth: 120, watts: 2.5, poeBudget: 0, heatWeight: 1, poeIn: true },
  'usw-flex': { name: 'USW-Flex', ports: Array(5).fill('poe-gbe'), uHeight: 1, bracket: true, bracketWidth: 125, watts: 5, poeBudget: 46, heatWeight: 2, poeIn: true },
  'usw-flex-xg': { name: 'USW-Flex-XG', ports: ['poe-gbe', ...Array(4).fill('10g')], uHeight: 1, bracket: true, bracketWidth: 130, watts: 15, poeBudget: 0, heatWeight: 4, poeIn: true },

  'ucg-max': { name: 'Cloud Gateway Max (UCG-Max)', ports: ['wan-2.5g', ...Array(4).fill('2.5g')], uHeight: 1, hasScreen: true, bracket: true, bracketWidth: 180, layout: 'ucg-max', watts: 16, poeBudget: 0, heatWeight: 3 },
  'ucg-ultra': { name: 'Cloud Gateway Ultra (UCG-Ultra)', ports: [...Array(4).fill('gbe'), 'wan-2.5g'], uHeight: 1, hasScreen: true, bracket: true, bracketWidth: 180, layout: 'ucg-ultra', watts: 10, poeBudget: 0, heatWeight: 2 },
  'ucg-fiber': { name: 'Cloud Gateway Fiber (UCG-Fiber)', ports: [...Array(3).fill('2.5g'), 'poe-2.5g', 'wan-10g', 'sfp', 'sfp'], uHeight: 1, hasScreen: true, bracket: true, bracketWidth: 220, layout: 'ucg-fiber', watts: 18, poeBudget: 0, heatWeight: 4 },
  ux7: { name: 'UniFi Express 7 (UX7)', ports: ['2.5g', 'wan-10g'], uHeight: 1, hasScreen: true, bracket: true, bracketWidth: 140, layout: 'ux7', watts: 15, poeBudget: 0, heatWeight: 3 },

  'dell-optiplex-micro': { name: 'Dell OptiPlex Micro (10" Adapter)', ports: [], uHeight: 1, bracket: true, bracketWidth: 235, layout: 'dell-optiplex', watts: 35, poeBudget: 0, heatWeight: 4 },

  'deskpi-dp0039': { name: 'DeskPi 1U · 2× Pi 5 NVMe (DP-0039)', ports: ['gbe', 'gbe'], uHeight: 1, bracket: true, bracketWidth: 260, layout: 'deskpi-dp0039', watts: 15, poeBudget: 0, heatWeight: 2 },
  'deskpi-dp0046': { name: 'DeskPi 2U · 4× Pi 5 NVMe (DP-0046)', ports: ['gbe', 'gbe', 'gbe', 'gbe'], uHeight: 2, bracket: true, bracketWidth: 260, layout: 'deskpi-dp0046', watts: 30, poeBudget: 0, heatWeight: 4 },
  'deskpi-dp0101': { name: 'DeskPi 6.91" 1U Touch Screen (DP-0101)', ports: [], uHeight: 1, bracket: true, bracketWidth: 270, layout: 'deskpi-screen', watts: 5, poeBudget: 0, heatWeight: 1 },
  'deskpi-dp0059': { name: 'DeskPi 7.84" 2U Touch Screen (DP-0059)', ports: [], uHeight: 2, bracket: true, bracketWidth: 270, layout: 'deskpi-screen', watts: 8, poeBudget: 0, heatWeight: 1 },
  'deskpi-dp0100': { name: 'DeskPi 9" 3U Touch Screen (DP-0100)', ports: [], uHeight: 3, bracket: true, bracketWidth: 270, layout: 'deskpi-screen', watts: 12, poeBudget: 0, heatWeight: 2 },
};

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
  { title: '📂 Panels & Cable Management', types: ['blank', 'brush-panel'] },
  { title: '🔌 Patch Panels', types: ['patch-8', 'patch-12'] },
  {
    title: '⚡ UniFi Switches',
    types: ['usw-pro-xg-8-poe', 'usw-lite-16-poe', 'usw-lite-8-poe', 'usw-flex-2.5g-8-poe', 'usw-flex-2.5g-8', 'usw-flex-2.5g-5', 'usw-flex-mini', 'usw-flex', 'usw-flex-xg'],
  },
  { title: '🌐 Routers & Gateways', types: ['ucg-max', 'ucg-ultra', 'ucg-fiber', 'ux7'] },
  { title: '🍓 DeskPi & Displays', types: ['deskpi-dp0039', 'deskpi-dp0046', 'deskpi-dp0101', 'deskpi-dp0059', 'deskpi-dp0100'] },
  { title: '💻 Servers & Mini PCs', types: ['dell-optiplex-micro'] },
];

/** Convenience: uHeight with a safe default. */
export function uHeightOf(type) {
  return DEVICE_TYPES[type]?.uHeight ?? 1;
}
