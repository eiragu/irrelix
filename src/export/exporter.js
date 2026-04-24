/**
 * 导出路由(v1.0 第五步)
 *
 * 能力检测自动选引擎:
 *   - VideoEncoder + AudioEncoder(H.264 + AAC) 可用 → C 路径(WebCodecs + mp4-muxer, 输出 mp4, 硬件加速 2x)
 *   - 否则 → B 路径(MediaRecorder, 输出 webm, 实时 1x)
 *
 * 两条路径都有完整音频。
 */
import { exportWithMediaRecorder } from './recorder-pipeline.js';
import { exportWithWebCodecs, isWebCodecsUsable } from './webcodecs-pipeline.js';

let _engineCache = null;

export async function pickEngine() {
  if (_engineCache) return _engineCache;
  _engineCache = (await isWebCodecsUsable()) ? 'webcodecs' : 'mediarecorder';
  return _engineCache;
}

/** 同步粗略判断 (UI 显示预期引擎用), 结果可能比真实探测宽松 */
export function pickEngineSync() {
  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    return 'webcodecs';
  }
  return 'mediarecorder';
}

export async function exportSession(session, editorState, options = {}) {
  const engine = options.engine || await pickEngine();
  if (engine === 'webcodecs') {
    return await exportWithWebCodecs(session, editorState, options);
  }
  return await exportWithMediaRecorder(session, editorState, options);
}
