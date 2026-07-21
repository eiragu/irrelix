/**
 * 录制中浮窗 / 跨窗口提示
 *
 * 用户切走当前标签页时，仍能看到"正在录制"：
 *  1. document.title       变成「● 录制中 00:23 — 原标题」
 *  2. favicon              换成红色录制图标
 *  3. Document PiP 浮窗     红点 + 计时 + 停止按钮，始终置顶
 *
 * 关于是否会被录进视频：
 *  - getDisplayMedia 返回的 MediaStream 是浏览器在 OS 层根据用户选择
 *    （标签页 / 窗口 / 整个屏幕）抓的像素流，这里的任何 UI 改动都不会
 *    影响那条流——它们是独立的。
 *  - 选"标签页"或"窗口"录制时：浮窗 / 标签页 / favicon 都不在录制源里，
 *    绝对不会被录进视频。
 *  - 选"整个屏幕"录制时：屏幕上看得到的一切（包括 PiP 浮窗、浏览器
 *    标签栏）都会被一起录入，这是 Web 录屏 API 的硬限制。
 */

const ORIGINAL_TITLE = document.title;
const FAVICON_LINK = document.querySelector('link[rel="icon"]');
const ORIGINAL_FAVICON = FAVICON_LINK?.href || '';

const REC_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23FF4757'/%3E%3Ccircle cx='50' cy='50' r='30' fill='white'/%3E%3C/svg%3E";

function fmt(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function createRecIndicator({ onStop } = {}) {
  let pipWindow = null;
  let pipTimeEl = null;
  let stopped = false;

  if (FAVICON_LINK) FAVICON_LINK.href = REC_FAVICON;
  document.title = `● 录制中 00:00 — ${ORIGINAL_TITLE}`;

  async function openPip() {
    if (!('documentPictureInPicture' in window)) return;
    try {
      const win = await window.documentPictureInPicture.requestWindow({
        width: 240,
        height: 64,
      });
      const doc = win.document;
      doc.documentElement.lang = 'zh-CN';
      doc.title = '录制中';

      const style = doc.createElement('style');
      style.textContent = `
        :root { color-scheme: dark; }
        html, body { margin: 0; height: 100%; }
        body {
          display: flex; align-items: center; gap: 10px;
          padding: 0 12px;
          background: #1a1f2e;
          color: #E8E8E8;
          font: 13px/1.2 -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
          user-select: none;
        }
        .dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: #FF4757;
          box-shadow: 0 0 8px #FF4757;
          animation: pulse 1.2s ease-in-out infinite;
          flex: none;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.35; transform: scale(0.8); }
        }
        .label { font-weight: 600; letter-spacing: 0.5px; }
        .time {
          margin-left: auto;
          font-variant-numeric: tabular-nums;
          font-size: 14px;
          color: #FFB3B3;
          min-width: 44px;
          text-align: right;
        }
        button {
          border: 1px solid #FF4757;
          background: transparent;
          color: #FF4757;
          font: inherit;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          flex: none;
        }
        button:hover { background: #FF4757; color: white; }
      `;
      doc.head.appendChild(style);

      doc.body.innerHTML = `
        <span class="dot"></span>
        <span class="label">录制中</span>
        <span class="time" id="t">00:00</span>
        <button id="stopBtn" title="停止录制">停止</button>
      `;
      pipTimeEl = doc.getElementById('t');
      doc.getElementById('stopBtn').addEventListener('click', () => {
        if (typeof onStop === 'function') onStop();
      });

      win.addEventListener('pagehide', () => {
        if (stopped) return;
        pipWindow = null;
        pipTimeEl = null;
      });

      pipWindow = win;
    } catch (err) {
      console.warn('[rec-indicator] Document PiP 不可用，仅靠标题/favicon 提示。', err);
    }
  }

  openPip();

  function tick(elapsedMs) {
    if (stopped) return;
    const t = fmt(elapsedMs);
    document.title = `● 录制中 ${t} — ${ORIGINAL_TITLE}`;
    if (pipTimeEl) pipTimeEl.textContent = t;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    document.title = ORIGINAL_TITLE;
    if (FAVICON_LINK) FAVICON_LINK.href = ORIGINAL_FAVICON;
    if (pipWindow) {
      try { pipWindow.close(); } catch {}
      pipWindow = null;
      pipTimeEl = null;
    }
  }

  return { tick, stop };
}
