import { getPortCenterInSVG, getPointerInSVG, cablePath } from '../utils/geometry.js';
import { Toast } from '../ui/toast.js';

/**
 * Handles drawing cables between ports via pointer drag (mouse or touch).
 * Click-then-click also works: press a port, release on empty space, then the
 * next port press completes the link. Pressing a port that already has a cable
 * removes it.
 */
export const CableManager = {
  app: null,
  svg: null,
  activeLine: null,
  startPort: null,

  init(app) {
    this.app = app;
    this.svg = document.getElementById('cable-svg');

    document.addEventListener('pointerdown', (e) => {
      const port = e.target.closest('.port-rj45');
      if (!port || !port.closest('.slot')) return;
      e.preventDefault();
      this.begin(port);
    });

    document.addEventListener('pointermove', (e) => {
      if (this.startPort) this.trackPointer(e);
    });

    document.addEventListener('pointerup', (e) => {
      if (!this.startPort) return;
      const target = e.target.closest('.port-rj45');
      this.complete(target);
    });

    // Keyboard patching: Enter/Space on a focused port.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const port = e.target.closest?.('.port-rj45');
      if (!port || !port.dataset.portId) return;
      e.preventDefault();
      this.keyboardToggle(port);
    });
  },

  begin(port) {
    const portId = port.dataset.portId;
    if (!portId) return;

    // Pressing a connected port disconnects it.
    if (this.removeConnectionFor(portId)) {
      this.app.commit();
      return;
    }

    this.startPort = port;
    port.classList.add('port-selected');
    Toast.show('Drag to another port to run a cable (or press it).', { sticky: true });

    this.activeLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.activeLine.setAttribute('stroke', 'var(--cable-active)');
    this.activeLine.setAttribute('stroke-width', '3');
    this.activeLine.setAttribute('fill', 'none');
    this.activeLine.setAttribute('stroke-dasharray', '5,5');
    this.svg.appendChild(this.activeLine);
  },

  trackPointer(e) {
    if (!this.activeLine) return;
    const a = getPortCenterInSVG(this.svg, this.startPort);
    const b = getPointerInSVG(this.svg, e);
    this.activeLine.setAttribute('d', cablePath(a.x, a.y, b.x, b.y));
  },

  complete(targetPort) {
    if (this.activeLine) {
      this.activeLine.remove();
      this.activeLine = null;
    }
    const start = this.startPort;
    this.startPort = null;
    if (start) start.classList.remove('port-selected');
    Toast.hide();

    if (!targetPort || targetPort === start) return;
    this.link(start.dataset.portId, targetPort.dataset.portId);
  },

  keyboardToggle(port) {
    const portId = port.dataset.portId;
    if (this.removeConnectionFor(portId)) {
      this.app.commit();
      return;
    }
    if (!this.startPort) {
      this.startPort = port;
      port.classList.add('port-selected');
      Toast.show('Port selected. Activate another port to connect.', { sticky: true });
    } else if (this.startPort === port) {
      port.classList.remove('port-selected');
      this.startPort = null;
      Toast.hide();
    } else {
      const first = this.startPort;
      first.classList.remove('port-selected');
      this.startPort = null;
      Toast.hide();
      this.link(first.dataset.portId, portId);
    }
  },

  link(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    // A port holds at most one cable — drop any existing link on the target.
    this.removeConnectionFor(toId);
    this.app.connections.push({ from: fromId, to: toId });
    this.app.commit();
  },

  removeConnectionFor(portId) {
    const idx = this.app.connections.findIndex((c) => c.from === portId || c.to === portId);
    if (idx === -1) return false;
    this.app.connections.splice(idx, 1);
    return true;
  },
};
