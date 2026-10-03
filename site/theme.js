// Resolve the appearance before CSS loads to avoid flashing the wrong theme.
(() => {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const key = 'yc-crypto:theme';
  const normalize = value => ['light', 'dark'].includes(value) ? value : 'system';
  const names = { light: '浅色', dark: '深色', system: '跟随系统' };
  let preference = 'system';
  try { preference = normalize(localStorage.getItem(key)); } catch {}
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171c1a' : '#f7f8f4');
    document.querySelectorAll('[data-theme-picker]').forEach(picker => {
      picker.hidden = false;
      const button = picker.querySelector('[data-theme-toggle]');
      const label = `选择外观，当前：${names[preference]}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.querySelector('[data-theme-icon]').textContent = preference === 'system' ? '◐' : theme === 'dark' ? '☾' : '☀';
      picker.querySelectorAll('[data-theme-choice]').forEach(choice => {
        choice.setAttribute('aria-pressed', String(choice.dataset.themeChoice === preference));
      });
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-theme-picker]').forEach(picker => {
      const button = picker.querySelector('[data-theme-toggle]');
      const options = picker.querySelector('[data-theme-options]');
      function close(restoreFocus = false) {
        options.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus();
      }
      button.addEventListener('click', () => {
        options.hidden = !options.hidden;
        button.setAttribute('aria-expanded', String(!options.hidden));
        if (!options.hidden) options.querySelector('[aria-pressed="true"]').focus();
      });
      picker.querySelectorAll('[data-theme-choice]').forEach(choice => choice.addEventListener('click', () => {
        preference = normalize(choice.dataset.themeChoice);
        try {
          if (preference === 'system') localStorage.removeItem(key);
          else localStorage.setItem(key, preference);
        } catch {}
        apply();
        close(true);
      }));
      picker.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !options.hidden) {
          event.preventDefault();
          close(true);
        }
      });
      document.addEventListener('click', event => { if (!picker.contains(event.target)) close(); });
      picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close(); });
    });
  });
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = normalize(event.newValue);
    apply();
  });
})();
