/**
 * 画布用户偏好(v1.0 第六步 · 6a)
 *
 * 把上次用的画布尺寸/底色/默认布局存到 localStorage,
 * editor 下次打开同一台机器/浏览器上继续用, 不用反复选。
 */

const KEY = 'huabu-prefs-v1';

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function savePrefs(patch) {
  try {
    const cur = loadPrefs() || {};
    const next = { ...cur, ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage 可能被禁用(无痕模式), 静默失败
  }
}
