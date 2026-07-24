/** Transient bottom-centre status message. */
export const Toast = {
  el: null,
  timer: null,

  init() {
    this.el = document.getElementById('toast');
  },

  show(msg, { sticky = false } = {}) {
    if (!this.el) return;
    this.el.textContent = msg;
    this.el.hidden = false;
    clearTimeout(this.timer);
    if (!sticky) {
      this.timer = setTimeout(() => this.hide(), 2600);
    }
  },

  hide() {
    if (this.el) this.el.hidden = true;
  },
};
