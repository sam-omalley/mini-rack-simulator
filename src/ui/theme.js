const STORAGE_KEY = 'rack_sim_theme';

/** Light/dark theme toggle with persistence and OS-preference fallback. */
export const Theme = {
  btn: null,

  init() {
    this.btn = document.getElementById('btn-theme');

    const saved = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    this.apply(dark);

    this.btn.addEventListener('click', () => {
      this.apply(!document.body.classList.contains('dark-mode'));
    });
  },

  apply(dark) {
    document.body.classList.toggle('dark-mode', dark);
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    if (this.btn) {
      this.btn.textContent = dark ? '☀️ Light' : '🌙 Dark';
      this.btn.setAttribute('aria-pressed', String(dark));
    }
  },
};
