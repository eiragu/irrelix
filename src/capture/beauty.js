/**
 * 摄像头基础调光 (v1.0 第六步 · 6d)
 *
 * 4 个参数 + 几个预设 → CSS/Canvas filter 字符串。
 * - 预览 <video>: element.style.filter = getFilterString()
 * - 导出 canvas: ctx.filter = getFilterString() 后 drawImage
 * - 持久化:      通过 prefs.savePrefs({ beauty: {...beauty} })
 */

const DEFAULT = {
  brightness: 1,    // 0.6 - 1.4
  contrast: 1,      // 0.8 - 1.3
  saturate: 1,      // 0.5 - 1.5
  hueRotate: 0,     // -20 ~ 20 度 (负偏暖, 正偏冷)
};

export const beauty = { ...DEFAULT };

// 一键预设 (内置 5 个, 覆盖最常用色调)
export const PRESETS = [
  { key: 'original',  name: '原色',     brightness: 1,    contrast: 1,    saturate: 1,    hueRotate: 0 },
  { key: 'coolWhite', name: '冷白皮',   brightness: 1.15, contrast: 1.05, saturate: 0.85, hueRotate: 8 },
  { key: 'warmCream', name: '奶油暖',   brightness: 1.1,  contrast: 1,    saturate: 1.1,  hueRotate: -10 },
  { key: 'natural',   name: '自然提亮', brightness: 1.1,  contrast: 1.05, saturate: 1,    hueRotate: 0 },
  { key: 'vlog',      name: '高对比',   brightness: 1.05, contrast: 1.2,  saturate: 1.1,  hueRotate: 0 },
];

export function setBeauty(patch) {
  Object.assign(beauty, patch);
}

export function loadBeauty(saved) {
  if (saved && typeof saved === 'object') {
    Object.assign(beauty, DEFAULT, saved);
  }
}

export function resetBeauty() {
  Object.assign(beauty, DEFAULT);
}

export function applyPreset(key) {
  const p = PRESETS.find((x) => x.key === key);
  if (!p) return;
  Object.assign(beauty, {
    brightness: p.brightness,
    contrast: p.contrast,
    saturate: p.saturate,
    hueRotate: p.hueRotate,
  });
}

export function getActivePresetKey() {
  const eq = (a, b) => Math.abs(a - b) < 0.001;
  for (const p of PRESETS) {
    if (eq(beauty.brightness, p.brightness) &&
        eq(beauty.contrast, p.contrast) &&
        eq(beauty.saturate, p.saturate) &&
        eq(beauty.hueRotate, p.hueRotate)) {
      return p.key;
    }
  }
  return null;
}

export function getFilterString() {
  const { brightness, contrast, saturate, hueRotate } = beauty;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`;
}
