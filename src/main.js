import {
  captureScreen,
  captureCamera,
  startDualRecording,
  stopStream,
  pickSupportedMimeType,
} from './capture/recorder.js';
import {
  makeSessionId,
  saveSession,
  listSessions,
  getSession,
  deleteSession,
  estimateStorage,
  requestPersistent,
} from './storage/db.js';
import { Editor } from './editor/editor.js';
import { Panel } from './editor/panel.js';
import { Timeline } from './editor/timeline.js';
import { ExportUI } from './export/export-ui.js';
import {
  beauty,
  PRESETS,
  setBeauty,
  loadBeauty,
  resetBeauty,
  applyPreset,
  getActivePresetKey,
  getFilterString,
} from './capture/beauty.js';
import { loadPrefs, savePrefs } from './editor/prefs.js';
import { createRecIndicator } from './ui/rec-indicator.js';
import { showToast } from './ui/toast.js';

const appRoot = document.querySelector('.app');
const editor = new Editor();
const panel = new Panel(editor);
const timeline = new Timeline(editor);
const exportUI = new ExportUI(editor);
editor.onClose(() => {
  appRoot.classList.remove('hidden');
});

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const btnStart = $('btnStart');
const btnStop = $('btnStop');
const timerEl = $('timer');
const screenPreview = $('screenPreview');
const screenPlaceholder = $('screenPlaceholder');
const camPreview = $('camPreview');
const camPlaceholder = $('camPlaceholder');
const camPlaceholderText = $('camPlaceholderText');
const storageInfoEl = $('storageInfo');
const sessionsList = $('sessionsList');
const sessionsCount = $('sessionsCount');
const sessionCardTemplate = $('sessionCardTemplate');

const sessionVideoUrls = new Map(); // sessionId -> [url, url] for cleanup

let state = {
  camStream: null,
  screenStream: null,
  recording: null, // { stop, result, startedAt }
  timerInterval: null,
  indicator: null, // 录制中浮窗 / 标题 / favicon
};

function setStatus(msg, kind = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function checkEnvironment() {
  const problems = [];
  if (!window.isSecureContext) problems.push('非安全上下文');
  if (!navigator.mediaDevices?.getDisplayMedia) problems.push('缺少 getDisplayMedia');
  if (!navigator.mediaDevices?.getUserMedia) problems.push('缺少 getUserMedia');
  if (typeof MediaRecorder === 'undefined') problems.push('缺少 MediaRecorder');
  if (!pickSupportedMimeType()) problems.push('未找到支持的编码格式');
  if (!window.indexedDB) problems.push('缺少 IndexedDB');
  return problems;
}

async function initCamera() {
  try {
    const stream = await captureCamera({ video: true, audio: true });
    state.camStream = stream;
    camPreview.srcObject = stream;
    camPreview.classList.remove('hidden');
    camPlaceholder.classList.add('hidden');
    btnStart.disabled = false;
    return true;
  } catch (err) {
    const name = err.name || '';
    let msg;
    if (name === 'NotAllowedError') msg = '摄像头权限被拒绝。没有摄像头也可录屏,但无法合成人像。';
    else if (name === 'NotFoundError') msg = '未检测到摄像头设备。';
    else msg = `摄像头启动失败:${err.message}`;
    camPlaceholderText.textContent = msg;
    // 允许继续只录屏幕
    btnStart.disabled = false;
    return false;
  }
}

function applyBeautyToPreview() {
  if (camPreview) camPreview.style.filter = getFilterString();
}

function initBeautyControls() {
  loadBeauty(loadPrefs()?.beauty);
  applyBeautyToPreview();

  const sliders = [
    { id: 'beautyBrightness', key: 'brightness', fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'beautyContrast',   key: 'contrast',   fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'beautySaturate',   key: 'saturate',   fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'beautyHueRotate',  key: 'hueRotate',  fmt: (v) => `${v > 0 ? '+' : ''}${v}°` },
    { id: 'beautySoftness',   key: 'softness',   fmt: (v) => v.toFixed(1) },
  ];

  function syncSliders() {
    for (const { id, key, fmt } of sliders) {
      const slider = $(id);
      const val = $(id + 'Val');
      if (slider) slider.value = beauty[key];
      if (val) val.textContent = fmt(beauty[key]);
    }
  }

  function syncPresetActive() {
    const active = getActivePresetKey();
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === active);
    });
  }

  function persist() {
    savePrefs({ beauty: { ...beauty } });
  }

  // 滑块事件
  for (const { id, key, fmt } of sliders) {
    const slider = $(id);
    const val = $(id + 'Val');
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      setBeauty({ [key]: v });
      val.textContent = fmt(v);
      applyBeautyToPreview();
      syncPresetActive();
      persist();
    });
  }

  // 预设按钮
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      syncSliders();
      applyBeautyToPreview();
      syncPresetActive();
      persist();
    });
  });

  // 重置按钮
  const resetBtn = $('beautyReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetBeauty();
      syncSliders();
      applyBeautyToPreview();
      syncPresetActive();
      persist();
    });
  }

  syncSliders();
  syncPresetActive();
}

async function updateStorageInfo() {
  const est = await estimateStorage();
  if (est) {
    storageInfoEl.textContent = `本地存储 · 已用 ${formatSize(est.usage)} / 配额 ${formatSize(est.quota)}`;
  }
}

function startTimer(fromMs = 0) {
  const startTs = Date.now() - fromMs;
  timerEl.classList.remove('hidden');
  timerEl.textContent = formatDuration(fromMs);
  state.timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTs;
    timerEl.textContent = formatDuration(elapsed);
    if (state.indicator) state.indicator.tick(elapsed);
  }, 500);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  timerEl.classList.add('hidden');
  if (state.indicator) {
    state.indicator.stop();
    state.indicator = null;
  }
}

async function onStart() {
  btnStart.disabled = true;

  try {
    setStatus('请在弹出的选择框中选择要录制的屏幕或窗口…');
    state.screenStream = await captureScreen();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('已取消屏幕选择。点击按钮可重试。', 'error');
    } else {
      setStatus(`获取屏幕失败:${err.message}`, 'error');
    }
    btnStart.disabled = false;
    return;
  }

  screenPreview.srcObject = state.screenStream;
  screenPreview.classList.remove('hidden');
  screenPlaceholder.classList.add('hidden');
  try { await screenPreview.play(); } catch {}

  const recording = startDualRecording(state.screenStream, state.camStream);
  state.recording = recording;

  btnStop.classList.remove('hidden');
  btnStart.classList.add('hidden');
  setStatus('录制中…点"停止录制"结束。', 'recording');

  // 跨窗口提示:标签页标题 + favicon + Document PiP 浮窗(始终置顶)
  state.indicator = createRecIndicator({ onStop });
  startTimer(0);

  // 录"整个屏幕"时,浮窗会被一起录入(浏览器/OS 限制,无法规避)
  try {
    const surface = state.screenStream.getVideoTracks()[0].getSettings().displaySurface;
    if (surface === 'monitor') {
      showToast(
        '提示:你选的是"整个屏幕",录制中浮窗会被一起录进视频。下次想避免,在选择框里选"应用窗口"或"标签页"即可。',
        { kind: 'warn', duration: 6000 }
      );
    }
  } catch {}

  // 用户从浏览器的"停止共享"按钮停止屏幕共享时,自动停止录制
  state.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
    if (state.recording) onStop();
  });
}

async function onStop() {
  if (!state.recording) return;
  const rec = state.recording;
  state.recording = null;
  btnStop.disabled = true;

  rec.stop();
  setStatus('正在整理录制文件…');
  stopTimer();

  let result;
  try {
    result = await rec.result;
  } catch (err) {
    setStatus(`录制出错:${err.message}`, 'error');
    cleanupStreams();
    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
    btnStart.disabled = false;
    btnStop.disabled = false;
    return;
  }

  // 停屏幕流(摄像头流保持活着,给下次录制用)
  stopStream(state.screenStream);
  state.screenStream = null;
  screenPreview.srcObject = null;
  screenPreview.classList.add('hidden');
  screenPlaceholder.classList.remove('hidden');

  const session = {
    id: makeSessionId(),
    createdAt: result.startedAt,
    durationMs: result.durationMs,
    screen: {
      blob: result.screen.blob,
      mimeType: result.screen.mimeType,
      size: result.screen.blob.size,
    },
    cam: result.cam
      ? {
          blob: result.cam.blob,
          mimeType: result.cam.mimeType,
          size: result.cam.blob.size,
        }
      : null,
  };

  try {
    await saveSession(session);
  } catch (err) {
    setStatus(`保存到 IndexedDB 失败:${err.message}`, 'error');
  }

  const totalSize = session.screen.size + (session.cam?.size || 0);
  setStatus(
    `录制完成 · 时长 ${formatDuration(session.durationMs)} · 总大小 ${formatSize(totalSize)} · 已存入本地 IndexedDB`,
    'success'
  );

  btnStop.classList.add('hidden');
  btnStart.classList.remove('hidden');
  btnStart.disabled = false;
  btnStop.disabled = false;
  btnStart.textContent = '再录一次';

  await refreshSessionsList();
  await updateStorageInfo();
}

function cleanupStreams() {
  stopStream(state.screenStream);
  state.screenStream = null;
  screenPreview.srcObject = null;
  screenPreview.classList.add('hidden');
  screenPlaceholder.classList.remove('hidden');
}

function renderSessionCard(session) {
  const node = sessionCardTemplate.content.cloneNode(true);
  const card = node.querySelector('.session-card');
  card.dataset.id = session.id;

  const date = new Date(session.createdAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  card.querySelector('.session-id').textContent = `${dateStr} · ${session.id}`;
  card.querySelector('.session-duration').textContent = `时长 ${formatDuration(session.durationMs)}`;
  const totalSize = session.screen.size + (session.cam?.size || 0);
  card.querySelector('.session-size').textContent = formatSize(totalSize);

  const screenVideo = card.querySelector('.session-video-screen');
  const screenUrl = URL.createObjectURL(session.screen.blob);
  screenVideo.src = screenUrl;

  const camVideo = card.querySelector('.session-video-cam');
  const camTrack = card.querySelector('.session-track:last-child');
  let camUrl = null;
  if (session.cam) {
    camUrl = URL.createObjectURL(session.cam.blob);
    camVideo.src = camUrl;
  } else {
    camTrack.innerHTML = '<div class="session-track-label">摄像头</div><p style="color:var(--text2);font-size:12px;padding:8px 0;">本次未录制摄像头</p>';
  }

  sessionVideoUrls.set(session.id, camUrl ? [screenUrl, camUrl] : [screenUrl]);

  card.querySelector('.session-edit').addEventListener('click', async () => {
    // 从 DB 重新拉一次,确保用的是最新持久化的 blob(避免 URL 被 revoke 的问题)
    const fresh = await getSession(session.id);
    if (!fresh) return;
    appRoot.classList.add('hidden');
    editor.open(fresh);
  });

  card.querySelector('.session-delete').addEventListener('click', async () => {
    if (!confirm('确认删除这条录制?')) return;
    const urls = sessionVideoUrls.get(session.id) || [];
    urls.forEach((u) => URL.revokeObjectURL(u));
    sessionVideoUrls.delete(session.id);
    await deleteSession(session.id);
    await refreshSessionsList();
    await updateStorageInfo();
  });

  return node;
}

async function refreshSessionsList() {
  // 清理旧 URL
  for (const urls of sessionVideoUrls.values()) urls.forEach((u) => URL.revokeObjectURL(u));
  sessionVideoUrls.clear();

  const sessions = await listSessions();
  sessionsCount.textContent = sessions.length ? `(${sessions.length})` : '';

  if (!sessions.length) {
    sessionsList.innerHTML = '<p class="sessions-empty">还没有录制任何会话。</p>';
    return;
  }

  sessionsList.innerHTML = '';
  for (const s of sessions) {
    sessionsList.appendChild(renderSessionCard(s));
  }
}

async function init() {
  const problems = checkEnvironment();
  if (problems.length) {
    setStatus(`环境检测失败:${problems.join(' / ')}`, 'error');
    return;
  }

  setStatus('请求摄像头授权…首次使用浏览器会询问权限。');
  await initCamera();
  initBeautyControls();
  await requestPersistent();
  await updateStorageInfo();
  await refreshSessionsList();

  if (state.camStream) {
    setStatus('准备就绪。点"开始录屏"选择要录制的屏幕。');
  } else {
    setStatus('摄像头不可用,仍可录屏幕。点"开始录屏"继续。', 'error');
  }

  btnStart.addEventListener('click', onStart);
  btnStop.addEventListener('click', onStop);
}

init();
