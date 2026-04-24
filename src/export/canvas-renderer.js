/**
 * 画一帧画布(v1.0 第五步 · 5c · B 和 C 共享)
 *
 * 接收 ctx + editorState + videoMap, 把当前时刻的画面画到 canvas 上。
 * 和 editor 预览效果完全一致:
 *   - 画布背景色/透明
 *   - 每个可见图层按 x/y/w/h 定位, object-fit: cover 填满
 *   - screen: rectangle 或 rounded(带 radius)
 *   - cam: circle / square / rectangle(带 radius)
 *   - 镜像: flipH / flipV
 *   - 边框: inset stroke
 *   - cam 内裁切: contentScale + contentOffsetX/Y
 *   - opacity
 */

export function renderFrame(ctx, editorState, videoMap) {
  const { canvasW, canvasH, canvasBg, layers } = editorState;

  // 1. 画布背景
  if (canvasBg?.type === 'transparent') {
    ctx.clearRect(0, 0, canvasW, canvasH);
  } else {
    ctx.fillStyle = canvasBg?.color || '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 2. 从底到顶画每条可见图层
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const source = videoMap[layer.id];
    if (!source || !source.videoWidth) continue;

    drawLayer(ctx, layer, source);
  }
}

function drawLayer(ctx, layer, source) {
  const { x, y, w, h } = layer;
  const opacity = layer.opacity ?? 1;

  ctx.save();
  ctx.globalAlpha = opacity;

  // 形状裁剪 (画图像时约束到此路径内)
  const clipRadius = resolveRadius(layer);
  ctx.beginPath();
  if (layer.type === 'cam' && layer.shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (clipRadius > 0) {
    roundRectPath(ctx, x, y, w, h, clipRadius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();

  // 坐标系原点移到 layer 中心, 便于做镜像 + 内裁切变换
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);

  // 内裁切: 像素偏移(editor 里是相对 layer 的百分比)
  // 镜像时 translate 方向要反向(让用户拖"右"滑块始终是画面"右")
  const flipHSign = layer.flipH ? -1 : 1;
  const flipVSign = layer.flipV ? -1 : 1;
  const offX = (layer.contentOffsetX ?? 0) * w * flipHSign;
  const offY = (layer.contentOffsetY ?? 0) * h * flipVSign;
  ctx.translate(offX, offY);

  // 镜像 + 内裁切 scale (同时放大)
  const cs = layer.contentScale ?? 1;
  ctx.scale(flipHSign * cs, flipVSign * cs);

  // object-fit: cover 算源矩形
  const { srcX, srcY, srcW, srcH } = coverRect(source.videoWidth, source.videoHeight, w, h);
  ctx.drawImage(source, srcX, srcY, srcW, srcH, -w / 2, -h / 2, w, h);

  ctx.restore();

  // 边框 (inset stroke, 画在 clip 之外保证完整显示)
  if (layer.borderOn && layer.borderWidth > 0) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = layer.borderColor || '#ffffff';
    const bw = layer.borderWidth;
    ctx.lineWidth = bw;
    ctx.beginPath();
    // stroke 路径也要随形状走
    if (layer.type === 'cam' && layer.shape === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, (w - bw) / 2, (h - bw) / 2, 0, 0, Math.PI * 2);
    } else if (clipRadius > 0) {
      const r = Math.max(0, clipRadius - bw / 2);
      roundRectPath(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, r);
    } else {
      ctx.rect(x + bw / 2, y + bw / 2, w - bw, h - bw);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function resolveRadius(layer) {
  // screen: rectangle(0) 或 rounded(radius)
  // cam: rectangle(radius) / square(0, 在 editor 会强制 1:1) / circle(由 shape 处理不走 radius)
  if (layer.type === 'screen') {
    return layer.shape === 'rounded' ? (layer.radius || 0) : 0;
  }
  if (layer.shape === 'circle') return 0;       // circle 单独处理
  if (layer.shape === 'rectangle') return layer.radius || 0;
  return 0;
}

function coverRect(srcW, srcH, dstW, dstH) {
  const aspectSrc = srcW / srcH;
  const aspectDst = dstW / dstH;
  let sx, sy, sw, sh;
  if (aspectSrc > aspectDst) {
    sh = srcH;
    sw = srcH * aspectDst;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW / aspectDst;
    sx = 0;
    sy = (srcH - sh) / 2;
  }
  return { srcX: sx, srcY: sy, srcW: sw, srcH: sh };
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // 手写兼容
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}
