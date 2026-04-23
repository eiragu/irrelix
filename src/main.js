import { captureScreen, recordStream, stopStream, pickSupportedMimeType } from './capture/recorder.js';

const DURATION_MS = 10_000;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const btnRecord = $('btnRecord');
const progressEl = $('progress');
const progressFill = $('progressFill');
const progressText = $('progressText');
const previewEl = $('preview');
const resultEl = $('result');
const resultInfo = $('resultInfo');
const downloadLink = $('downloadLink');

function setStatus(msg, kind = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}

function showProgress(show) {
  progressEl.classList.toggle('hidden', !show);
}

function showResult(show) {
  resultEl.classList.toggle('hidden', !show);
}

function showPreview(show) {
  previewEl.classList.toggle('hidden', !show);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function checkEnvironment() {
  const problems = [];
  if (!window.isSecureContext) problems.push('非安全上下文(需要 HTTPS 或 localhost)');
  if (!navigator.mediaDevices?.getDisplayMedia) problems.push('缺少 getDisplayMedia API');
  if (typeof MediaRecorder === 'undefined') problems.push('缺少 MediaRecorder API');
  if (!pickSupportedMimeType()) problems.push('未找到支持的视频编码格式');
  return problems;
}

async function runRecord() {
  btnRecord.disabled = true;
  showPreview(false);
  showResult(false);

  let screenStream;
  try {
    setStatus('正在请求屏幕录制权限…浏览器会弹出选择框,请选择要录制的屏幕或窗口。');
    screenStream = await captureScreen();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('已取消屏幕选择。点击按钮可重试。', 'error');
    } else {
      setStatus(`获取屏幕失败:${err.message}`, 'error');
    }
    btnRecord.disabled = false;
    return;
  }

  setStatus('录制中… 请正常操作,10 秒后自动停止。');
  showProgress(true);
  progressFill.style.width = '0%';

  const { recorder, done, mimeType } = recordStream(screenStream);

  const startTs = Date.now();
  const tick = setInterval(() => {
    const elapsed = Date.now() - startTs;
    const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `录制中 ${(elapsed / 1000).toFixed(1)}s / ${DURATION_MS / 1000}s`;
  }, 100);

  screenStream.getVideoTracks()[0].addEventListener('ended', () => {
    if (recorder.state !== 'inactive') {
      clearInterval(tick);
      try { recorder.stop(); } catch {}
    }
  });

  setTimeout(() => {
    clearInterval(tick);
    if (recorder.state !== 'inactive') recorder.stop();
  }, DURATION_MS);

  let blob;
  try {
    blob = await done;
  } catch (err) {
    setStatus(`录制失败:${err.message}`, 'error');
    stopStream(screenStream);
    showProgress(false);
    btnRecord.disabled = false;
    return;
  }

  stopStream(screenStream);
  showProgress(false);

  const url = URL.createObjectURL(blob);
  previewEl.src = url;
  showPreview(true);

  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const filename = `huabu-test-${Date.now()}.${ext}`;
  downloadLink.href = url;
  downloadLink.download = filename;

  resultInfo.textContent = `录制完成:${filename} · ${formatSize(blob.size)} · ${mimeType || '自动'}`;
  showResult(true);
  setStatus('录制完成!可以回放预览,或点击下载保存到本地。', 'success');

  btnRecord.disabled = false;
  btnRecord.textContent = '再录一次';
}

function init() {
  const problems = checkEnvironment();
  if (problems.length) {
    setStatus(`环境检测失败:${problems.join(' / ')}`, 'error');
    btnRecord.disabled = true;
    return;
  }
  btnRecord.addEventListener('click', runRecord);
}

init();
