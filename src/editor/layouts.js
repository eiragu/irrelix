/**
 * 快速布局预设(v1.0 第四步 · 4c)
 *
 * 每个预设是纯函数:输入画布尺寸,输出 { screen: {...}, cam: {...} }
 * 每个图层对象里的字段是要覆盖到图层上的属性(x/y/w/h/visible/shape/radius/contentScale...)
 *
 * 布局只是"起点",用户应用后仍可继续手动微调。
 */

function fitScreen(W, H, aspect = 16 / 9) {
  let w = W;
  let h = W / aspect;
  if (h > H) {
    h = H;
    w = H * aspect;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

function fullscreen(W, H) {
  const screen = fitScreen(W, H, 16 / 9);
  // 头像按画布长边的 18% 算,窄画布头像会自然小一些,不会显得挤
  const camSize = Math.round(Math.max(W, H) * 0.18);
  const marginX = Math.round(Math.min(W, H) * 0.04);
  // 竖屏默认把头像离底部更远(放在约画布高度的 72% 位置,而不是贴底)
  const marginY = H > W ? Math.round(H * 0.10) : Math.round(H * 0.05);
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: W - camSize - marginX,
      y: H - camSize - marginY,
      w: camSize, h: camSize,
      visible: true,
      shape: 'circle',
      lockRatio: true,
      borderOn: true,
      borderWidth: 3,
      borderColor: '#ffffff',
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function topScreen(W, H) {
  const splitY = Math.round(H * 0.45);
  const screen = fitScreen(W, splitY, 16 / 9);
  const camAspect = 16 / 9;
  let camW = W;
  let camH = W / camAspect;
  const bottomH = H - splitY;
  if (camH > bottomH) { camH = bottomH; camW = camH * camAspect; }
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: (W - camW) / 2,
      y: splitY + (bottomH - camH) / 2,
      w: camW, h: camH,
      visible: true,
      shape: 'rectangle', radius: 0,
      lockRatio: true,
      borderOn: false,
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function bottomScreen(W, H) {
  const splitY = Math.round(H * 0.55);
  const camAspect = 16 / 9;
  let camW = W;
  let camH = W / camAspect;
  if (camH > splitY) { camH = splitY; camW = camH * camAspect; }
  const screen = fitScreen(W, H - splitY, 16 / 9);
  screen.y += splitY;
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: (W - camW) / 2,
      y: (splitY - camH) / 2,
      w: camW, h: camH,
      visible: true,
      shape: 'rectangle', radius: 0,
      lockRatio: true,
      borderOn: false,
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function leftScreen(W, H) {
  const splitX = Math.round(W * 0.65);
  const screen = fitScreen(splitX, H, 16 / 9);
  // 右侧摄像头:竖直方向尽量填满
  const camAspect = 9 / 16;
  const rightW = W - splitX;
  let camW = rightW;
  let camH = camW / camAspect;
  if (camH > H) { camH = H; camW = camH * camAspect; }
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: splitX + (rightW - camW) / 2,
      y: (H - camH) / 2,
      w: camW, h: camH,
      visible: true,
      shape: 'rectangle', radius: 0,
      lockRatio: true,
      borderOn: false,
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function rightScreen(W, H) {
  const splitX = Math.round(W * 0.35);
  const camAspect = 9 / 16;
  let camW = splitX;
  let camH = camW / camAspect;
  if (camH > H) { camH = H; camW = camH * camAspect; }
  const screen = fitScreen(W - splitX, H, 16 / 9);
  screen.x += splitX;
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: (splitX - camW) / 2,
      y: (H - camH) / 2,
      w: camW, h: camH,
      visible: true,
      shape: 'rectangle', radius: 0,
      lockRatio: true,
      borderOn: false,
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function pip(W, H) {
  const screen = fitScreen(W, H, 16 / 9);
  const camSize = Math.round(Math.max(W, H) * 0.18);
  return {
    screen: { ...screen, visible: true },
    cam: {
      x: (W - camSize) / 2,
      y: (H - camSize) / 2,
      w: camSize, h: camSize,
      visible: true,
      shape: 'circle',
      lockRatio: true,
      borderOn: true,
      borderWidth: 4,
      borderColor: '#ffffff',
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function screenOnly(W, H) {
  const screen = fitScreen(W, H, 16 / 9);
  return {
    screen: { ...screen, visible: true },
    cam: { visible: false },
  };
}

function camOnly(W, H) {
  const camAspect = 16 / 9;
  let camW = W, camH = W / camAspect;
  if (camH > H) { camH = H; camW = H * camAspect; }
  return {
    screen: { visible: false },
    cam: {
      x: (W - camW) / 2,
      y: (H - camH) / 2,
      w: camW, h: camH,
      visible: true,
      shape: 'rectangle', radius: 0,
      lockRatio: true,
      borderOn: false,
      contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
    },
  };
}

function icon(svg) {
  return `<svg viewBox="0 0 24 16" fill="none" stroke="currentColor" stroke-width="1.5">${svg}</svg>`;
}

// 每个布局配一个简单的示意小图标(24×16 画框)
const ICONS = {
  fullscreen:   icon('<rect x="1" y="1" width="22" height="14" rx="1.5"/><circle cx="20" cy="12" r="1.5" fill="currentColor"/>'),
  topScreen:    icon('<rect x="1" y="1" width="22" height="6" rx="1.5"/><rect x="1" y="9" width="22" height="6" rx="1.5"/>'),
  bottomScreen: icon('<rect x="1" y="1" width="22" height="6" rx="1.5" stroke-dasharray="2,2"/><rect x="1" y="9" width="22" height="6" rx="1.5"/>'),
  leftScreen:   icon('<rect x="1" y="1" width="13" height="14" rx="1.5"/><rect x="16" y="1" width="7" height="14" rx="1.5"/>'),
  rightScreen:  icon('<rect x="1" y="1" width="7" height="14" rx="1.5" stroke-dasharray="2,2"/><rect x="10" y="1" width="13" height="14" rx="1.5"/>'),
  pip:          icon('<rect x="1" y="1" width="22" height="14" rx="1.5"/><circle cx="12" cy="8" r="3" fill="currentColor"/>'),
  screenOnly:   icon('<rect x="1" y="1" width="22" height="14" rx="1.5"/>'),
  camOnly:      icon('<circle cx="12" cy="8" r="6" fill="currentColor"/>'),
};

export const LAYOUT_PRESETS = [
  { key: 'fullscreen',   name: '全屏',       apply: fullscreen,   icon: ICONS.fullscreen,   hint: '屏幕铺满,摄像头小圆右下角' },
  { key: 'topScreen',    name: '上屏下人',   apply: topScreen,    icon: ICONS.topScreen,    hint: '竖屏:屏幕在上,人脸在下' },
  { key: 'bottomScreen', name: '下屏上人',   apply: bottomScreen, icon: ICONS.bottomScreen, hint: '竖屏:人脸在上,屏幕在下' },
  { key: 'leftScreen',   name: '左屏右人',   apply: leftScreen,   icon: ICONS.leftScreen,   hint: '横屏:屏幕在左,人脸在右' },
  { key: 'rightScreen',  name: '右屏左人',   apply: rightScreen,  icon: ICONS.rightScreen,  hint: '横屏:人脸在左,屏幕在右' },
  { key: 'pip',          name: '画中画居中', apply: pip,          icon: ICONS.pip,          hint: '屏幕铺满,摄像头圆形居中' },
  { key: 'screenOnly',   name: '仅屏幕',     apply: screenOnly,   icon: ICONS.screenOnly,   hint: '只显示屏幕,隐藏摄像头' },
  { key: 'camOnly',      name: '仅摄像头',   apply: camOnly,      icon: ICONS.camOnly,      hint: '只显示摄像头,隐藏屏幕' },
];

export function computeLayout(key, W, H) {
  const preset = LAYOUT_PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  return preset.apply(W, H);
}

// 所有画布尺寸默认都用"全屏"(屏幕适配 + 摄像头圆形右下角)—— 最干净的起点
export function getDefaultLayoutKey(/* W, H */) {
  return 'fullscreen';
}
