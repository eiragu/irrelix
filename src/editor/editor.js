/**
 * 画布编辑器(v1.0 第四步 · 4a)
 *
 * 坐标系:
 *   - 画布有"真实像素"尺寸(如 1080×1920),图层的 x/y/w/h 用的也是真实像素
 *   - 显示时用 CSS transform: scale(displayScale) 缩放整个 stage 到屏幕可见尺寸
 *   - 鼠标事件中的 dx/dy 要除以 displayScale 才能映射回真实像素
 *
 * 4a 范围:
 *   - 画布尺寸切换(16:9 / 9:16 / 1:1 / 4:3)
 *   - 两个默认图层(屏幕 + 摄像头),DOM video 元素即图层内容
 *   - 拖拽移动 / 8 个控制点缩放 / Shift 等比 / 置上/置下
 *   - 图层列表(显示/隐藏 / 锁定 / 选中)
 *   - 简易同步播放(两个 video 用同一个虚拟时间戳)
 */

const HANDLE_POSITIONS = ['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'];

function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICON_EYE = icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
const ICON_EYE_OFF = icon('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
const ICON_LOCK = icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
const ICON_UNLOCK = icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>');

export class Editor {
  constructor() {
    this.root = document.getElementById('editorView');
    this.stage = document.getElementById('canvasStage');
    this.stageWrapper = document.getElementById('canvasStageWrapper');
    this.canvasInfo = document.getElementById('canvasInfo');
    this.layerListEl = document.getElementById('layerList');
    this.canvasSizeBtns = document.getElementById('canvasSizeBtns');
    this.editorTitle = document.getElementById('editorTitle');
    this.sessionInfoEl = document.getElementById('editorSessionInfo');
    this.btnBack = document.getElementById('editorBack');
    this.btnLayerUp = document.getElementById('btnLayerUp');
    this.btnLayerDown = document.getElementById('btnLayerDown');
    this.btnFit = document.getElementById('btnFitView');
    this.btnZoomIn = document.getElementById('btnZoomIn');
    this.btnZoomOut = document.getElementById('btnZoomOut');
    this.btnPlayPause = document.getElementById('btnPlayPause');
    this.btnSeekStart = document.getElementById('btnSeekStart');
    this.playbackTime = document.getElementById('playbackTime');

    this.session = null;
    this.layers = []; // [{ id, type, videoEl, x, y, w, h, visible, locked, el, frameEl, handlesEl, lockRatio }]
    this.selectedId = null;
    this.canvasW = 1080;
    this.canvasH = 1920;
    this.displayScale = 1;
    this.zoomOverride = null; // null = auto-fit, number = 用户手动的 zoom
    this.objectUrls = [];
    this.isPlaying = false;
    this.rafId = null;
    this._onCloseCallbacks = [];

    this._bind();
  }

  _bind() {
    this.btnBack.addEventListener('click', () => this.close());
    this.canvasSizeBtns.querySelectorAll('.canvas-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.dataset.w, 10);
        const h = parseInt(btn.dataset.h, 10);
        this.setCanvasSize(w, h);
        this.canvasSizeBtns.querySelectorAll('.canvas-size-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    this.btnFit.addEventListener('click', () => { this.zoomOverride = null; this.fitToView(); });
    this.btnZoomIn.addEventListener('click', () => this.zoomBy(1.2));
    this.btnZoomOut.addEventListener('click', () => this.zoomBy(1 / 1.2));
    this.btnLayerUp.addEventListener('click', () => this.moveSelected(+1));
    this.btnLayerDown.addEventListener('click', () => this.moveSelected(-1));
    this.btnPlayPause.addEventListener('click', () => this.togglePlay());
    this.btnSeekStart.addEventListener('click', () => this.seek(0));
    window.addEventListener('resize', () => {
      if (!this.isOpen()) return;
      if (this.zoomOverride === null) this.fitToView();
    });

    // 点击画布空白区域取消选中
    this.stageWrapper.addEventListener('pointerdown', (e) => {
      if (e.target === this.stageWrapper || e.target === this.stage) {
        this.selectLayer(null);
      }
    });
  }

  onClose(cb) { this._onCloseCallbacks.push(cb); }

  isOpen() { return !this.root.classList.contains('hidden'); }

  open(session) {
    this.session = session;
    this.root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const date = new Date(session.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    this.sessionInfoEl.textContent = `${dateStr} · ${this._fmtDuration(session.durationMs)}`;

    this._buildLayers(session);
    this.setCanvasSize(this.canvasW, this.canvasH);
    this.fitToView();
    this.renderLayerList();
    this.selectLayer(this.layers[this.layers.length - 1]?.id || null);
  }

  close() {
    this.pause();
    this._destroyLayers();
    this.root.classList.add('hidden');
    document.body.style.overflow = '';
    this._onCloseCallbacks.forEach((cb) => cb());
  }

  // ========== Canvas size / zoom ==========
  setCanvasSize(w, h) {
    this.canvasW = w;
    this.canvasH = h;
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    if (this.zoomOverride === null) this.fitToView();
    else this._applyScale(this.zoomOverride);
    this._updateCanvasInfo();
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

  // ========== Layers ==========
  _buildLayers(session) {
    // screen layer: 默认按 16:9 铺在画布上半区
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
      lockRatio: true,
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
        lockRatio: true,
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
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => {
      // 同步时间显示
      this._updatePlaybackTime();
    });
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

    const layer = {
      ...opts,
      visible: true,
      locked: false,
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
    layer.el.style.left = `${layer.x}px`;
    layer.el.style.top = `${layer.y}px`;
    layer.el.style.width = `${layer.w}px`;
    layer.el.style.height = `${layer.h}px`;
    layer.el.classList.toggle('locked', layer.locked);
    layer.el.classList.toggle('hidden-layer', !layer.visible);
  }

  _attachLayerEvents(layer) {
    // Click to select + start drag
    layer.hitbox.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.selectLayer(layer.id);
      if (layer.locked) return;
      this._startDrag(layer, e);
    });

    // Handles
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

    // 每个 handle 控制哪些边变化
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

    const onMove = (ev) => {
      const rawDx = (ev.clientX - startX) / this.displayScale;
      const rawDy = (ev.clientY - startY) / this.displayScale;

      let dw = rawDx * dirs.dx;
      let dh = rawDy * dirs.dy;

      const lockRatio = ev.shiftKey || (layer.lockRatio && dirs.dx !== 0 && dirs.dy !== 0);
      if (lockRatio && dirs.dx !== 0 && dirs.dy !== 0) {
        // 用主导方向(abs 较大的)决定缩放因子
        if (Math.abs(dw) > Math.abs(dh)) dh = dw / aspect;
        else dw = dh * aspect;
      }

      const minSize = 40;
      let newW = Math.max(minSize, origW + dw);
      let newH = Math.max(minSize, origH + dh);

      // 若锁比例但任意维度被 clamp 到 minSize,补偿另一维
      if (lockRatio) {
        if (newW === minSize) newH = Math.max(minSize, newW / aspect);
        if (newH === minSize) newW = Math.max(minSize, newH * aspect);
      }

      layer.w = newW;
      layer.h = newH;
      layer.x = origX + (origW - newW) * dirs.mx;
      layer.y = origY + (origH - newH) * dirs.my;
      this._applyLayerStyle(layer);
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
    // 重新排序 DOM(后面的元素在视觉上更上层)
    this.layers.forEach((l) => this.stage.appendChild(l.el));
    this.renderLayerList();
    this._updateLayerButtons();
  }

  renderLayerList() {
    this.layerListEl.innerHTML = '';
    // 列表倒序显示(最上面的图层在列表最上)
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
    this.isPlaying = true;
    this.btnPlayPause.textContent = '⏸';
    this.layers.forEach((l) => { l.videoEl.play().catch(() => {}); });
    this._startRAF();
  }

  pause() {
    this.isPlaying = false;
    this.btnPlayPause.textContent = '▶';
    this.layers.forEach((l) => l.videoEl.pause());
    this._stopRAF();
  }

  seek(t) {
    this.layers.forEach((l) => { try { l.videoEl.currentTime = t; } catch {} });
    this._updatePlaybackTime();
  }

  _startRAF() {
    if (this.rafId) return;
    const tick = () => {
      this._updatePlaybackTime();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _stopRAF() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  _updatePlaybackTime() {
    const primary = this.layers.find((l) => l.type === 'screen') || this.layers[0];
    if (!primary) return;
    const cur = primary.videoEl.currentTime || 0;
    const dur = primary.videoEl.duration || (this.session ? this.session.durationMs / 1000 : 0);
    this.playbackTime.textContent = `${this._fmtTime(cur)} / ${this._fmtTime(dur)}`;
  }

  _fmtTime(s) {
    if (!Number.isFinite(s)) return '00:00';
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
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
  }
}
