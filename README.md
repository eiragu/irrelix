# 画布 luping

> 给中国内容创作者的**自由画幅录屏工具**。录一次屏 → 画布里自由编辑 → 按不同平台画幅一键导出多版本。

- GitHub slug：`luping`（"录屏"拼音）
- 产品名：**画布**
- 定位：Loom / OBS / 剪映 / Opus Clip 的平替，但**只做"录屏 + 轻量自由画布"闭环**
- 特点：**纯前端零服务费**，视频从不上传，你的原始录制永远只在你自己电脑上

---

## 快速体验（本地跑）

```bash
pnpm install
pnpm dev
# 浏览器打开 http://localhost:5173
```

首次打开会要摄像头权限。建议用 Chrome 或 Edge。

## 功能清单

### 录制
- 屏幕 + 摄像头 **双轨分离录制**（两路独立 MediaRecorder），原始素材保留在 IndexedDB
- 录完保留原始文件，不做任何有损操作
- 本地存储配额实时可见

### 画布编辑
- 画布尺寸：**4 个常用画幅**（横 16:9 / 竖 9:16 / 竖 3:4 / 竖 4:5）
- **懒人模式**：切画布尺寸自动应用推荐布局
- **8 个快速布局**：全屏 / 上屏下人 / 下屏上人 / 左屏右人 / 右屏左人 / 画中画居中 / 仅屏幕 / 仅摄像头
- **图层自由调整**：拖拽 + 8 控制点缩放 + Shift 等比
- **摄像头样式**：圆形 / 正方形 / 圆角矩形 + 镜像 + 边框 + 透明度
- **画面裁切**（pan/zoom）：在摄像头外框内部平移缩放视频内容，可把脸放到中心、避开背景杂物（v1.0 下 AI 抠图的替代方案）
- **底部时间轴**：刻度 / 双轨色块 / 红色播放头 + 拖动 scrub / 空格播放 / 方向键微调
- **片段修剪**：两端黄色手柄拖动裁掉开头废话和结尾收尾，被裁区半透明遮罩
- **偏好记忆**：画布尺寸 / 底色 / 默认布局自动记到 localStorage，下次打开自动复用

### 导出
- **WebCodecs 硬件加速**：H.264 + AAC → mp4，10 秒视频约 5-7 秒出结果（**2x 加速**）
- **MediaRecorder 兜底**：浏览器不支持 WebCodecs 时自动退到 webm 实时录制
- **失败自动回落**：WebCodecs 运行中出错，自动切 MediaRecorder 重试，用户无感
- `showSaveFilePicker` 保存，不支持降级 `<a download>`

## 技术栈

- **前端**：Vite 5 + 原生 ES Module，无框架
- **采集**：`getDisplayMedia` + `getUserMedia` + `MediaRecorder`（VP9+Opus）
- **存储**：IndexedDB（两路原始视频 blob 独立存）
- **合成**：Canvas 2D（`drawImage` + clip + transform，`object-fit: cover`）
- **编码**：
  - 主路径：`VideoEncoder` + `AudioEncoder`（WebCodecs 硬件加速）
  - 兜底：`canvas.captureStream()` + `MediaRecorder`
- **封装**：`mp4-muxer`（JS 库，0 编码开销）
- **部署**：Vercel（`vercel.json` 配 COOP/COEP 头启用 SharedArrayBuffer）

## 部署到 Vercel

本项目已在 `vercel.json` 里配好 COOP/COEP 头（WebCodecs 多线程 / SharedArrayBuffer 必需）。

```bash
# 方式 A: Vercel CLI
npx vercel           # 第一次会交互式登录 + 初始化
npx vercel --prod    # 正式部署

# 方式 B: GitHub 集成
# 推 luping 仓库到 GitHub 后, 在 vercel.com 导入仓库, 全程自动。
```

**注意**：不能用 GitHub Pages —— 它不支持自定义 header，`SharedArrayBuffer` 跑不起来。

## 目录结构

```
src/
  capture/recorder.js          双轨录制 + mimeType 探测
  storage/db.js                IndexedDB sessions CRUD
  editor/
    editor.js                  画布、图层、播放
    panel.js                   右侧三 Tab 属性面板
    layouts.js                 8 个快速布局预设
    timeline.js                底部时间轴 + 修剪
    prefs.js                   localStorage 偏好
  export/
    exporter.js                路由 + 能力检测 + 自动回落
    canvas-renderer.js         渲染一帧(B 和 C 共享)
    webcodecs-pipeline.js      H.264 + AAC → mp4
    recorder-pipeline.js       canvas.captureStream → webm
    export-ui.js               导出对话框
  ui/
    style.css, editor.css, toast.js
  main.js                      入口
public/                        静态资源
docs/技术可行性报告.md
```

## 核心设计原则

1. **画布是自由创作空间，不是模板选择器** —— 预设是起点不是终点
2. **双轨分离录制** —— 原始素材保留，编辑时才合成
3. **v1.0 明确不做**：AI 抠图、人脸跟随、批量导出、自动字幕、云存储、团队协作
4. **零服务成本** —— 所有合成和编码发生在浏览器，你不为视频转码付任何 API 费

## 进度

- [x] 第一步 · 技术可行性确认
- [x] 第二步 · 骨架 + 最小录屏链路 （tag `v2-step-2`）
- [x] 第三步 · 双轨录制 + IndexedDB （tag `v2-step-3`）
- [x] 第四步 · 画布编辑器（4a 骨架 / 4b 属性面板 / 4c 快速布局 / 4d 时间轴 + 修剪）（tag `v2-step-4`）
- [x] 第五步 · 导出视频（canvas + WebCodecs / MediaRecorder）（tag `v2-step-5`）
- [x] 第六步 6a · 体验打磨（自动回落 / 偏好记忆 / toast / 预热）
- [ ] 第六步 6b · 部署上线 + 跨浏览器测试 ← **当前**

## 已知限制

- 仅桌面 Chrome / Edge 体验最佳
- Safari 部分降级（无 WebCodecs 走 MediaRecorder 输出 webm）
- Firefox 不支持 `showSaveFilePicker` 降级用浏览器下载栏
- 录制时长建议 ≤ 15 分钟（浏览器内存）

## License

MIT
