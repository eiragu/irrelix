# 录一下 (irrelix)

> **打开网页就能用的免费录屏工具** —— 屏幕 + 摄像头人像同框，所见即所得，纯前端零上传。
> 一个 HTML 文件就是完整产品：无需安装、无需注册、无后端、不收集任何数据。

**🌐 在线使用：[irrelix.com](https://irrelix.com)**

*English TL;DR: **irrelix** is a free, single-file, browser-based screen recorder for creators — screen + webcam overlay composited in real time (WYSIWYG), beauty filters, green screen, teleprompter, multiple aspect ratios (16:9 / 9:16 / 1:1 …), exports mp4/webm. 100% client-side: no install, no signup, no backend, nothing ever uploaded. The entire product is one self-contained HTML file ([`screencap/index.html`](screencap/index.html)). License: PolyForm Noncommercial — free for personal use, commercial use requires permission.*

---

## ✨ 特性

- **🖥️ 屏幕 + 📷 人像同框录制** —— 摄像头头像实时叠在画面上，录制时看到什么，成片就是什么（所见即所得，不需要后期）
- **🎨 摄像头美颜** —— 自然 / 美白 / 精修三档，另有**绿幕**抠像、镜像翻转、圆形/方形头像、铺满模式
- **📐 多画幅** —— 16:9 / 9:16 / 3:4 / 4:5 / 1:1 / 21:9，横竖屏一次选好，适配抖音、视频号、B站、YouTube
- **📃 内置提词器** —— 半透明悬浮提词，字号可调，录口播不用背稿（提词器不会被录进视频）
- **⏯️ 暂停 / 继续 / 重录** —— 录错了随时重来
- **📦 导出 mp4**（浏览器支持时，否则 webm），录完直接下载
- **🔒 隐私即架构** —— 纯前端实现，**没有服务器、没有上传、没有账号、没有统计**。你的屏幕画面和摄像头数据从头到尾只在你自己的浏览器里
- **📄 单文件分发** —— 整个产品就是一个 HTML 文件，页面里还有「下载 index.html」按钮：把它下载到本地双击打开，断网也能用

## 🚀 快速开始

**方式一（推荐）**：打开 [irrelix.com](https://irrelix.com) → 选画幅 → 授权屏幕和摄像头 → 开始录制。

**方式二（本地离线用）**：下载本仓库的 [`screencap/index.html`](screencap/index.html)，用 Chrome / Edge 直接打开即可。无需任何依赖。

> 浏览器要求：Chrome / Edge 等 Chromium 内核浏览器（需要 `getDisplayMedia` 屏幕捕获 API）。

## 🛠️ 技术要点（给开发者）

对想做类似工具、或想拆模块复用的开发者，这个单文件里有几块值得参考：

| 模块 | 实现思路 |
|---|---|
| 屏幕+人像实时合成 | `getDisplayMedia`（屏幕）+ `getUserMedia`（摄像头）两路流 → Canvas 逐帧合成 → `captureStream` 出录制流，所见即所得 |
| 录制与导出 | `MediaRecorder`，优先探测 `video/mp4` mimeType，不支持则回退 webm |
| 摄像头美颜 | Canvas 滤镜链（亮度/对比度/饱和度/磨皮），无 AI 模型、无 GPU 依赖，任何机器都跑得动 |
| 绿幕抠像 | 逐像素色键（chroma key），纯 Canvas 实现 |
| 提词器 | DOM 悬浮层，不进合成 Canvas，所以不会被录进视频 |
| 单文件形态 | HTML + CSS + JS 全部内联，零构建、零依赖、零部署，发一个文件就是发一个版本 |

## 📁 仓库结构

```
screencap/index.html   ← 主产品：单文件录屏工具（irrelix.com 线上运行的就是这份）
src/                   ← 旧版「录一下」（Vite + 双轨录制 + 画布编辑器），已归档不再维护
docs/README-vue-legacy.md  ← 旧版的说明文档
```

> 旧版走的是「录完再进画布编辑」路线，含 WebCodecs 导出 mp4、Document PiP 录制指示器等实现，对开发者仍有参考价值，见 [docs/README-vue-legacy.md](docs/README-vue-legacy.md)。

## ⚖️ License

**PolyForm Noncommercial 1.0.0**（源码公开，非商业许可）：

- ✅ **个人使用、学习、研究、修改、非商业分发** —— 免费，随便用
- ❌ **商业用途**（售卖、集成进商业产品、商用部署等）—— 需要单独授权，请通过 issue 联系

> **补充授权（Additional Grant）**：使用本工具（包括 [irrelix.com](https://irrelix.com) 在线版和下载到本地的单文件版）**录制和制作视频内容**，无论该内容本身是否用于商业目的（如自媒体变现、课程、带货视频等），均视为允许的使用，无需额外授权。本协议限制的是对**代码本身**的商业性使用（售卖代码、集成进商业产品、商用部署衍生服务等）。

代码完全公开可审计 —— 这也是我们对「零上传、不收集数据」承诺的最有力证明。

---

*录一下 (irrelix) · 给创作者的免费录屏工具 · [irrelix.com](https://irrelix.com)*
