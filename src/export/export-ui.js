/**
 * 导出对话框 UI 控制(v1.0 第五步)
 *
 * 点"导出视频" → 弹对话框 → 进度 → 保存到本地。
 * 支持取消(直接关对话框, pipeline 自己停)。
 */
import { exportSession, pickEngineSync, prewarmEngine } from './exporter.js';
import { showToast } from '../ui/toast.js';

const STAGE_LABELS = {
  'preparing': '准备音视频输入…',
  'recording': '实时合成录制中',
  'encoding': '编码中',
  'done': '完成',
  'fallback-to-mediarecorder': 'WebCodecs 出错, 自动切到 MediaRecorder 重试…',
};

const ENGINE_LABELS = {
  'mediarecorder': 'MediaRecorder (webm, 实时 1x)',
  'webcodecs': 'WebCodecs (mp4, 硬件加速 2x)',
};

export class ExportUI {
  constructor(editor) {
    this.editor = editor;
    this.dialog = document.getElementById('exportDialog');
    this.titleEl = document.getElementById('exportDialogTitle');
    this.stageEl = document.getElementById('exportDialogStage');
    this.progressEl = document.getElementById('exportProgressBar');
    this.hintEl = document.getElementById('exportDialogHint');
    this.btnCancel = document.getElementById('exportDialogCancel');
    this.btnSave = document.getElementById('exportDialogSave');
    this.btnExport = document.getElementById('btnExport');

    this.resultBlob = null;
    this.resultExt = 'webm';
    this.running = false;
    this._cancelled = false;

    this.btnExport.addEventListener('click', () => this.start());
    this.btnCancel.addEventListener('click', () => this.cancel());
    this.btnSave.addEventListener('click', () => this.save());

    // 预热: app 加载时就探测一次, 不等用户点击导出, ETA 更准
    prewarmEngine();
  }

  cancel() {
    if (this.running) {
      this._cancelled = true;
      this.titleEl.textContent = '已取消';
      this.stageEl.textContent = '任务已标记取消, 稍候关闭…';
      setTimeout(() => this.close(), 800);
    } else {
      this.close();
    }
  }

  open() {
    this.dialog.classList.remove('hidden');
    const engine = pickEngineSync();
    const effective = Math.max(0, (this.editor.trimOut || this.editor.getDuration()) - this.editor.trimIn);
    const eta = engine === 'webcodecs'
      ? `预计 ${Math.ceil(effective / 2.2)}-${Math.ceil(effective / 1.5)} 秒(硬件加速, 2x 倍速播放)`
      : `预计 ${Math.ceil(effective)}-${Math.ceil(effective * 1.2)} 秒(实时录一遍)`;
    this.titleEl.textContent = '准备导出…';
    this.stageEl.textContent = '初始化中';
    this.progressEl.style.width = '0%';
    this.hintEl.textContent = `引擎: ${ENGINE_LABELS[engine]}\n有效时长 ${effective.toFixed(1)}s · ${eta}`;
    this.btnSave.classList.add('hidden');
    this.btnCancel.textContent = '取消';
    this.resultBlob = null;
    this._startedAt = Date.now();
    this._currentStage = '';
    this._cancelled = false;
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = setInterval(() => this._tickElapsed(), 1000);
  }

  close() {
    this.dialog.classList.add('hidden');
    this.running = false;
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  }

  _tickElapsed() {
    if (!this.running || !this._currentStage) return;
    const sec = Math.floor((Date.now() - this._startedAt) / 1000);
    const label = STAGE_LABELS[this._currentStage] || this._currentStage;
    this.stageEl.textContent = `${label} · 已用时 ${sec}s`;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.open();

    const session = this.editor.session;
    if (!session) {
      this.hintEl.textContent = '没有会话可导出';
      this.running = false;
      return;
    }

    try {
      const editorState = {
        canvasW: this.editor.canvasW,
        canvasH: this.editor.canvasH,
        canvasBg: this.editor.canvasBg,
        durationSec: this.editor.getDuration(),
        layers: this.editor.layers.map((l) => ({
          id: l.id,
          type: l.type,
          x: l.x, y: l.y, w: l.w, h: l.h,
          visible: l.visible !== false,
          // 5c 会用到, 先带上
          shape: l.shape, radius: l.radius,
          flipH: l.flipH, flipV: l.flipV,
          borderOn: l.borderOn, borderWidth: l.borderWidth, borderColor: l.borderColor,
          contentScale: l.contentScale, contentOffsetX: l.contentOffsetX, contentOffsetY: l.contentOffsetY,
          opacity: l.opacity,
        })),
      };

      const result = await exportSession(session, editorState, {
        trimIn: this.editor.trimIn,
        trimOut: this.editor.trimOut,
        onStage: (s) => {
          this._currentStage = s;
          this.stageEl.textContent = STAGE_LABELS[s] || s;
          if (s === 'recording' || s === 'encoding') {
            this.titleEl.textContent = '合成中';
            this._startedAt = Date.now();
          } else if (s === 'preparing') {
            this.titleEl.textContent = '准备中';
          }
        },
        onProgress: (p) => {
          this.progressEl.style.width = `${Math.round(p * 100)}%`;
        },
      });

      if (this._cancelled) return;

      this.resultBlob = result.blob;
      this.resultExt = result.ext || 'webm';
      this.titleEl.textContent = '导出完成';
      this.stageEl.textContent = `文件大小 ${this._fmtSize(result.blob.size)}`;
      this.progressEl.style.width = '100%';
      this.hintEl.textContent = `格式: ${result.mimeType}\n点"保存到本地"下载 .${this.resultExt}`;
      this.btnSave.classList.remove('hidden');
      this.btnCancel.textContent = '关闭';
    } catch (err) {
      if (this._cancelled) return;
      console.error('export failed', err);
      this.titleEl.textContent = '导出失败';
      this.stageEl.textContent = String(err?.message || err).slice(0, 200);
      this.hintEl.textContent = '请查看控制台 (F12) 详细日志。';
    } finally {
      this.running = false;
    }
  }

  async save() {
    if (!this.resultBlob) return;
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ext = this.resultExt || 'webm';
    const name = `画布_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.${ext}`;

    try {
      if ('showSaveFilePicker' in window) {
        const accept = ext === 'mp4'
          ? { 'video/mp4': ['.mp4'] }
          : { 'video/webm': ['.webm'] };
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: `${ext.toUpperCase()} Video`, accept }],
        });
        const w = await handle.createWritable();
        await w.write(this.resultBlob);
        await w.close();
        this.close();
        showToast(`已保存 ${handle.name}`, { kind: 'success' });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, fallback to download', e);
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(this.resultBlob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    this.close();
    showToast(`已下载 ${name}（看浏览器下载栏）`, { kind: 'success' });
  }

  _fmtSize(b) {
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 ** 3)).toFixed(2)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
  }
}
