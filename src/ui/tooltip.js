import { PORT_SPECS } from '../data/devices.js';

/** Floating port-info tooltip anchored to the hovered/focused port. */
export const Tooltip = {
  el: null,

  init() {
    this.el = document.getElementById('global-tooltip');
  },

  show(target, ptype, uSlot, idx) {
    const spec = PORT_SPECS[ptype];
    if (!spec || !this.el) return;

    let text = `<strong>${spec.title}</strong><br><span class="tooltip-speed">${spec.speed}</span>`;
    if (uSlot) text = `<span class="tooltip-loc">U${uSlot} · Port ${idx + 1}</span><br>` + text;

    this.el.innerHTML = text;
    this.el.hidden = false;

    const rect = target.getBoundingClientRect();
    const left = Math.max(10, Math.min(window.innerWidth - 10, rect.left + rect.width / 2));

    if (rect.top < 80) {
      this.el.classList.add('tooltip-bottom');
      this.el.style.top = `${rect.bottom}px`;
    } else {
      this.el.classList.remove('tooltip-bottom');
      this.el.style.top = `${rect.top}px`;
    }
    this.el.style.left = `${left}px`;
  },

  hide() {
    if (this.el) this.el.hidden = true;
  },
};
