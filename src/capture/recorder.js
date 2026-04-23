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

export async function captureCamera({ video = true, audio = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持摄像头 API。');
  }
  const constraints = {
    video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
    audio,
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

function createRecorder(stream, { mimeType, timesliceMs = 1000, bitsPerSecond = 6_000_000 } = {}) {
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
      resolve({ blob, mimeType: type });
    };
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder 错误'));
  });

  recorder.start(timesliceMs);
  return { recorder, done };
}

export function startDualRecording(screenStream, camStream) {
  const startedAt = Date.now();

  const screen = createRecorder(screenStream, { bitsPerSecond: 6_000_000 });
  const cam = camStream
    ? createRecorder(camStream, { bitsPerSecond: 2_500_000 })
    : null;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { if (screen.recorder.state !== 'inactive') screen.recorder.stop(); } catch {}
    try { if (cam && cam.recorder.state !== 'inactive') cam.recorder.stop(); } catch {}
  };

  const result = Promise.all([
    screen.done,
    cam ? cam.done : Promise.resolve(null),
  ]).then(([s, c]) => ({
    startedAt,
    stoppedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    screen: s,
    cam: c,
  }));

  return { stop, result };
}

export function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
