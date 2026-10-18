// Loader, status line and hint shown over the scene (was index.html).
export function createUi(container) {
  const css = document.createElement('style');
  css.textContent = `
  .sc-root{overflow:hidden;background:#cdd6e0;color:#2b3440;font:14px/1.4 system-ui,sans-serif}
  .sc-root canvas{display:block;width:100%;height:100%;touch-action:none}
  .sc-loader{position:absolute;inset:0;display:grid;place-items:center;background:#cdd6e0;transition:opacity 1.2s ease;pointer-events:none;z-index:5}
  .sc-loader.done{opacity:0}
  .sc-loader p{margin:0;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.65)}
  .sc-hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.6);font-size:12px;opacity:.9;z-index:4}`;
  document.head.appendChild(css);
  container.classList.add('sc-root');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const loader = document.createElement('div');
  loader.className = 'sc-loader';
  const status = document.createElement('p');
  status.textContent = 'Loading the scene…';
  loader.append(status);
  const hint = document.createElement('div');
  hint.className = 'sc-hint';
  hint.textContent = 'Tap a capybara';
  container.append(loader, hint);
  return {
    loader, status, hint,
    destroy() { loader.remove(); hint.remove(); css.remove(); container.classList.remove('sc-root'); }
  };
}
