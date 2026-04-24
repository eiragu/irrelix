/**
 * WebCodecs 路径(v1.0 第五步 · C)
 *
 * 视频: <video> + requestVideoFrameCallback + OffscreenCanvas + VideoEncoder(H.264)
 * 音频: AudioContext.decodeAudioData + AudioEncoder(AAC)
 * 封装: mp4-muxer
 *
 * 加速: video.playbackRate 2x 倍速播放, encoder 按媒体时间戳编码, 输出正常速度的 mp4
 */

import { renderFrame } from './canvas-renderer.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const FPS = 30;
const VIDEO_BITRATE = 6_000_000;
const AUDIO_BITRATE = 128_000;
const AUDIO_CHUNK_FRAMES = 1024;
const PLAYBACK_RATE = 2.0;

export async function isWebCodecsUsable() {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return false;
  try {
    const v = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 2_000_000, framerate: 30,
    });
    return !!v?.supported;
  } catch { return false; }
}

/**
 * 按 pixel count 选 H.264 level, 避开 NotSupportedError。
 * level 3.1 = 720p, 4.0 = 1080p, 5.1 = 4K, 5.2 = 8K
 * codec 字串第三字节是 level 的 hex 编码
 */
function pickAvcCodec(w, h) {
  const pixels = w * h;
  if (pixels <= 921_600)   return 'avc1.42001F'; // baseline 3.1
  if (pixels <= 2_073_600) return 'avc1.640028'; // high 4.0 (1080p)
  if (pixels <= 8_294_400) return 'avc1.640033'; // high 5.1 (4K)
  return 'avc1.640034'; // high 5.2 (8K)
}

export async function exportWithWebCodecs(session, editorState, options = {}) {
  const { trimIn = 0, trimOut = 0, onStage = () => {}, onProgress = () => {} } = options;
  const effective = Math.max(0.1, (trimOut || editorState.durationSec || 0) - trimIn);

  const W = Math.round(editorState.canvasW);
  const H = Math.round(editorState.canvasH);
  const encW = W % 2 ? W - 1 : W;
  const encH = H % 2 ? H - 1 : H;

  onStage('preparing');

  // ----- 音频先解码(同时拿到 sampleRate/channels 配 muxer) -----
  const audioInfo = await decodeCamAudio(session, trimIn, trimOut);

  // ----- 两路 <video> -----
  const screenUrl = URL.createObjectURL(session.screen.blob);
  const camUrl = session.cam ? URL.createObjectURL(session.cam.blob) : null;
  const cleanup = [() => URL.revokeObjectURL(screenUrl)];
  if (camUrl) cleanup.push(() => URL.revokeObjectURL(camUrl));

  const screenVid = makeVideo(screenUrl);
  const camVid = camUrl ? makeVideo(camUrl) : null;

  await Promise.all([videoReady(screenVid), camVid ? videoReady(camVid) : null].filter(Boolean));

  // ----- OffscreenCanvas + muxer + encoders -----
  const canvas = new OffscreenCanvas(encW, encH);
  const ctx = canvas.getContext('2d', { alpha: false });

  const muxerCfg = {
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: encW, height: encH, frameRate: FPS },
    fastStart: 'in-memory',
    // 第一帧时间戳不一定是 0(seek+倍速播放的启动延迟, VideoEncoder 的 DTS 重排), 让 muxer 自己归零
    firstTimestampBehavior: 'offset',
  };
  if (audioInfo) {
    muxerCfg.audio = {
      codec: 'aac',
      sampleRate: audioInfo.sampleRate,
      numberOfChannels: audioInfo.numberOfChannels,
    };
  }
  const muxer = new Muxer(muxerCfg);

  const vEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('[VideoEncoder]', e),
  });
  vEncoder.configure({
    codec: pickAvcCodec(encW, encH),
    width: encW, height: encH,
    bitrate: VIDEO_BITRATE,
    framerate: FPS,
  });

  let aEncoder = null;
  if (audioInfo) {
    aEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error('[AudioEncoder]', e),
    });
    aEncoder.configure({
      codec: 'mp4a.40.2',
      sampleRate: audioInfo.sampleRate,
      numberOfChannels: audioInfo.numberOfChannels,
      bitrate: AUDIO_BITRATE,
    });
  }

  // ----- 编码音频(同步完成, 不等视频) -----
  if (audioInfo && aEncoder) {
    encodeAudio(aEncoder, audioInfo);
  }

  // ----- 视频编码(走 video 倍速播放 + rVFC) -----
  screenVid.currentTime = trimIn;
  if (camVid) camVid.currentTime = trimIn;
  await Promise.all([seekedOnce(screenVid), camVid ? seekedOnce(camVid) : null].filter(Boolean));

  screenVid.playbackRate = PLAYBACK_RATE;
  if (camVid) camVid.playbackRate = PLAYBACK_RATE;

  onStage('encoding');

  const videoMap = { screen: screenVid };
  if (camVid) videoMap.cam = camVid;

  await Promise.all([screenVid.play(), camVid ? camVid.play() : null].filter(Boolean));

  await new Promise((resolve, reject) => {
    const rVFC = typeof screenVid.requestVideoFrameCallback === 'function';
    let frameIdx = 0;
    let finished = false;
    let lastProgress = 0;

    const onFrame = (_now, meta) => {
      if (finished) return;
      const mediaTime = meta?.mediaTime ?? screenVid.currentTime;
      if (mediaTime < trimIn - 0.01) {
        if (rVFC) screenVid.requestVideoFrameCallback(onFrame);
        return;
      }
      try {
        renderFrame(ctx, { ...editorState, canvasW: encW, canvasH: encH }, videoMap);
        const tsUs = Math.max(0, (mediaTime - trimIn) * 1_000_000);
        const vf = new VideoFrame(canvas, { timestamp: tsUs });
        vEncoder.encode(vf, { keyFrame: frameIdx % 60 === 0 });
        vf.close();
        frameIdx++;

        const prog = Math.min(0.99, (mediaTime - trimIn) / effective);
        if (prog - lastProgress > 0.005) {
          lastProgress = prog;
          onProgress(prog);
        }
        if (mediaTime >= trimIn + effective - 0.001) {
          finished = true;
          resolve();
          return;
        }
      } catch (e) {
        finished = true;
        reject(e);
        return;
      }
      if (rVFC) screenVid.requestVideoFrameCallback(onFrame);
    };

    if (rVFC) screenVid.requestVideoFrameCallback(onFrame);
    else {
      const tick = () => {
        if (finished) return;
        onFrame(0, { mediaTime: screenVid.currentTime });
        if (!finished) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // 安全超时
    setTimeout(() => {
      if (!finished) { finished = true; resolve(); }
    }, Math.max(30000, (effective * 3000) / PLAYBACK_RATE));
  });

  screenVid.pause();
  if (camVid) camVid.pause();

  // ----- flush + finalize -----
  await vEncoder.flush();
  vEncoder.close();
  if (aEncoder) { await aEncoder.flush(); aEncoder.close(); }

  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });

  cleanup.reverse().forEach((fn) => { try { fn(); } catch {} });

  onProgress(1);
  onStage('done');
  return { blob, mimeType: 'video/mp4', ext: 'mp4' };
}

// ===== 辅助 =====

function makeVideo(url) {
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  return v;
}

function videoReady(v) {
  return new Promise((res, rej) => {
    if (v.readyState >= 2) return res();
    v.addEventListener('loadeddata', () => res(), { once: true });
    v.addEventListener('error', () => rej(new Error(`视频加载失败: ${v.error?.message || ''}`)), { once: true });
  });
}

function seekedOnce(v) {
  return new Promise((res) => v.addEventListener('seeked', () => res(), { once: true }));
}

/**
 * 从 cam blob 解码音频, 切到 [trimIn, trimOut] 区间。
 * 没有 cam 或解码失败则返回 null(muxer 不配 audio track)。
 */
async function decodeCamAudio(session, trimIn, trimOut) {
  if (!session.cam) return null;
  try {
    const buf = await session.cam.blob.arrayBuffer();
    const actx = new AudioContext();
    const audioBuffer = await actx.decodeAudioData(buf);
    await actx.close();

    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.numberOfChannels;
    const startS = Math.floor(trimIn * sr);
    const endS = Math.floor((trimOut || audioBuffer.duration) * sr);
    const total = Math.max(0, endS - startS);
    if (total === 0) return null;

    // 拷贝 [startS, endS) 的 planar 数据(per channel)
    const channels = [];
    for (let c = 0; c < ch; c++) {
      const src = audioBuffer.getChannelData(c);
      channels.push(src.slice(startS, startS + total));
    }
    return { sampleRate: sr, numberOfChannels: ch, totalFrames: total, channels };
  } catch (e) {
    console.warn('[WebCodecs] 音频解码失败, 输出无声 mp4:', e);
    return null;
  }
}

/** AudioData 按 1024 帧一块喂编码器 */
function encodeAudio(encoder, audioInfo) {
  const { sampleRate, numberOfChannels, totalFrames, channels } = audioInfo;
  for (let off = 0; off < totalFrames; off += AUDIO_CHUNK_FRAMES) {
    const count = Math.min(AUDIO_CHUNK_FRAMES, totalFrames - off);
    // f32-planar: 先 ch0 全部 count 个样本, 然后 ch1, ...
    const planar = new Float32Array(count * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) {
      planar.set(channels[c].subarray(off, off + count), c * count);
    }
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: count,
      numberOfChannels,
      timestamp: Math.round((off / sampleRate) * 1_000_000),
      data: planar,
    });
    encoder.encode(ad);
    ad.close();
  }
}
