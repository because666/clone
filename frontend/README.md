# 城市低空物流网络 - 前端 (Frontend)

本项目是基于 React + TypeScript + Vite 构建的 3D 可视化 WebGIS 应用。主要利用 `Deck.gl` 和 `MapLibre GL JS` 进行大规模无人机轨迹、城市 3D 建筑及能效热力图的高性能渲染。

## 核心组件解析与关系

由于项目初期在单个 `MapContainer.tsx` 中积累了大量逻辑，目前已经过重构与拆分。以下是当前核心代码库中各个模块的职责与关系说明：

### 1. 主容器 (`src/components/MapContainer.tsx`)
**职责**：地图底板与生命周期核心调度者。
- 初始化 `MapLibre` 作为底图底板。
- 初始化 `DeckGL` 作为 3D 渲染画布。
- 负责挂载各个分离出去的 UI 组件（`DashboardOverlay`、`PlaybackControls` 等），并通过 Props 传递共享状态（如 `isPlaying`, `selectedFlight` 等）。
- **注意**：它不再处理具体的数据获取或详细的动画逻辑，而是依靠自定义 Hooks。

### 2. 核心 Hooks (`src/hooks/`)
为了分离逻辑与 UI，我们将重度业务抽象为了两个大 Hook：
- **`useCityData.ts`**
  - **职责**：城市级别数据的网络请求、状态管理及缓存（`buildings`, `poiDemand`, `poiSensitive`, `trajectories`, `energyData`）。
  - **特性**：它暴露了 `loadCityData` 钩子，可在城市之间无缝切换并带有内存缓存，防止重复发请求。
- **`useUAVAnimation.ts`**
  - **职责**：动画播放引擎。驱动底层无人机的物理飞行逻辑，接管 `requestAnimationFrame`。
  - **特性**：暴露出 `isPlaying`、`animationSpeed` 等供控制面板调用的状态控制方法，并在每次 Tick 时更新底层 DeckGL 的时间戳或直接操控 DOM（提升渲染效率）。

### 3. 工具与常量 (`src/utils/` & `src/constants/` & `src/types/`)
- **`constants/map.ts`**：存放如城市坐标字典、初始视角控制常量、POI 类别颜色/名称映射 (`DEMAND_TYPE_MAP`) 等静态配置。
- **`types/map.ts`**：存储 TypeScript 核心数据类型（如 `UAVPath` 规范、`CityData` 模型格式）。
- **`utils/animation.ts`**：
  - `<核心逻辑>`：**`updateActiveUAVsBuffer`** 函数。非常重要的高性能算法，负责把成千上万条轨迹根据时间进行**降维窗口截取**，计算出当前活动无人机的即时位置、姿态角度及拖尾。同时维护全局缓冲池 `uavModelBuffer` 从而避免频繁 GC。
  - 时间格式化等纯函数工具。

### 4. 拆分出的纯 UI 组件 (`src/components/`)
这些面板原先耦合在 MapContainer 中，现已独立，大幅增加了代码可读性：
- **`DashboardOverlay.tsx`**
  - 主要用于显示全局态势：左下角的“活跃无人机/负载率”统计，右上角的“天气/环境”，右下角的“安全事件日志”。
- **`PlaybackControls.tsx`**
  - 屏幕底部的总控台，包含了播放/暂停按钮、动画倍速选择、城市一键切换下拉框以及全局的进度条显示。
- **`HoverTooltip.tsx`**
  - 纯函数式渲染组件，根据鼠标在地图上的 Pick 事件，在鼠标当前 x/y 坐标渲染出含名称、图标类型的黑色半透明提示框。
- **`FlightDetailPanel.tsx`**
  - 在用户点击某一架具体无人机后，从左侧弹出的高精雷达面板。内部解析该架飞机的实时载重、能效耗散（Battery 流失）信息。

### 5. 主入口 (`src/App.tsx`)
- 负责挂载 `MapContainer`，以及需要在 Map 之上的那些不需要随地图缩放平移移动的绝对定位覆盖层（如 `DashboardOverlay`，因之前解耦，它已被提到了 `App.tsx` 级别保证它位于最顶层且可全局控制隐藏/展示）。

---

## 开发与运行指南

### 环境要求
- Node.js (建议 18.x+)
- npm 或 yarn

### 启动命令
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 编译打包构建
npm run build
```

### 数据说明
运行此前端需要保证本机的 `/public/data/` 目录中已放置了最新的且经过 Python 脚本 `trajectory_lab` 生成的标准化 `geojson` 和 `json` 文件，否则可能抛出抓取失败的错误并在屏幕中央一直转圈。
