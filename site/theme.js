// Apply the preference before CSS loads to avoid flashing the wrong theme.
(() => {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const key = 'yc-crypto:theme';
  let preference;
  try { preference = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(preference)) preference = null;
  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171c1a' : '#f7f8f4');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const dark = theme === 'dark';
      button.hidden = false;
      button.setAttribute('aria-label', dark ? '切换到白天模式' : '切换到黑夜模式');
      button.querySelector('[data-theme-icon]').textContent = dark ? '☀' : '☾';
      button.querySelector('[data-theme-label]').textContent = dark ? '白天' : '黑夜';
    });
  }
  const current = () => preference || (system.matches ? 'dark' : 'light');
  apply(current());
  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply(preference);
    }));
  });
  system.addEventListener('change', () => { if (!preference) apply(current()); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    apply(current());
  });
})();
