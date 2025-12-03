# ComfyUI AE Animation

单节点版 AE 风格时间轴：前景/背景图层管理、关键帧动画、Mask/路径/抠图、预览与导出，UI 内即可调分辨率/FPS/总帧数。

## 更新日志

### Vue 完全重构（最新）
- ✅ **前端架构重构**：使用 Vue 3 Composition API 完全重写前端界面
- ✅ **UI/UX 优化**：全新的现代化界面设计，提升用户体验和交互流畅度
- ✅ **组件化开发**：采用组件化架构，提高代码可维护性和可扩展性
- ✅ **性能优化**：优化渲染性能，提升交互响应速度
- ✅ **代码结构**：重构代码结构，提高开发效率和代码质量

## 快速开始
1) **重启 ComfyUI** 后，右上角的 **AE Timeline** 按钮自动创建并选中 `AE Animation` 节点并打开 UI；或在节点面板直接添加该节点再点按钮打开。
2) 顶部 **W/H/FPS/Frames** 直接调项目尺寸/帧率/总帧数；保存按钮会写回节点 widgets，保持数据互通。
3) **+FG / +BG** 通过文件选择器添加本地图片；也可在节点输入端接入图像（自动列入图层）。
4) 画布可缩放（右上 Zoom 滑块）、Fit/Fill/Stretch 可切换，竖屏分辨率可用缩放避免裁切。
5) 时间轴：添加/删除/清空关键帧，播放/暂停（空格快捷键），Up/Down 调整图层顺序。
6) 工具：Mask、路径动画、AI Extract（背景抠出前景，自动生成新前景图层）。
7) 输出：节点直接输出图像序列和遮罩序列（不再输出字符串动画）。

## 节点说明（AE Animation）
- **输入 widgets**（可在 UI 顶部调节，同步回节点）：`width` `height` `fps` `total_frames`。  
- **隐藏但保留**：`mask_expansion` `mask_feather` `layers_keyframes` `start_frame` `end_frame`（UI 仍用）  
- **输出**：`frames`（IMAGE）、`mask_frames`（MASK）。

## 常用操作
- **保存/加载**：UI 顶部 Save/Load 工程文件（JSON）；保存会写回节点 widgets（动画、项目参数）。
- **空格播放/暂停**：防止误触 Save（已拦截）。
- **图层顺序**：时间轴左侧 Clear All 旁的 Up/Down 按钮。
- **遮罩/路径/抠图**：在左侧工具区启用并调节；Extract 需先有背景层。

## 已知特性
- 自动创建节点：从右上角按钮打开时，如无 AE Animation 会自动创建并选中。
- 画布缩放：Zoom 25%~200%，配合 Fit/Fill/Stretch 处理竖屏画面。

## 开发/构建
前端位于 `frontend/`，构建产物输出到 `js/vue-dist/`：
```bash
cd frontend
npm install
npm run build
```
静态目录 `WEB_DIRECTORY=./js`，前端脚本/样式通过 `/extensions/ComfyUI-AE-Animation/vue-dist/...` 提供。

---
享受动效创作！
