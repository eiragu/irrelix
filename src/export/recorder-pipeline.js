/**
 * MediaRecorder 路径(v1.0 第五步 · B 兜底方案)
 *
 * 原理: 隐藏 canvas 逐帧 drawImage 两路 video, captureStream 给 MediaRecorder 录成 webm。
 *        音频从 cam <video>.captureStream 拿 audio track 混进去。
 *
 * 速度: ≈ 视频时长 1x(因为必须实时播放一遍录)
 * 输出: webm
 *
 * 优点: 兼容性极好, 几乎所有 Chromium 浏览器都能跑
 * 缺点: 无法加速, 长视频等待时间长
 */

import { renderFrame } from './canvas-renderer.js';

function pickWebmMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export async function exportWithMediaRecorder(session, editorState, options = {}) {
  const { trimIn = 0, trimOut = 0, onStage = () => {}, onProgress = () => {} } = options;
  const effective = Math.max(0.1, (trimOut || editorState.durationSec || 0) - trimIn);

  onStage('preparing');

  // 1. 建两个隐藏 video 加载 blob
  const screenUrl = URL.createObjectURL(session.screen.blob);
  const camUrl = session.cam ? URL.createObjectURL(session.cam.blob) : null;
  const cleanup = [() => URL.revokeObjectURL(screenUrl)];
  if (camUrl) cleanup.push(() => URL.revokeObjectURL(camUrl));

  const screenVid = document.createElement('video');
  screenVid.src = screenUrl;
  screenVid.muted = true;          // 屏幕音轨不要(避免和麦克风撞声)
  screenVid.playsInline = true;
  screenVid.crossOrigin = 'anonymous';

  const camVid = camUrl ? document.createElement('video') : null;
  if (camVid) {
    camVid.src = camUrl;
    camVid.muted = false;          // 保留口播音
    camVid.playsInline = true;
    camVid.crossOrigin = 'anonymous';
    camVid.volume = 0;             // 本地播放静音(不让用户听到回声), 但 captureStream 的音轨仍有声
  }

  await Promise.all([
    videoReady(screenVid),
    camVid ? videoReady(camVid) : Promise.resolve(),
  ]);

  // 2. 建隐藏 canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(editorState.canvasW);
  canvas.height = Math.round(editorState.canvasH);
  canvas.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none;';
  document.body.appendChild(canvas);
  cleanup.push(() => canvas.remove());
  const ctx = canvas.getContext('2d', { alpha: false });

  const videoMap = { screen: screenVid };
  if (camVid) videoMap.cam = camVid;

  // 3. 拿 canvas video track + cam audio track, 合并成一条录制流
  const fps = 30;
  const vStream = canvas.captureStream(fps);
  const tracks = [vStream.getVideoTracks()[0]];

  if (camVid) {
    try {
      // 启动播放后 captureStream 才有音轨
      await camVid.play();
      camVid.pause();
      camVid.currentTime = trimIn;
      const camStream = camVid.captureStream?.() || camVid.mozCaptureStream?.();
      const audioTrack = camStream?.getAudioTracks()?.[0];
      if (audioTrack) tracks.push(audioTrack);
    } catch (e) {
      console.warn('[export] 无法拿摄像头音频:', e);
    }
  }
  const recordStream = new MediaStream(tracks);

  // 4. 启动 MediaRecorder
  const mimeType = pickWebmMime();
  const recorder = new MediaRecorder(recordStream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const recorderDone = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder 错误'));
  });

  onStage('recording');
  recorder.start(1000);

  // 5. 两路 video seek 到 trimIn, 同步 play
  screenVid.currentTime = trimIn;
  if (camVid) camVid.currentTime = trimIn;
  await Promise.all([seekedOnce(screenVid), camVid ? seekedOnce(camVid) : null].filter(Boolean));

  await Promise.all([
    screenVid.play(),
    camVid ? camVid.play() : null,
  ].filter(Boolean));

  // 6. 每帧 RAF 画 canvas, 直到 effective 时间到
  const t0 = performance.now();
  let rafId = null;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    renderFrame(ctx, editorState, videoMap);
    const elapsed = (performance.now() - t0) / 1000;
    onProgress(Math.min(0.99, elapsed / effective));
    if (elapsed >= effective) {
      stopped = true;
      try { recorder.stop(); } catch {}
      try { screenVid.pause(); camVid?.pause(); } catch {}
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  try {
    await recorderDone;
    onProgress(1);
    onStage('done');
    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
    return { blob, mimeType: mimeType || 'video/webm', ext: 'webm' };
  } finally {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    cleanup.reverse().forEach((fn) => { try { fn(); } catch {} });
  }
}

function videoReady(v) {
  return new Promise((res, rej) => {
    if (v.readyState >= 2) return res();
    v.addEventListener('loadeddata', () => res(), { once: true });
    v.addEventListener('error', () => rej(new Error(`加载视频失败: ${v.error?.message || ''}`)), { once: true });
  });
}

function seekedOnce(v) {
  return new Promise((res) => {
    v.addEventListener('seeked', () => res(), { once: true });
  });
}
