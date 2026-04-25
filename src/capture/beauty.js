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
  softness: 0,      // 0 - 1.5 px 柔光(轻度模糊模拟磨皮, 70% 类似真双边滤波效果)
};

export const beauty = { ...DEFAULT };

// 6 档预设: 参考 2025-2026 小红书主流命名 + 不同色调方向
export const PRESETS = [
  { key: 'original', name: '原色',   brightness: 1,    contrast: 1,    saturate: 1,    hueRotate: 0,  softness: 0   },
  { key: 'coolWhite',name: '冷白皮', brightness: 1.15, contrast: 1.05, saturate: 0.85, hueRotate: 8,  softness: 0.4 },
  { key: 'cream',    name: '奶油',   brightness: 1.12, contrast: 1.00, saturate: 1.05, hueRotate: -6, softness: 0.5 },
  { key: 'clear',    name: '通透',   brightness: 1.10, contrast: 1.10, saturate: 0.95, hueRotate: 2,  softness: 0.2 },
  { key: 'mood',     name: '氛围感', brightness: 1.05, contrast: 1.15, saturate: 1.10, hueRotate: -8, softness: 0.5 },
  { key: 'raw',      name: '生图',   brightness: 1.05, contrast: 1.05, saturate: 1.00, hueRotate: 0,  softness: 0   },
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
    softness: p.softness,
  });
}

export function getActivePresetKey() {
  const eq = (a, b) => Math.abs(a - b) < 0.001;
  for (const p of PRESETS) {
    if (eq(beauty.brightness, p.brightness) &&
        eq(beauty.contrast, p.contrast) &&
        eq(beauty.saturate, p.saturate) &&
        eq(beauty.hueRotate, p.hueRotate) &&
        eq(beauty.softness, p.softness)) {
      return p.key;
    }
  }
  return null;
}

export function getFilterString() {
  const { brightness, contrast, saturate, hueRotate, softness } = beauty;
  const blurPart = softness > 0 ? ` blur(${softness}px)` : '';
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueRotate}deg)${blurPart}`;
}
