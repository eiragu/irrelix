/**
 * 编辑器右侧属性面板(v1.0 第四步 · 4b)
 *
 * Tab 1 画布   — 尺寸预设 + 底色
 * Tab 2 屏幕   — 位置/尺寸/等比/形状/圆角/边框/透明度/层级
 * Tab 3 摄像头 — 以上 + 镜像翻转
 *
 * 选择图层时自动切到对应 Tab;点空白回到画布 Tab。
 */

const CANVAS_SIZE_PRESETS = [
  { label: '横 16:9', w: 1920, h: 1080 },
  { label: '竖 9:16', w: 1080, h: 1920 },
  { label: '横 4:3', w: 1440, h: 1080 },
  { label: '竖 3:4', w: 1080, h: 1440 },
];

const BG_COLOR_SWATCHES = ['#000000', '#ffffff', '#1a1f2e', '#2a3042', '#6C5CE7', '#00B4D8', '#FF4757', '#2ED573'];
const BORDER_COLOR_SWATCHES = ['#ffffff', '#000000', '#6C5CE7', '#00B4D8', '#FF4757', '#2ED573', '#FFA502', '#FFEAA7'];

export class Panel {
  constructor(editor) {
    this.editor = editor;
    this.rootEl = document.querySelector('.editor-panel');
    this.activeTab = 'canvas';

    this._buildUI();
    this._bindEvents();

    // 无图层选中时默认画布 Tab;有选中则切到对应 Tab
    editor.onSelectionChange((layer) => {
      if (!layer) {
        this._switchTab('canvas');
      } else {
        this._switchTab(layer.type === 'screen' ? 'screen' : 'cam');
      }
      this._updateTabAvailability();
      this._refreshActivePane();
    });

    // 拖拽/缩放时实时更新面板数值
    editor.onLayerUpdate((layer) => {
      if (this.activeTab === 'screen' && layer.type === 'screen') this._refreshScreenPane(layer);
      if (this.activeTab === 'cam' && layer.type === 'cam') this._refreshCamPane(layer);
    });

    editor.onCanvasUpdate(() => {
      if (this.activeTab === 'canvas') this._refreshCanvasPane();
    });
  }

  // ========== UI construction ==========
  _buildUI() {
    this.rootEl.classList.add('panel');
    this.rootEl.innerHTML = `
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="canvas">画布</button>
        <button class="panel-tab" data-tab="screen">屏幕</button>
        <button class="panel-tab" data-tab="cam">摄像头</button>
      </div>
      <div class="panel-body">
        <div class="panel-pane active" data-pane="canvas">${this._canvasPaneHTML()}</div>
        <div class="panel-pane" data-pane="screen">${this._layerPaneHTML('screen')}</div>
        <div class="panel-pane" data-pane="cam">${this._layerPaneHTML('cam')}</div>
      </div>
    `;
    this.tabsEl = this.rootEl.querySelector('.panel-tabs');
    this.bodyEl = this.rootEl.querySelector('.panel-body');
  }

  _canvasPaneHTML() {
    const btns = CANVAS_SIZE_PRESETS.map(
      (p) => `<button class="panel-btn canvas-size-btn" data-w="${p.w}" data-h="${p.h}">${p.label}</button>`
    ).join('');
    const sw = BG_COLOR_SWATCHES.map(
      (c) => `<button class="swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
    return `
      <div class="panel-section">
        <div class="panel-label">画布尺寸</div>
        <div class="panel-grid2">${btns}</div>
      </div>
      <div class="panel-section">
        <div class="panel-label">底色</div>
        <div class="seg-control" data-seg="bgType">
          <button class="seg-btn active" data-val="color">纯色</button>
          <button class="seg-btn" data-val="transparent">透明</button>
        </div>
        <div class="bg-color-row">
          <input type="color" class="color-input" data-input="bgColor" value="#000000" />
          <input type="text" class="hex-input" data-input="bgColorHex" value="#000000" maxlength="7" />
        </div>
        <div class="swatches">${sw}</div>
      </div>
    `;
  }

  _layerPaneHTML(type) {
    const shapeBtns = type === 'screen'
      ? `
        <button class="seg-btn active" data-val="rectangle">矩形</button>
        <button class="seg-btn" data-val="rounded">圆角矩形</button>
      `
      : `
        <button class="seg-btn" data-val="circle">圆形</button>
        <button class="seg-btn" data-val="square">正方形</button>
        <button class="seg-btn active" data-val="rectangle">圆角矩形</button>
      `;
    const borderMax = type === 'screen' ? 10 : 15;
    const borderSwatches = BORDER_COLOR_SWATCHES.map(
      (c) => `<button class="swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');
    const flipSection = type === 'cam' ? `
      <div class="panel-section">
        <div class="panel-label">镜像翻转</div>
        <div class="flip-row">
          <label class="toggle"><input type="checkbox" data-input="flipH" checked/>水平</label>
          <label class="toggle"><input type="checkbox" data-input="flipV"/>垂直</label>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-label">画面裁切 <span style="color:var(--text2);font-weight:400;text-transform:none;letter-spacing:0;font-size:10px;">(把脸移到中心,放大避开背景)</span></div>
        <div class="panel-slider-group">
          <label>缩放 <span data-val="contentScale">100%</span></label>
          <input type="range" data-input="contentScale" min="100" max="300" step="5" value="100"/>
        </div>
        <div class="panel-slider-group">
          <label>水平偏移 <span data-val="contentOffsetX">0%</span></label>
          <input type="range" data-input="contentOffsetX" min="-50" max="50" step="1" value="0"/>
        </div>
        <div class="panel-slider-group">
          <label>垂直偏移 <span data-val="contentOffsetY">0%</span></label>
          <input type="range" data-input="contentOffsetY" min="-50" max="50" step="1" value="0"/>
        </div>
        <button class="panel-btn" data-act="resetCrop" style="width:100%;margin-top:4px;">重置裁切</button>
      </div>
    ` : '';

    return `
      <div class="panel-section">
        <div class="panel-label">位置</div>
        <div class="panel-row2">
          <div class="panel-input-group"><label>X</label><input type="number" data-input="x" step="1"/></div>
          <div class="panel-input-group"><label>Y</label><input type="number" data-input="y" step="1"/></div>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-label">尺寸</div>
        <div class="panel-row2">
          <div class="panel-input-group"><label>宽</label><input type="number" data-input="w" step="1" min="40"/></div>
          <div class="panel-input-group"><label>高</label><input type="number" data-input="h" step="1" min="40"/></div>
        </div>
        <label class="toggle"><input type="checkbox" data-input="lockRatio"/>等比锁定</label>
      </div>
      <div class="panel-section">
        <div class="panel-label">形状</div>
        <div class="seg-control" data-seg="shape">${shapeBtns}</div>
        <div class="panel-slider-group hidden" data-slider="radius">
          <label>圆角 <span data-val="radius">0px</span></label>
          <input type="range" data-input="radius" min="0" max="100" step="1" value="0"/>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-label">边框</div>
        <label class="toggle"><input type="checkbox" data-input="borderOn"/>启用边框</label>
        <div class="panel-sub" data-when="borderOn">
          <div class="panel-slider-group">
            <label>粗细 <span data-val="borderWidth">2px</span></label>
            <input type="range" data-input="borderWidth" min="1" max="${borderMax}" step="1" value="2"/>
          </div>
          <div class="bg-color-row">
            <input type="color" class="color-input" data-input="borderColor" value="#ffffff" />
            <input type="text" class="hex-input" data-input="borderColorHex" value="#ffffff" maxlength="7" />
          </div>
          <div class="swatches">${borderSwatches}</div>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-slider-group">
          <label>透明度 <span data-val="opacity">100%</span></label>
          <input type="range" data-input="opacity" min="0" max="100" step="1" value="100"/>
        </div>
      </div>
      ${flipSection}
      <div class="panel-section">
        <div class="panel-label">层级</div>
        <div class="panel-row2">
          <button class="panel-btn" data-act="bringToTop">置顶</button>
          <button class="panel-btn" data-act="sendToBottom">置底</button>
        </div>
      </div>
    `;
  }

  // ========== Events ==========
  _bindEvents() {
    // Tab 切换
    this.tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.panel-tab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (btn.classList.contains('disabled')) return;
      this._switchTab(tab);
      this._refreshActivePane();
    });

    // 所有 input/change 事件集中处理
    this.bodyEl.addEventListener('input', (e) => this._handleInput(e));
    this.bodyEl.addEventListener('change', (e) => this._handleInput(e));
    this.bodyEl.addEventListener('click', (e) => this._handleClick(e));
  }

  _handleInput(e) {
    const el = e.target;
    const input = el.dataset.input;
    if (!input) return;
    const pane = el.closest('.panel-pane');
    const paneType = pane?.dataset.pane;

    if (paneType === 'canvas') this._handleCanvasInput(input, el);
    else if (paneType === 'screen' || paneType === 'cam') this._handleLayerInput(input, el, paneType);
  }

  _handleCanvasInput(input, el) {
    if (input === 'bgColor') {
      this.editor.setCanvasBg({ color: el.value, type: 'color' });
      this._syncHexInput(this.bodyEl.querySelector('[data-input="bgColorHex"]'), el.value);
      this._syncSegActive(this.bodyEl.querySelector('[data-seg="bgType"]'), 'color');
    } else if (input === 'bgColorHex') {
      const v = this._normalizeHex(el.value);
      if (v) {
        this.editor.setCanvasBg({ color: v, type: 'color' });
        this._syncColorInput(this.bodyEl.querySelector('[data-input="bgColor"]'), v);
        this._syncSegActive(this.bodyEl.querySelector('[data-seg="bgType"]'), 'color');
      }
    }
  }

  _handleLayerInput(input, el, paneType) {
    const layer = this._currentLayer(paneType);
    if (!layer) return;

    if (input === 'x' || input === 'y' || input === 'w' || input === 'h') {
      const v = Number(el.value);
      if (Number.isFinite(v)) this.editor.updateLayerProps(layer.id, { [input]: v });
    } else if (input === 'lockRatio') {
      this.editor.updateLayerProps(layer.id, { lockRatio: el.checked });
    } else if (input === 'radius') {
      const v = Number(el.value);
      this._setSpan(el, `${v}px`);
      this.editor.updateLayerProps(layer.id, { radius: v });
    } else if (input === 'borderOn') {
      this.editor.updateLayerProps(layer.id, { borderOn: el.checked });
      this._toggleBorderSub(el);
    } else if (input === 'borderWidth') {
      const v = Number(el.value);
      this._setSpan(el, `${v}px`);
      this.editor.updateLayerProps(layer.id, { borderWidth: v });
    } else if (input === 'borderColor') {
      this.editor.updateLayerProps(layer.id, { borderColor: el.value });
      this._syncHexInput(el.parentElement.querySelector('[data-input="borderColorHex"]'), el.value);
    } else if (input === 'borderColorHex') {
      const v = this._normalizeHex(el.value);
      if (v) {
        this.editor.updateLayerProps(layer.id, { borderColor: v });
        this._syncColorInput(el.parentElement.querySelector('[data-input="borderColor"]'), v);
      }
    } else if (input === 'opacity') {
      const v = Number(el.value);
      this._setSpan(el, `${v}%`);
      this.editor.updateLayerProps(layer.id, { opacity: v / 100 });
    } else if (input === 'flipH') {
      this.editor.updateLayerProps(layer.id, { flipH: el.checked });
    } else if (input === 'flipV') {
      this.editor.updateLayerProps(layer.id, { flipV: el.checked });
    } else if (input === 'contentScale') {
      const v = Number(el.value);
      this._setSpan(el, `${v}%`);
      this.editor.updateLayerProps(layer.id, { contentScale: v / 100 });
    } else if (input === 'contentOffsetX') {
      const v = Number(el.value);
      this._setSpan(el, `${v}%`);
      this.editor.updateLayerProps(layer.id, { contentOffsetX: v / 100 });
    } else if (input === 'contentOffsetY') {
      const v = Number(el.value);
      this._setSpan(el, `${v}%`);
      this.editor.updateLayerProps(layer.id, { contentOffsetY: v / 100 });
    }
  }

  _handleClick(e) {
    const segBtn = e.target.closest('.seg-btn');
    if (segBtn) {
      const seg = segBtn.closest('.seg-control');
      const segKey = seg.dataset.seg;
      const val = segBtn.dataset.val;
      this._syncSegActive(seg, val);

      const pane = segBtn.closest('.panel-pane');
      const paneType = pane?.dataset.pane;

      if (paneType === 'canvas' && segKey === 'bgType') {
        this.editor.setCanvasBg({ type: val });
      } else if ((paneType === 'screen' || paneType === 'cam') && segKey === 'shape') {
        const layer = this._currentLayer(paneType);
        if (layer) {
          this.editor.updateLayerProps(layer.id, { shape: val });
          // 切到非圆角的形状时,圆角滑块隐藏
          this._toggleRadiusSlider(pane, val);
        }
      }
      return;
    }

    const sizeBtn = e.target.closest('.canvas-size-btn');
    if (sizeBtn) {
      const w = Number(sizeBtn.dataset.w);
      const h = Number(sizeBtn.dataset.h);
      this.editor.setCanvasSize(w, h);
      this.bodyEl.querySelectorAll('.canvas-size-btn').forEach((b) => b.classList.remove('active'));
      sizeBtn.classList.add('active');
      return;
    }

    const swatch = e.target.closest('.swatch');
    if (swatch) {
      const color = swatch.dataset.color;
      const pane = swatch.closest('.panel-pane');
      const paneType = pane?.dataset.pane;
      if (paneType === 'canvas') {
        this.editor.setCanvasBg({ color, type: 'color' });
        this._syncColorInput(this.bodyEl.querySelector('[data-input="bgColor"]'), color);
        this._syncHexInput(this.bodyEl.querySelector('[data-input="bgColorHex"]'), color);
        this._syncSegActive(this.bodyEl.querySelector('[data-seg="bgType"]'), 'color');
      } else {
        const layer = this._currentLayer(paneType);
        if (layer) {
          this.editor.updateLayerProps(layer.id, { borderColor: color });
          this._syncColorInput(pane.querySelector('[data-input="borderColor"]'), color);
          this._syncHexInput(pane.querySelector('[data-input="borderColorHex"]'), color);
        }
      }
      return;
    }

    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const act = actBtn.dataset.act;
      const pane = actBtn.closest('.panel-pane');
      const layer = this._currentLayer(pane?.dataset.pane);
      if (!layer) return;
      if (act === 'bringToTop') this.editor.bringToTop(layer.id);
      if (act === 'sendToBottom') this.editor.sendToBottom(layer.id);
      if (act === 'resetCrop') {
        this.editor.updateLayerProps(layer.id, {
          contentScale: 1, contentOffsetX: 0, contentOffsetY: 0,
        });
        this._refreshCamPane();
      }
    }
  }

  // ========== Helpers ==========
  _currentLayer(paneType) {
    if (paneType === 'screen') return this.editor.layers.find((l) => l.type === 'screen');
    if (paneType === 'cam') return this.editor.layers.find((l) => l.type === 'cam');
    return null;
  }

  _switchTab(tab) {
    this.activeTab = tab;
    this.tabsEl.querySelectorAll('.panel-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.bodyEl.querySelectorAll('.panel-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  }

  _updateTabAvailability() {
    // Screen / cam tab 只在对应图层存在时可用
    const hasScreen = this.editor.layers.some((l) => l.type === 'screen');
    const hasCam = this.editor.layers.some((l) => l.type === 'cam');
    this.tabsEl.querySelector('[data-tab="screen"]').classList.toggle('disabled', !hasScreen);
    this.tabsEl.querySelector('[data-tab="cam"]').classList.toggle('disabled', !hasCam);
  }

  _refreshActivePane() {
    if (this.activeTab === 'canvas') this._refreshCanvasPane();
    else if (this.activeTab === 'screen') this._refreshScreenPane();
    else if (this.activeTab === 'cam') this._refreshCamPane();
  }

  _refreshCanvasPane() {
    const pane = this.bodyEl.querySelector('[data-pane="canvas"]');
    pane.querySelectorAll('.canvas-size-btn').forEach((btn) => {
      const w = Number(btn.dataset.w);
      const h = Number(btn.dataset.h);
      btn.classList.toggle('active', w === this.editor.canvasW && h === this.editor.canvasH);
    });
    this._syncSegActive(pane.querySelector('[data-seg="bgType"]'), this.editor.canvasBg.type);
    this._syncColorInput(pane.querySelector('[data-input="bgColor"]'), this.editor.canvasBg.color);
    this._syncHexInput(pane.querySelector('[data-input="bgColorHex"]'), this.editor.canvasBg.color);
  }

  _refreshScreenPane(layer = null) {
    layer = layer || this._currentLayer('screen');
    if (!layer) return;
    this._refreshLayerPane(this.bodyEl.querySelector('[data-pane="screen"]'), layer);
  }

  _refreshCamPane(layer = null) {
    layer = layer || this._currentLayer('cam');
    if (!layer) return;
    this._refreshLayerPane(this.bodyEl.querySelector('[data-pane="cam"]'), layer);
  }

  _refreshLayerPane(pane, layer) {
    const setVal = (key, v) => {
      const el = pane.querySelector(`[data-input="${key}"]`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number' || el.type === 'range' || el.type === 'color' || el.type === 'text') el.value = v;
    };
    setVal('x', Math.round(layer.x));
    setVal('y', Math.round(layer.y));
    setVal('w', Math.round(layer.w));
    setVal('h', Math.round(layer.h));
    setVal('lockRatio', layer.lockRatio);
    setVal('radius', Math.round(layer.radius ?? 0));
    setVal('borderOn', layer.borderOn);
    setVal('borderWidth', layer.borderWidth ?? 2);
    setVal('borderColor', layer.borderColor);
    setVal('borderColorHex', layer.borderColor);
    setVal('opacity', Math.round((layer.opacity ?? 1) * 100));
    if (layer.type === 'cam') {
      setVal('flipH', layer.flipH);
      setVal('flipV', layer.flipV);
      setVal('contentScale', Math.round((layer.contentScale ?? 1) * 100));
      setVal('contentOffsetX', Math.round((layer.contentOffsetX ?? 0) * 100));
      setVal('contentOffsetY', Math.round((layer.contentOffsetY ?? 0) * 100));
      this._setSpan(pane.querySelector('[data-input="contentScale"]'), `${Math.round((layer.contentScale ?? 1) * 100)}%`);
      this._setSpan(pane.querySelector('[data-input="contentOffsetX"]'), `${Math.round((layer.contentOffsetX ?? 0) * 100)}%`);
      this._setSpan(pane.querySelector('[data-input="contentOffsetY"]'), `${Math.round((layer.contentOffsetY ?? 0) * 100)}%`);
    }
    this._syncSegActive(pane.querySelector('[data-seg="shape"]'), layer.shape);
    this._setSpan(pane.querySelector('[data-input="radius"]'), `${Math.round(layer.radius ?? 0)}px`);
    this._setSpan(pane.querySelector('[data-input="borderWidth"]'), `${layer.borderWidth ?? 2}px`);
    this._setSpan(pane.querySelector('[data-input="opacity"]'), `${Math.round((layer.opacity ?? 1) * 100)}%`);
    this._toggleRadiusSlider(pane, layer.shape);
    this._toggleBorderSub(pane.querySelector('[data-input="borderOn"]'));
  }

  _syncSegActive(segEl, val) {
    if (!segEl) return;
    segEl.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
  }

  _syncColorInput(el, color) {
    if (el) el.value = color;
  }

  _syncHexInput(el, color) {
    if (el) el.value = color;
  }

  _normalizeHex(v) {
    if (!v) return null;
    v = v.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      return '#' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase();
    }
    return null;
  }

  _setSpan(rangeEl, text) {
    if (!rangeEl) return;
    const span = rangeEl.closest('.panel-slider-group')?.querySelector('[data-val]');
    if (span) span.textContent = text;
  }

  _toggleRadiusSlider(pane, shape) {
    const slider = pane.querySelector('[data-slider="radius"]');
    if (!slider) return;
    // 屏幕:只在 rounded 时显示;摄像头:只在 rectangle 时显示(圆角矩形)
    const paneType = pane.dataset.pane;
    const show = (paneType === 'screen' && shape === 'rounded') || (paneType === 'cam' && shape === 'rectangle');
    slider.classList.toggle('hidden', !show);
  }

  _toggleBorderSub(checkboxEl) {
    if (!checkboxEl) return;
    const sub = checkboxEl.closest('.panel-section')?.querySelector('[data-when="borderOn"]');
    if (sub) sub.classList.toggle('hidden', !checkboxEl.checked);
  }
}
