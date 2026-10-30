/*
 * PASTE IN DEVTOOLS CONSOLE (one page at a time).
 * Read-only DOM audit. Do not log tokens / passwords.
 */
(() => {
  const w = window.innerWidth;
  const scroll = document.documentElement.scrollWidth;
  const overflow = Math.max(0, scroll - w);
  const controls = [...document.querySelectorAll('button, a, input, select, textarea')];
  const unnamed = controls.filter(el => {
    const text = (el.innerText || el.value || '').trim();
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    return !text && !name && el.tagName !== 'INPUT';
  });
  const suspiciousKeys = ['localStorage', 'sessionStorage'].flatMap(type => {
    try {
      return Object.keys(window[type])
        .filter(key => /password|matkhau|passphrase|secret/i.test(key))
        .map(key => `${type}: ${key}`);
    } catch { return [`${type}: unavailable`]; }
  });
  const result = {
    route: window.location.pathname,
    viewportWidth: w,
    documentWidth: scroll,
    horizontalOverflowPixels: overflow,
    horizontalOverflow: overflow > 1,
    totalControls: controls.length,
    controlsWithoutTextOrAriaLabel: unnamed.length,
    suspiciousStorageKeyNames: suspiciousKeys,
  };
  console.table(result);
  if (unnamed.length) console.warn('Possible unlabeled controls:', unnamed.slice(0, 10));
  console.info('Kiem thu FE: DOM summary only. Van can Network va thao tac thu cong.');
  return result;
})();
