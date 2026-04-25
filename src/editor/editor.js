/**
 * 画布编辑器(v1.0 第四步 · 4a + 4b)
 *
 * 坐标系:
 *   - 画布有"真实像素"尺寸(如 1080×1920),图层的 x/y/w/h 用的也是真实像素
 *   - 显示时用 CSS transform: scale(displayScale) 缩放整个 stage 到屏幕可见尺寸
 *   - 鼠标事件中的 dx/dy 要除以 displayScale 才能映射回真实像素
 *
 * 4a:画布尺寸、拖拽缩放、图层列表、同步播放
 * 4b:图层完整样式(形状/圆角/边框/透明度/镜像)、画布底色/透明、Panel API 事件
 */

import { LAYOUT_PRESETS, computeLayout, getDefaultLayoutKey } from './layouts.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { getFilterString } from '../capture/beauty.js';

const HANDLE_POSITIONS = ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'];

function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICON_EYE = icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
const ICON_EYE_OFF = icon('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
const ICON_LOCK = icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
const ICON_UNLOCK = icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>');

const COMMON_LAYER_DEFAULTS = {
  opacity: 1,
  borderOn: false,
  borderWidth: 2,
  borderColor: '#ffffff',
  visible: true,
  locked: false,
};
const SCREEN_LAYER_DEFAULTS = {
  shape: 'rectangle', // 'rectangle' | 'rounded'
  radius: 0,
  lockRatio: true,
};
const CAM_LAYER_DEFAULTS = {
  shape: 'rectangle', // 'circle' | 'square' | 'rectangle'
  radius: 0,
  lockRatio: true,
  flipH: true,
  flipV: false,
  // 画面裁切(在外框内部对视频内容做二次构图)
  contentScale: 1,    // 1.0 - 3.0
  contentOffsetX: 0,  // -0.5 to +0.5 (相对视频宽度的百分比)
  contentOffsetY: 0,
};

export class Editor {
  constructor() {
    this.root = document.getElementById('editorView');
    this.stage = document.getElementById('canvasStage');
    this.stageWrapper = document.getElementById('canvasStageWrapper');
    this.canvasInfo = document.getElementById('canvasInfo');
    this.layerListEl = document.getElementById('layerList');
    this.editorTitle = document.getElementById('editorTitle');
    this.sessionInfoEl = document.getElementById('editorSessionInfo');
    this.btnBack = document.getElementById('editorBack');
    this.btnLayerUp = document.getElementById('btnLayerUp');
    this.btnLayerDown = document.getElementById('btnLayerDown');
    this.btnFit = document.getElementById('btnFitView');
    this.btnZoomIn = document.getElementById('btnZoomIn');
    this.btnZoomOut = document.getElementById('btnZoomOut');
    this.btnLayoutMenu = document.getElementById('btnLayoutMenu');
    this.layoutMenu = document.getElementById('layoutMenu');

    this.session = null;
    this.layers = [];
    this.selectedId = null;
    this.canvasW = 1080;
    this.canvasH = 1920;
    this.displayScale = 1;
    this.zoomOverride = null;
    this.objectUrls = [];
    this.isPlaying = false;
    this.rafId = null;

    // 4d-2: session 级 trim(裁掉开头废话和结尾收尾),整条会话一组 in/out
    this.trimIn = 0;
    this.trimOut = 0; // open 时初始化为 duration

    this.canvasBg = { type: 'color', color: '#000000' };

    // 应用持久化偏好(上次用的画布尺寸/底色), 第一次打开时什么都没存
    const prefs = loadPrefs();
    if (prefs?.canvasW && prefs?.canvasH) {
      this.canvasW = prefs.canvasW;
      this.canvasH = prefs.canvasH;
    }
    if (prefs?.canvasBg) {
      this.canvasBg = { ...this.canvasBg, ...prefs.canvasBg };
    }
    this._prefsLayoutKey = prefs?.layoutKey || null;

    this._onCloseCallbacks = [];
    this._selectionListeners = [];
    this._layerUpdateListeners = [];
    this._canvasUpdateListeners = [];
    this._timeUpdateListeners = [];
    this._playStateListeners = [];
    this._trimListeners = [];

    this._bind();
  }

  _bind() {
    this.btnBack.addEventListener('click', () => this.close());
    this._buildLayoutMenu();
    this.btnFit.addEventListener('click', () => { this.zoomOverride = null; this.fitToView(); });
    this.btnZoomIn.addEventListener('click', () => this.zoomBy(1.2));
    this.btnZoomOut.addEventListener('click', () => this.zoomBy(1 / 1.2));
    this.btnLayerUp.addEventListener('click', () => this.moveSelected(+1));
    this.btnLayerDown.addEventListener('click', () => this.moveSelected(-1));
    window.addEventListener('resize', () => {
      if (!this.isOpen()) return;
      if (this.zoomOverride === null) this.fitToView();
    });
    this.stageWrapper.addEventListener('pointerdown', (e) => {
      if (e.target === this.stageWrapper || e.target === this.stage) {
        this.selectLayer(null);
      }
    });
  }

  _buildLayoutMenu() {
    this.layoutMenu.innerHTML = LAYOUT_PRESETS.map((p) => `
      <div class="layout-menu-item" data-key="${p.key}">
        <div class="layout-menu-item-icon">${p.icon}</div>
        <div class="layout-menu-item-text">
          <div class="layout-menu-item-name">${p.name}</div>
          <div class="layout-menu-item-hint">${p.hint}</div>
        </div>
      </div>
    `).join('');

    this.btnLayoutMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.layoutMenu.classList.toggle('hidden');
    });

    this.layoutMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.layout-menu-item');
      if (!item) return;
      this.applyLayout(item.dataset.key);
      this.layoutMenu.classList.add('hidden');
    });

    // 点其他地方关闭菜单
    document.addEventListener('click', (e) => {
      if (!this.layoutMenu.classList.contains('hidden') &&
          !this.btnLayoutMenu.contains(e.target) &&
          !this.layoutMenu.contains(e.target)) {
        this.layoutMenu.classList.add('hidden');
      }
    });
  }

  applyLayout(key) {
    const layout = computeLayout(key, this.canvasW, this.canvasH);
    if (!layout) return;
    this.layers.forEach((layer) => {
      const spec = layout[layer.type];
      if (!spec) return;
      // 复制给图层(undefined 字段不覆盖)
      Object.keys(spec).forEach((k) => {
        if (spec[k] !== undefined) layer[k] = spec[k];
      });
      this._applyLayerStyle(layer);
      this._emitLayerUpdate(layer);
    });
    this.renderLayerList();
    savePrefs({ layoutKey: key });
  }

  onClose(cb) { this._onCloseCallbacks.push(cb); }
  onSelectionChange(cb) { this._selectionListeners.push(cb); }
  onLayerUpdate(cb) { this._layerUpdateListeners.push(cb); }
  onCanvasUpdate(cb) { this._canvasUpdateListeners.push(cb); }
  onTimeUpdate(cb) { this._timeUpdateListeners.push(cb); }
  onPlayStateChange(cb) { this._playStateListeners.push(cb); }
  onTrimChange(cb) { this._trimListeners.push(cb); }

  _emitSelection() {
    const layer = this.selectedId ? this.getLayer(this.selectedId) : null;
    this._selectionListeners.forEach((cb) => cb(layer));
  }
  _emitLayerUpdate(layer) {
    this._layerUpdateListeners.forEach((cb) => cb(layer));
  }
  _emitCanvasUpdate() {
    this._canvasUpdateListeners.forEach((cb) => cb());
  }
  _emitTimeUpdate() {
    const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
    const rawCur = primary?.videoEl?.currentTime;
    const cur = Number.isFinite(rawCur) ? rawCur : 0;
    const dur = this.getDuration();
    this._timeUpdateListeners.forEach((cb) => cb(cur, dur));
  }
  _emitPlayState() {
    this._playStateListeners.forEach((cb) => cb(this.isPlaying));
  }
  _emitTrim() {
    this._trimListeners.forEach((cb) => cb(this.trimIn, this.trimOut));
  }

  // 最少保留 0.5 秒有效区
  setTrim(tIn, tOut) {
    const dur = this.getDuration();
    const MIN = 0.5;
    let a = Math.max(0, Math.min(dur, tIn));
    let b = Math.max(0, Math.min(dur, tOut));
    if (b - a < MIN) {
      // 保护最小间隔: 以变化量较大的一端为主, 另一端顶回来
      if (Math.abs(a - this.trimIn) > Math.abs(b - this.trimOut)) b = Math.min(dur, a + MIN);
      else a = Math.max(0, b - MIN);
    }
    this.trimIn = a;
    this.trimOut = b;
    // 把当前播放位置夹回有效区
    const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
    const cur = primary?.videoEl?.currentTime || 0;
    if (cur < this.trimIn || cur > this.trimOut) {
      this.seek(Math.max(this.trimIn, Math.min(this.trimOut, cur)));
    }
    this._emitTrim();
    this._emitTimeUpdate();
  }

  // MediaRecorder 生成的 webm 通常没写时长, video.duration 会是 Infinity —
  // 必须退回到 session.durationMs, 否则时间轴刻度循环会炸。
  getDuration() {
    const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
    const d = primary?.videoEl?.duration;
    if (Number.isFinite(d) && d > 0) return d;
    if (this.session?.durationMs) return this.session.durationMs / 1000;
    return 0;
  }

  isOpen() { return !this.root.classList.contains('hidden'); }

  open(session) {
    this.session = session;
    this.root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const date = new Date(session.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    this.sessionInfoEl.textContent = `${dateStr} · ${this._fmtDuration(session.durationMs)}`;

    this._buildLayers(session);
    // 初始化时就应用默认布局,不是居中占位(懒人模式)
    this.stage.style.width = `${this.canvasW}px`;
    this.stage.style.height = `${this.canvasH}px`;
    // 优先用上次存的布局 key, 否则按画布尺寸挑默认
    const initKey = this._prefsLayoutKey || getDefaultLayoutKey(this.canvasW, this.canvasH);
    this.applyLayout(initKey);
    this._applyCanvasBg();
    this.fitToView();
    this.renderLayerList();
    this.selectLayer(this.layers[this.layers.length - 1]?.id || null);
    // 初始化 trim 到全片
    this.trimIn = 0;
    this.trimOut = this.getDuration();
    this._emitCanvasUpdate();
    this._emitTrim();        // 先通知 trim 状态(避免 timeline 初次 render 把整条遮成黑)
    this._emitTimeUpdate();  // 再通知时长/时间(这时会触发 timeline 按正确 trim 画遮罩)
    this._emitPlayState();
  }

  close() {
    this.pause();
    this._destroyLayers();
    this.root.classList.add('hidden');
    document.body.style.overflow = '';
    this._onCloseCallbacks.forEach((cb) => cb());
  }

  // ========== Canvas size / zoom / background ==========
  setCanvasSize(w, h, { autoLayout = true } = {}) {
    const oldW = this.canvasW;
    const oldH = this.canvasH;
    this.canvasW = w;
    this.canvasH = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;

    if (this.layers.length && (oldW !== w || oldH !== h)) {
      if (autoLayout) {
        // "懒人模式":切到新尺寸时自动应用对应的默认布局
        const key = getDefaultLayoutKey(w, h);
        this.applyLayout(key);
      } else {
        // 保留原有图层相对位置(reflow)
        this._reflowLayers(oldW, oldH);
      }
    }

    if (this.zoomOverride === null) this.fitToView();
    else this._applyScale(this.zoomOverride);
    this._updateCanvasInfo();
    this._emitCanvasUpdate();
    savePrefs({ canvasW: w, canvasH: h });
  }

  _reflowLayers(oldW, oldH) {
    this.layers.forEach((layer) => {
      const cxRel = (layer.x + layer.w / 2) / oldW;
      const cyRel = (layer.y + layer.h / 2) / oldH;

      let newW = layer.w;
      let newH = layer.h;
      const maxW = this.canvasW;
      const maxH = this.canvasH;
      if (newW > maxW || newH > maxH) {
        const s = Math.min(maxW / newW, maxH / newH);
        newW *= s;
        newH *= s;
      }

      let newX = cxRel * this.canvasW - newW / 2;
      let newY = cyRel * this.canvasH - newH / 2;
      newX = Math.max(0, Math.min(this.canvasW - newW, newX));
      newY = Math.max(0, Math.min(this.canvasH - newH, newY));

      layer.x = newX;
      layer.y = newY;
      layer.w = newW;
      layer.h = newH;
      this._applyLayerStyle(layer);
      this._emitLayerUpdate(layer);
    });
  }

  fitToView() {
    const rect = this.stageWrapper.getBoundingClientRect();
    const padding = 48;
    const sx = (rect.width - padding) / this.canvasW;
    const sy = (rect.height - padding) / this.canvasH;
    const s = Math.min(sx, sy, 1);
    this._applyScale(s);
    this.zoomOverride = null;
  }

  zoomBy(factor) {
    const current = this.displayScale;
    const next = Math.max(0.05, Math.min(3, current * factor));
    this._applyScale(next);
    this.zoomOverride = next;
  }

  _applyScale(s) {
    this.displayScale = s;
    this.stage.style.transform = `scale(${s})`;
    this._updateCanvasInfo();
  }

  _updateCanvasInfo() {
    this.canvasInfo.textContent = `${this.canvasW} × ${this.canvasH} · ${Math.round(this.displayScale * 100)}%`;
  }

  setCanvasBg(bg) {
    Object.assign(this.canvasBg, bg);
    this._applyCanvasBg();
    this._emitCanvasUpdate();
    savePrefs({ canvasBg: { ...this.canvasBg } });
  }

  _applyCanvasBg() {
    if (this.canvasBg.type === 'transparent') {
      // 棋盘格表示透明
      this.stage.style.background = `
        linear-gradient(45deg, #3a4050 25%, transparent 25%),
        linear-gradient(-45deg, #3a4050 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #3a4050 75%),
        linear-gradient(-45deg, transparent 75%, #3a4050 75%)
      `;
      this.stage.style.backgroundSize = '16px 16px';
      this.stage.style.backgroundPosition = '0 0, 0 8px, 8px -8px, 8px 0';
      this.stage.style.backgroundColor = '#2a3042';
    } else {
      this.stage.style.background = this.canvasBg.color || '#000000';
    }
  }

  // ========== Layers ==========
  _buildLayers(session) {
    const screenAspect = 16 / 9;
    let screenW = this.canvasW;
    let screenH = screenW / screenAspect;
    if (screenH > this.canvasH) { screenH = this.canvasH; screenW = screenH * screenAspect; }

    const screenUrl = URL.createObjectURL(session.screen.blob);
    this.objectUrls.push(screenUrl);
    const screenLayer = this._createLayer({
      id: 'screen',
      type: 'screen',
      name: '屏幕',
      src: screenUrl,
      x: (this.canvasW - screenW) / 2,
      y: (this.canvasH - screenH) / 2,
      w: screenW,
      h: screenH,
    });
    this.layers.push(screenLayer);

    if (session.cam) {
      const camUrl = URL.createObjectURL(session.cam.blob);
      this.objectUrls.push(camUrl);
      const camW = Math.round(this.canvasW * 0.28);
      const camH = Math.round(camW * 9 / 16);
      const camLayer = this._createLayer({
        id: 'cam',
        type: 'cam',
        name: '摄像头',
        src: camUrl,
        x: this.canvasW - camW - 40,
        y: this.canvasH - camH - 40,
        w: camW,
        h: camH,
      });
      this.layers.push(camLayer);
    }
  }

  _createLayer(opts) {
    const el = document.createElement('div');
    el.className = `layer ${opts.type}`;
    el.dataset.id = opts.id;

    const video = document.createElement('video');
    video.className = 'layer-content';
    video.src = opts.src;
    // 屏幕轨道静音(避免和麦克风音轨撞声), 摄像头轨道保留口播声音
    video.muted = opts.type === 'screen';
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => this._updatePlaybackTime());
    el.appendChild(video);

    const hitbox = document.createElement('div');
    hitbox.className = 'layer-hitbox';
    el.appendChild(hitbox);

    const frame = document.createElement('div');
    frame.className = 'layer-frame';
    el.appendChild(frame);

    const handles = document.createElement('div');
    handles.className = 'layer-handles';
    HANDLE_POSITIONS.forEach((pos) => {
      const h = document.createElement('div');
      h.className = `handle ${pos}`;
      h.dataset.pos = pos;
      handles.appendChild(h);
    });
    el.appendChild(handles);

    this.stage.appendChild(el);

    const typeDefaults = opts.type === 'screen' ? SCREEN_LAYER_DEFAULTS : CAM_LAYER_DEFAULTS;
    const layer = {
      ...COMMON_LAYER_DEFAULTS,
      ...typeDefaults,
      ...opts,
      el,
      videoEl: video,
      frameEl: frame,
      handlesEl: handles,
      hitbox,
    };

    this._applyLayerStyle(layer);
    this._attachLayerEvents(layer);
    return layer;
  }

  _applyLayerStyle(layer) {
    const s = layer.el.style;
    s.left = `${layer.x}px`;
    s.top = `${layer.y}px`;
    s.width = `${layer.w}px`;
    s.height = `${layer.h}px`;
    s.opacity = layer.opacity ?? 1;
    s.overflow = 'hidden';

    // 形状 → border-radius
    let radius = 0;
    if (layer.type === 'screen') {
      radius = layer.shape === 'rounded' ? (layer.radius ?? 0) : 0;
    } else {
      if (layer.shape === 'circle') {
        radius = Math.min(layer.w, layer.h) / 2;
      } else if (layer.shape === 'rectangle') {
        radius = layer.radius ?? 0;
      } else {
        radius = 0;
      }
    }
    s.borderRadius = `${radius}px`;

    // 边框用 inset box-shadow 画在内部(不影响布局尺寸)
    if (layer.borderOn && layer.borderWidth > 0) {
      s.boxShadow = `inset 0 0 0 ${layer.borderWidth}px ${layer.borderColor}`;
    } else {
      s.boxShadow = '';
    }

    // 摄像头镜像 + 画面内裁切(缩放/平移)
    if (layer.type === 'cam' && layer.videoEl) {
      const cs = layer.contentScale ?? 1;
      const sx = (layer.flipH ? -1 : 1) * cs;
      const sy = (layer.flipV ? -1 : 1) * cs;
      // 镜像时 translate 方向要反向,让滑块"右"始终看起来是画面"右"
      const txSign = layer.flipH ? -1 : 1;
      const tySign = layer.flipV ? -1 : 1;
      const tx = (layer.contentOffsetX ?? 0) * 100 * txSign;
      const ty = (layer.contentOffsetY ?? 0) * 100 * tySign;
      layer.videoEl.style.transform = `translate(${tx}%, ${ty}%) scale(${sx}, ${sy})`;
      layer.videoEl.style.transformOrigin = 'center center';
      layer.videoEl.style.filter = getFilterString();
    }

    layer.el.classList.toggle('locked', layer.locked);
    layer.el.classList.toggle('hidden-layer', !layer.visible);
  }

  _attachLayerEvents(layer) {
    layer.hitbox.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.selectLayer(layer.id);
      if (layer.locked) return;
      this._startDrag(layer, e);
    });
    layer.handlesEl.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('.handle');
      if (!target || layer.locked) return;
      e.stopPropagation();
      this._startResize(layer, target.dataset.pos, e);
    });
  }

  _startDrag(layer, e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = layer.x;
    const origY = layer.y;
    e.target.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.displayScale;
      const dy = (ev.clientY - startY) / this.displayScale;
      layer.x = origX + dx;
      layer.y = origY + dy;
      this._applyLayerStyle(layer);
      this._emitLayerUpdate(layer);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  _startResize(layer, pos, e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = layer.x;
    const origY = layer.y;
    const origW = layer.w;
    const origH = layer.h;
    const aspect = origW / origH;

    const dirs = {
      tl: { dx: -1, dy: -1, mx: 1, my: 1 },
      tm: { dx: 0, dy: -1, mx: 0, my: 1 },
      tr: { dx: 1, dy: -1, mx: 0, my: 1 },
      ml: { dx: -1, dy: 0, mx: 1, my: 0 },
      mr: { dx: 1, dy: 0, mx: 0, my: 0 },
      bl: { dx: -1, dy: 1, mx: 1, my: 0 },
      bm: { dx: 0, dy: 1, mx: 0, my: 0 },
      br: { dx: 1, dy: 1, mx: 0, my: 0 },
    }[pos];

    e.target.setPointerCapture?.(e.pointerId);

    // 圆形/正方形强制 1:1
    const forceSquare = layer.type === 'cam' && (layer.shape === 'circle' || layer.shape === 'square');

    const onMove = (ev) => {
      const rawDx = (ev.clientX - startX) / this.displayScale;
      const rawDy = (ev.clientY - startY) / this.displayScale;

      let dw = rawDx * dirs.dx;
      let dh = rawDy * dirs.dy;

      const lockRatio = forceSquare || ev.shiftKey || (layer.lockRatio && dirs.dx !== 0 && dirs.dy !== 0);
      if (lockRatio && dirs.dx !== 0 && dirs.dy !== 0) {
        if (Math.abs(dw) > Math.abs(dh)) dh = dw / aspect;
        else dw = dh * aspect;
      }

      const minSize = 40;
      let newW = Math.max(minSize, origW + dw);
      let newH = Math.max(minSize, origH + dh);

      if (lockRatio) {
        if (newW === minSize) newH = Math.max(minSize, newW / aspect);
        if (newH === minSize) newW = Math.max(minSize, newH * aspect);
      }

      if (forceSquare) {
        const size = Math.max(newW, newH);
        newW = size;
        newH = size;
      }

      layer.w = newW;
      layer.h = newH;
      layer.x = origX + (origW - newW) * dirs.mx;
      layer.y = origY + (origH - newH) * dirs.my;
      this._applyLayerStyle(layer);
      this._emitLayerUpdate(layer);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  selectLayer(id) {
    this.selectedId = id;
    this.layers.forEach((l) => l.el.classList.toggle('selected', l.id === id));
    this.renderLayerList();
    this._updateLayerButtons();
    this._emitSelection();
  }

  _updateLayerButtons() {
    const idx = this.layers.findIndex((l) => l.id === this.selectedId);
    this.btnLayerUp.disabled = idx < 0 || idx >= this.layers.length - 1;
    this.btnLayerDown.disabled = idx < 0 || idx <= 0;
  }

  moveSelected(delta) {
    const idx = this.layers.findIndex((l) => l.id === this.selectedId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= this.layers.length) return;
    [this.layers[idx], this.layers[target]] = [this.layers[target], this.layers[idx]];
    this.layers.forEach((l) => this.stage.appendChild(l.el));
    this.renderLayerList();
    this._updateLayerButtons();
  }

  bringToTop(id) {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx < 0 || idx === this.layers.length - 1) return;
    const [l] = this.layers.splice(idx, 1);
    this.layers.push(l);
    this.layers.forEach((ll) => this.stage.appendChild(ll.el));
    this.renderLayerList();
    this._updateLayerButtons();
  }

  sendToBottom(id) {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const [l] = this.layers.splice(idx, 1);
    this.layers.unshift(l);
    this.layers.forEach((ll) => this.stage.appendChild(ll.el));
    this.renderLayerList();
    this._updateLayerButtons();
  }

  getLayer(id) {
    return this.layers.find((l) => l.id === id);
  }

  updateLayerProps(id, props) {
    const layer = this.getLayer(id);
    if (!layer) return;

    // 形状变化时对摄像头强制正方
    if (props.shape !== undefined && layer.type === 'cam') {
      if (props.shape === 'circle' || props.shape === 'square') {
        const size = Math.min(layer.w, layer.h);
        if (props.w === undefined) props.w = size;
        if (props.h === undefined) props.h = size;
        if (props.lockRatio === undefined) props.lockRatio = true;
      }
    }
    Object.assign(layer, props);
    this._applyLayerStyle(layer);
    this._emitLayerUpdate(layer);
    this.renderLayerList();
  }

  renderLayerList() {
    this.layerListEl.innerHTML = '';
    [...this.layers].reverse().forEach((layer) => {
      const row = document.createElement('div');
      row.className = 'layer-item' + (layer.id === this.selectedId ? ' selected' : '');
      row.innerHTML = `
        <span class="layer-item-name">${layer.name}</span>
        <button class="layer-item-btn${layer.visible ? '' : ' off'}" data-act="visible" title="显示/隐藏">${layer.visible ? ICON_EYE : ICON_EYE_OFF}</button>
        <button class="layer-item-btn${layer.locked ? ' off' : ''}" data-act="lock" title="锁定">${layer.locked ? ICON_LOCK : ICON_UNLOCK}</button>
      `;
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.layer-item-btn');
        if (btn) {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'visible') layer.visible = !layer.visible;
          if (act === 'lock') layer.locked = !layer.locked;
          this._applyLayerStyle(layer);
          this._emitLayerUpdate(layer);
          this.renderLayerList();
          return;
        }
        this.selectLayer(layer.id);
      });
      this.layerListEl.appendChild(row);
    });
  }

  // ========== Playback ==========
  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  play() {
    const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
    const cur = primary?.videoEl?.currentTime || 0;
    // 播到末尾或落在修剪区外, 从 trimIn 起播
    if (cur < this.trimIn - 0.01 || cur >= this.trimOut - 0.05) {
      this.seek(this.trimIn);
    }
    this.isPlaying = true;
    this.layers.forEach((l) => { l.videoEl.play().catch(() => {}); });
    this._emitPlayState();
    this._startRAF();
  }

  pause() {
    this.isPlaying = false;
    this.layers.forEach((l) => l.videoEl.pause());
    this._emitPlayState();
    this._stopRAF();
  }

  seek(t) {
    const clamped = Math.max(this.trimIn, Math.min(this.trimOut, t));
    this.layers.forEach((l) => { try { l.videoEl.currentTime = clamped; } catch {} });
    this._emitTimeUpdate();
  }

  _startRAF() {
    if (this.rafId) return;
    const tick = () => {
      // 到达 trimOut 自动停在尾端(不超出修剪区)
      const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
      const cur = primary?.videoEl?.currentTime || 0;
      if (this.isPlaying && this.trimOut > 0 && cur >= this.trimOut) {
        this.pause();
        this.seek(this.trimOut);
        return;
      }
      this._updatePlaybackTime();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _stopRAF() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  _updatePlaybackTime() {
    this._emitTimeUpdate();
  }

  _fmtDuration(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  _destroyLayers() {
    this._stopRAF();
    this.layers.forEach((l) => {
      try { l.videoEl.pause(); l.videoEl.src = ''; } catch {}
      l.el.remove();
    });
    this.layers = [];
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.objectUrls = [];
    this.layerListEl.innerHTML = '';
    this.selectedId = null;
    this._emitSelection();
  }
}
