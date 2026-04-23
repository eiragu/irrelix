# 画布 luping

> GitHub 仓库 slug:`luping`(录屏拼音)。产品对外名称仍是"画布"。

给中国内容创作者的自由画幅录屏工具。录一次,自由编辑,多画幅导出。

## 当前版本

**v2-step-2**:最小录屏链路(选屏幕 → 录 10 秒 → 保存 webm)

## 技术栈

- Vite 5 + 纯前端(无后端)
- MediaRecorder API / getDisplayMedia / getUserMedia
- ffmpeg.wasm(第五步加入)
- IndexedDB(第三步加入)
- 部署:Vercel(配 COOP/COEP 头以启用 SharedArrayBuffer)

## 开发

```bash
pnpm install
pnpm dev
# 浏览器打开 http://localhost:5173
```

## 目录结构

```
src/
  capture/    录制模块(屏幕 + 摄像头 + 麦克风)
  storage/    IndexedDB 封装
  editor/     画布编辑器(第四步加入)
  export/     ffmpeg.wasm 导出(第五步加入)
  ui/         界面组件
public/       静态资源
docs/         项目文档
```

## 文档

- [技术可行性报告](docs/技术可行性报告.md)

## 进度

- [x] 第一步 · 技术可行性确认
- [x] 第二步 · 骨架 + 最小录屏链路
- [ ] 第三步 · 双轨录制(屏幕 + 摄像头)
- [ ] 第四步 · 画布编辑器 UI
- [ ] 第五步 · ffmpeg.wasm 导出管线
- [ ] 第六步 · 体验打磨 + 跨浏览器兼容
