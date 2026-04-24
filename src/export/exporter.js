/**
 * 导出路由(v1.0 第五步)
 *
 * 能力检测 + 失败自动回落:
 *   - WebCodecs(H.264 + AAC) 可用 → C 路径(mp4, 硬件加速 2x)
 *   - C 路径运行中抛错 → 自动降级 B 路径(webm, MediaRecorder)
 *   - 两路都挂 → 抛给 UI 显示导出失败
 */
import { exportWithMediaRecorder } from './recorder-pipeline.js';
import { exportWithWebCodecs, isWebCodecsUsable } from './webcodecs-pipeline.js';

let _engineCache = null;

export async function pickEngine() {
  if (_engineCache) return _engineCache;
  _engineCache = (await isWebCodecsUsable()) ? 'webcodecs' : 'mediarecorder';
  return _engineCache;
}

/** editor 打开时先探测, 导出时直接用缓存(ETA 准确) */
export function prewarmEngine() {
  pickEngine().catch(() => {});
}

export function pickEngineSync() {
  if (_engineCache) return _engineCache;
  if (typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    return 'webcodecs';
  }
  return 'mediarecorder';
}

export async function exportSession(session, editorState, options = {}) {
  const engine = options.engine || await pickEngine();
  const onStage = options.onStage || (() => {});

  if (engine === 'webcodecs') {
    try {
      return await exportWithWebCodecs(session, editorState, options);
    } catch (err) {
      console.warn('[export] WebCodecs 失败, 自动回落到 MediaRecorder:', err);
      onStage('fallback-to-mediarecorder');
      _engineCache = 'mediarecorder';
      return await exportWithMediaRecorder(session, editorState, options);
    }
  }
  return await exportWithMediaRecorder(session, editorState, options);
}
