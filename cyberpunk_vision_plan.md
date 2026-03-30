# 赛博朋克扫描模式 (Cyberpunk Vision Mode) 架构及落地方案

通过 Deck.gl 强大的图层定制能力与 MapGL CSS 滤镜机制，打造类似《赛博朋克2077》中的“黑客视觉器（Scanner）”高亮效果，不仅给评委极大的视觉冲击力（WOW 效应），而且完美契合了"多视图数据下钻"的业务属性。

## 目标效果
新增一个全局状态 `visionMode`，取值为 `'default' | 'uav' | 'building' | 'nofly'`。

---

### 1. UI 层融合设计 (Merged Native UI)

抛弃了原本突兀的悬浮紫色 Dock 栏设计，转而将多视图切换功能**深度集成到原有的底部播放控制台 (`PlaybackControls.tsx`)** 中，实现了统一的 Slate-700 沉浸式暗黑风格：

- 🌐 **默认视图**: 正常日光模式
- ✈️ **航班追踪 (UAV)**: 强关注无人机全网阵列
- 🏢 **基础基建 (Building)**: 城市建筑群透视
- 🛑 **禁航隔离 (NoFly)**: 凸显敏感保护区
- **自适应布局**: 在受限高度和小屏幕设备下保持完美的 Flex 紧凑栅格（防折行）。

#### [MODIFY] `frontend/src/components/MapContainer.tsx`
- 新增 `const [visionMode, setVisionMode] = useState<'default'|'uav'|'building'|'nofly'>('default')` 状态。
- **劫持基础地图滤镜**：根据 `visionMode !== 'default'` 状态向 `MapGL` 组件强制注入 CSS 滤镜 (`brightness-50 contrast-125 saturate-50 sepia-[.3] hue-rotate-180`)，营造极暗的对比度赛博朋克底层环境。

---

### 2. 渲染核心设计 & 硬件加速黑科技 (`useMapLayers.ts`)

为了确保千架规模并发下的极速 60FPS，采用了全 GPU 级别的硬件重绘和骗色机制：

- **航班模式 (`uav`) & 无人机全景高亮**：
  - 【黑科技】**伪造选色缓冲区 (`instancePickingColors`)**：注入 `FAKE_PICKING_COLORS` 强制将所有无人机的内置对象 ID 改写为 `0`，并开启 `highlightedObjectIndex: 0`。骗过了 Deck.gl 底层的 `DECKGL_FILTER_COLOR` 鼠标高亮模块，使得暗色 glTF 实体模型**全量瞬间泛起闪电黄的混合高光**。
  - **动态 X-Ray 透视底盘**：叠加具有 `depthTest: false` 和 Additive 混合属性的 `uav-halo-glow-layer` (18px)，画龙点睛地补充赛博能量感。
  - `activeTailLayer` 和新增的 `uavFullTrajectoryLayer` 强制切入纯金警戒色。

- **基建模式 (`building`) & 禁飞区模式 (`nofly`)**：
  - 建筑体设置青色半透描边，营造数字线框沙盒感。
  - 敏感区柱体保持 `400` 米赤红警告高程。

- **全局丝滑过渡动画 (`transitions`)**：
  - 利用 Deck.gl 官方的 `transitions: { getFillColor: 600, getRadius: 600 }` 属性，实现模式切换时不仅不死板跳变，反而具有长达 0.6 秒的色彩扩散与形体升降的史诗级过场动效。

---

### 3. 落地与验证记录 (Completed)
- [x] 跨端（响应式缩放）测试底部控制栏完美容纳多视图按钮，无任何重叠或溢出。
- [x] 采用 `instancePickingColors` 欺骗底层的选色缓冲区机制成功，无人机实体实现底层 Shader 混合渲染极速暴击发光。
- [x] 在 `useMapLayers.ts` 中针对内置图层注入 `transitions` 属性，多重无缝 60FPS 动画切换调校完美。
- [x] 配置恰到好处的发光光晕，修正尺寸为半径 18 与 5，杜绝喧宾夺主。
