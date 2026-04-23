export function pickSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

export async function captureScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前浏览器不支持屏幕录制 API。请用 Chrome 或 Edge。');
  }
  return await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
  });
}

export function recordStream(stream, { mimeType, timesliceMs = 1000, bitsPerSecond = 6_000_000 } = {}) {
  const chunks = [];
  const type = mimeType || pickSupportedMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType: type || undefined,
    videoBitsPerSecond: bitsPerSecond,
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type || 'video/webm' });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder 错误'));
  });

  recorder.start(timesliceMs);
  return { recorder, done, mimeType: type };
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
