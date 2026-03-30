# 赛博朋克扫描模式 (Cyberpunk Vision Mode) 实施计划

通过 Deck.gl 强大的图层定制能力与 MapGL CSS 滤镜机制，打造类似赛博朋克2077中的“黑客视觉器（Scanner）”高亮效果，不仅能给评委极大的视觉冲击力（WOW 效应），并且完美契合了"多视图数据下钻"的业务属性。

## 目标效果
新增一个全局状态 `visionMode`，取值为 `'default' | 'uav' | 'building' | 'nofly'`。

---

### 1. UI 层设计

#### [NEW] `frontend/src/components/VisionModeDock.tsx`
- 在屏幕正下方建立一个类似 MacOS Dock 但具备赛博朋克风格的毛玻璃导航栏。
- 包含四个按钮图标：
  - 🌐 **默认视图**: 正常日光模式
  - ✈️ **航班追踪 (UAV)**: 强关注无人机全网阵列
  - 🏢 **基础基建 (Building)**: 城市建筑群透视
  - 🛑 **禁航隔离 (NoFly)**: 凸显敏感保护区
- 按钮选中时自带向外溢出的光晕动效。

#### [MODIFY] `frontend/src/components/DashboardOverlay.tsx`
- 挂载 `VisionModeDock` 到底部中央 `-translate-x-1/2` 位置。
- 接收 `visionMode` 和 `setVisionMode` 并传递给 Dock。

#### [MODIFY] `frontend/src/components/MapContainer.tsx`
- 新增 `const [visionMode, setVisionMode] = useState<'default'|'uav'|'building'|'nofly'>('default')` 状态。
- **劫持基础地图滤镜**：根据 `visionMode !== 'default'` 状态向 `MapGL` 组件强制注入 CSS（如 `brightness-50 contrast-125 saturate-50 sepia-[.3] hue-rotate-180`），营造极暗的对比度背景主题层。

---

### 2. 渲染核心设计 (`useMapLayers.ts`)
重定义大屏核心图层渲染器（Color/Opacity Accessors），实现硬件加速着色（零性能开销）：

- **航班模式 (`uav`) & 轨迹（Trails）**：
  - `activeTailLayer` 强制涂成 **黄电驭金 (`[255, 215, 0]`)**，亮度压抑其它层（建筑降至暗灰、透明度 0.1）。
- **基建模式 (`building`)**：
  - 建筑体 `buildingsLayer` 的 `getFillColor` 设置为 **半透青色 (`[0, 255, 255, 60]`)**，`getLineColor` 置为 **高亮青色界线 (`[0, 255, 255, 255]`)**，营造数字线框沙盒感。
- **禁飞区模式 (`nofly`)**：
  - 所有的医疗/学校等禁忌点区域 (`poiSensitiveLayer`) 修改散点高程颜色为 **血红色透明填充 (`[255, 0, 0, 150]`)** 与界线，其它不相干点阵（需求点）完全透明隐藏。

---

### 3. 落地与验证记录 (Completed)
- [x] 跨端（响应式缩放）测试底部 Dock 栏不遮挡侧边面板，抛弃纯紫选色，合并入原有控制台。
- [x] 采用 `instancePickingColors` 欺骗底层的选色缓冲区机制，配合着色器的原生高亮进行硬件级混合，实现千架 3D 无人机全量发光。
- [x] 在 `useMapLayers.ts` 中针对内置图层注入 `transitions` 属性，完成静态建筑群、禁飞区高程与颜色以及 UAV 光圈的多重无缝 60FPS 动画切换过渡。
- [x] 配置恰到好处的 X-Ray 透视发光底盘图层（glow-layer / core-layer），极致贴合 Cyberpunk 视觉气氛。
