/**
 * Curated starter layouts. Each `state` is a plain snapshot in the same shape
 * as an exported/saved layout, loaded through the normal loadState() path.
 */
export const TEMPLATES = [
  {
    id: 'home-lab',
    name: 'Home Lab',
    description: 'Gateway, 8-port PoE switch, patch panel, and cable management.',
    state: {
      maxU: 6,
      rack: [
        { u: 6, type: 'ucg-ultra' },
        { u: 5, type: 'usw-lite-8-poe' },
        { u: 4, type: 'patch-8' },
        { u: 3, type: 'brush-panel' },
      ],
      connections: [
        { from: 'u5-p4', to: 'u6-p0' }, // switch uplink → gateway LAN
        { from: 'u4-p0', to: 'u5-p0' }, // patch → switch
        { from: 'u4-p1', to: 'u5-p1' },
      ],
      custom: [],
    },
  },
  {
    id: 'small-office',
    name: 'Small Office',
    description: '16-port PoE switch, gateway, 12-port patch, and an edge switch.',
    state: {
      maxU: 8,
      rack: [
        { u: 8, type: 'ucg-max' },
        { u: 7, type: 'usw-lite-16-poe' },
        { u: 6, type: 'patch-12' },
        { u: 5, type: 'brush-panel' },
        { u: 4, type: 'usw-lite-8-poe' },
      ],
      connections: [
        { from: 'u7-p0', to: 'u8-p1' }, // switch → gateway LAN
        { from: 'u6-p0', to: 'u7-p1' }, // patch → switch
        { from: 'u4-p4', to: 'u7-p2' }, // edge switch uplink → core switch
      ],
      custom: [],
    },
  },
  {
    id: 'pi-cluster',
    name: 'Pi Cluster',
    description: '2.5G switch feeding a 4× Raspberry Pi NVMe mount, plus a patch panel.',
    state: {
      maxU: 4,
      rack: [
        { u: 4, type: 'usw-flex-2.5g-8' },
        { u: 3, type: 'deskpi-dp0046' }, // 2U, covers U2
        { u: 1, type: 'patch-8' },
      ],
      connections: [
        { from: 'u3-p0', to: 'u4-p0' },
        { from: 'u3-p1', to: 'u4-p1' },
        { from: 'u3-p2', to: 'u4-p2' },
        { from: 'u3-p3', to: 'u4-p3' },
      ],
      custom: [],
    },
  },
];
