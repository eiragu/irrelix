/**
 * 全局 Toast 提示(v1.0 第六步 · 6a)
 */

let _hideTimer = null;

export function showToast(message, { kind = 'success', duration = 3000 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${kind}`;
  // 触发重绘让过渡生效
  requestAnimationFrame(() => {
    el.classList.remove('hidden');
  });
  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    el.classList.add('hidden');
    _hideTimer = null;
  }, duration);
}
