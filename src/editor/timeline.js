/**
 * 底部时间轴（v1.0 第四步 · 4d-1）
 *
 * 内容:
 *   - 顶部控件条：播放/暂停、回开头、当前时间 / 总时长
 *   - 刻度带：根据总时长自适应选刻度间隔
 *   - 每图层一条轨道：屏幕轨道用蓝色块、摄像头轨道用橙色块
 *   - 红色播放头：跟随 video.currentTime 移动，拖动可 scrub seek
 *   - 点击轨道空白 → seek
 *
 * 修剪(trim)、分割(split) 在 4d-2 再加。
 */

export class Timeline {
  constructor(editor) {
    this.editor = editor;
    this.rootEl = document.getElementById('editorTimeline');

    this.duration = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.isScrubbing = false;
    this._wasPlayingBeforeScrub = false;

    this.trimIn = 0;
    this.trimOut = 0;
    this.isTrimDragging = false;

    this._buildUI();
    this._bindEvents();

    editor.onTimeUpdate((cur, dur) => {
      // 二道防线: webm Infinity 漏过来也不会让 ruler 死循环
      this.duration = Number.isFinite(dur) && dur > 0 ? dur : 0;
      if (!this.isScrubbing) this.currentTime = Number.isFinite(cur) ? cur : 0;
      // 时间文字只在整秒变化时重写 DOM(每帧改文字会烧 CPU)
      const curSec = Math.floor(this.currentTime);
      if (curSec !== this._lastCurSec) {
        this._lastCurSec = curSec;
        this.curTimeEl.textContent = this._fmtTime(this.currentTime);
      }
      this._renderPlayhead();
      // duration 变化时重画刻度和片段(一般只会触发一次)
      if (dur && Math.abs(dur - this._lastRenderedDuration) > 0.01) {
        this._lastRenderedDuration = dur;
        this._invalidateWidth();
        this._renderRuler();
        this._renderClips();
        this._renderTrim();
      }
    });

    editor.onPlayStateChange((playing) => {
      this.isPlaying = playing;
      this._renderPlayBtn();
    });

    editor.onTrimChange((tIn, tOut) => {
      this.trimIn = tIn;
      this.trimOut = tOut;
      this._renderTrim();
    });
  }

  // ========== UI ==========
  _buildUI() {
    this.rootEl.innerHTML = `
      <div class="timeline-topbar">
        <button class="timeline-playbtn" id="tlPlayBtn" title="播放/暂停 (空格)">▶</button>
        <button class="timeline-ctrlbtn" id="tlSeekStart" title="回到开头">⏮</button>
        <div class="timeline-time">
          <span class="cur" id="tlCurTime">00:00</span>
          <span> / </span>
          <span id="tlDurTime">00:00</span>
        </div>
        <div class="timeline-hint">点击轨道跳转 · 拖红头精细定位 · 拖黄柄修剪头尾</div>
      </div>
      <div class="timeline-body" id="tlBody">
        <div class="timeline-ruler" id="tlRuler"></div>
        <div class="timeline-tracks" id="tlTracks"></div>
        <div class="timeline-seekbar" id="tlSeekbar"></div>
        <div class="timeline-trim-mask left" id="tlTrimMaskL"></div>
        <div class="timeline-trim-mask right" id="tlTrimMaskR"></div>
        <div class="timeline-trim-handle left" id="tlTrimHandleL" title="开头修剪(拖动裁掉开头)">
          <div class="timeline-trim-grip"></div>
        </div>
        <div class="timeline-trim-handle right" id="tlTrimHandleR" title="结尾修剪(拖动裁掉结尾)">
          <div class="timeline-trim-grip"></div>
        </div>
        <div class="timeline-playhead" id="tlPlayhead" style="left:0">
          <div class="timeline-playhead-handle" id="tlPlayheadHandle"></div>
        </div>
      </div>
    `;

    this.btnPlay = this.rootEl.querySelector('#tlPlayBtn');
    this.btnSeekStart = this.rootEl.querySelector('#tlSeekStart');
    this.curTimeEl = this.rootEl.querySelector('#tlCurTime');
    this.durTimeEl = this.rootEl.querySelector('#tlDurTime');
    this.bodyEl = this.rootEl.querySelector('#tlBody');
    this.rulerEl = this.rootEl.querySelector('#tlRuler');
    this.tracksEl = this.rootEl.querySelector('#tlTracks');
    this.seekbarEl = this.rootEl.querySelector('#tlSeekbar');
    this.playheadEl = this.rootEl.querySelector('#tlPlayhead');
    this.playheadHandle = this.rootEl.querySelector('#tlPlayheadHandle');
    this.trimMaskL = this.rootEl.querySelector('#tlTrimMaskL');
    this.trimMaskR = this.rootEl.querySelector('#tlTrimMaskR');
    this.trimHandleL = this.rootEl.querySelector('#tlTrimHandleL');
    this.trimHandleR = this.rootEl.querySelector('#tlTrimHandleR');

    this._lastRenderedDuration = 0;
    this._lastCurSec = -1;
    this._lastDurShown = -1;
    this._cachedWidth = null;
  }

  _bindEvents() {
    this.btnPlay.addEventListener('click', () => this.editor.togglePlay());
    this.btnSeekStart.addEventListener('click', () => this.editor.seek(0));

    this.seekbarEl.addEventListener('pointerdown', (e) => {
      const t = this._xToTime(e.clientX);
      this.editor.seek(t);
    });

    this.playheadHandle.addEventListener('pointerdown', (e) => this._startScrub(e));
    this.trimHandleL.addEventListener('pointerdown', (e) => this._startTrimDrag('left', e));
    this.trimHandleR.addEventListener('pointerdown', (e) => this._startTrimDrag('right', e));

    window.addEventListener('resize', () => {
      this._invalidateWidth();
      this._renderRuler();
      this._renderClips();
      this._renderPlayhead();
      this._renderTrim();
    });

    window.addEventListener('keydown', (e) => {
      if (!this._isEditorOpen()) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.editor.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.editor.seek(this.currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.editor.seek(this.currentTime + (e.shiftKey ? 5 : 1));
      } else if (e.code === 'Home') {
        e.preventDefault();
        this.editor.seek(0);
      }
    });
  }

  _isEditorOpen() {
    return this.editor.isOpen?.() ?? true;
  }

  _startTrimDrag(side, e) {
    if (!this.duration) return;
    e.preventDefault();
    e.stopPropagation();
    this.isTrimDragging = true;
    const handle = side === 'left' ? this.trimHandleL : this.trimHandleR;
    try { handle.setPointerCapture?.(e.pointerId); } catch {}
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.editor.pause();

    const onMove = (ev) => {
      const t = this._xToTime(ev.clientX);
      if (side === 'left') this.editor.setTrim(t, this.trimOut);
      else this.editor.setTrim(this.trimIn, t);
    };
    const onUp = () => {
      this.isTrimDragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  _startScrub(e) {
    if (!this.duration) return;
    e.preventDefault();
    this.isScrubbing = true;
    this._wasPlayingBeforeScrub = this.isPlaying;
    if (this.isPlaying) this.editor.pause();
    try { this.playheadHandle.setPointerCapture?.(e.pointerId); } catch {}

    const onMove = (ev) => {
      const t = this._xToTime(ev.clientX);
      this.currentTime = t;
      const sec = Math.floor(t);
      if (sec !== this._lastCurSec) {
        this._lastCurSec = sec;
        this.curTimeEl.textContent = this._fmtTime(t);
      }
      this._renderPlayhead();
      this.editor.seek(t);
    };
    const onUp = () => {
      this.isScrubbing = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (this._wasPlayingBeforeScrub) this.editor.play();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ========== 坐标换算 ==========
  _bodyWidth() {
    if (this._cachedWidth == null) this._cachedWidth = this.bodyEl.clientWidth || 1;
    return this._cachedWidth;
  }
  _invalidateWidth() {
    this._cachedWidth = null;
  }
  _timeToX(t) {
    if (!this.duration) return 0;
    const w = this._bodyWidth();
    return Math.max(0, Math.min(w, (t / this.duration) * w));
  }
  _xToTime(clientX) {
    const rect = this.bodyEl.getBoundingClientRect();
    const x = clientX - rect.left;
    if (!this.duration) return 0;
    const t = (x / rect.width) * this.duration;
    return Math.max(0, Math.min(this.duration, t));
  }

  // ========== 渲染 ==========
  _fmtTime(s) {
    if (!Number.isFinite(s) || s < 0) return '00:00';
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  _renderPlayhead() {
    const x = this._timeToX(this.currentTime);
    // transform 不触发 layout(比 left 便宜得多), 每帧也不卡
    this.playheadEl.style.transform = `translateX(${x}px)`;
  }

  _renderPlayBtn() {
    this.btnPlay.textContent = this.isPlaying ? '⏸' : '▶';
  }

  _renderTrim() {
    if (!this.duration) {
      this.trimMaskL.style.width = '0px';
      this.trimMaskR.style.width = '0px';
      return;
    }
    const w = this._bodyWidth();
    const xIn = this._timeToX(this.trimIn);
    const xOut = this._timeToX(this.trimOut);
    this.trimHandleL.style.transform = `translateX(${xIn}px)`;
    this.trimHandleR.style.transform = `translateX(${xOut}px)`;
    this.trimMaskL.style.width = `${xIn}px`;
    this.trimMaskR.style.left = `${xOut}px`;
    this.trimMaskR.style.width = `${Math.max(0, w - xOut)}px`;
    // 实时显示修剪后有效时长在 dur 位置
    const effective = Math.max(0, this.trimOut - this.trimIn);
    if (effective < this.duration - 0.05) {
      this.durTimeEl.textContent = `${this._fmtTime(effective)} (修剪)`;
    } else {
      this.durTimeEl.textContent = this._fmtTime(this.duration);
    }
    this._lastDurShown = effective;
  }

  _pickTickInterval(duration, width) {
    // 目标：每 80~160px 一个主刻度
    const targetPx = 100;
    const rough = (duration * targetPx) / Math.max(1, width);
    const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
    for (const c of candidates) {
      if (c >= rough) return c;
    }
    return candidates[candidates.length - 1];
  }

  _renderRuler() {
    if (!this.duration) {
      this.rulerEl.innerHTML = '';
      return;
    }
    const width = this._bodyWidth();
    const major = this._pickTickInterval(this.duration, width);
    const minor = major >= 5 ? major / 5 : major / 2;
    const html = [];
    for (let t = 0; t <= this.duration + 0.001; t += minor) {
      const x = (t / this.duration) * width;
      const isMajor = Math.abs(Math.round(t / major) * major - t) < 0.01;
      html.push(`<div class="timeline-ruler-tick${isMajor ? ' major' : ''}" style="left:${x}px"></div>`);
      if (isMajor) {
        html.push(`<div class="timeline-ruler-label" style="left:${x}px">${this._fmtTime(t)}</div>`);
      }
    }
    this.rulerEl.innerHTML = html.join('');
  }

  _renderClips() {
    if (!this.duration) {
      this.tracksEl.innerHTML = '';
      return;
    }
    const width = this._bodyWidth();
    const layers = this.editor.layers || [];
    // 屏幕在下、摄像头在上（与视觉习惯一致：主画面在底部轨道更靠下）
    const ordered = [...layers].sort((a, b) => {
      if (a.type === b.type) return 0;
      if (a.type === 'screen') return -1;
      return 1;
    });

    this.tracksEl.innerHTML = ordered.map((layer) => {
      const label = layer.name || (layer.type === 'screen' ? '屏幕' : '摄像头');
      // 当前只有一段，占满整个时长（4d-2 加 trim 后 left/width 会根据修剪点变化）
      return `
        <div class="timeline-track" data-layer="${layer.id}">
          <span class="timeline-track-label">${label}</span>
          <div class="timeline-clip ${layer.type}" style="left:0;width:${width}px"></div>
        </div>
      `;
    }).join('');
  }
}
