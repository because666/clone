# TODO

> 本文档用于团队协作，记录各个模块的开发进度和认领人
> 格式：`[认领人] 任务描述`

## Backlog
后端：引入 PostgreSQL + PostGIS 空间数据库，实现航线任务 CRUD 持久化
后端：航线任务管理工作流（创建 → 审批 → 执行 → 完成 状态机）
前端：航线任务管理列表页（搜索、筛选、排序、状态流转）
算法/AI：训练航线能耗预测模型（线性回归/随机森林），提供 AI 预审功能
前端：独立 `/analytics` 数据分析页（起降点热力图、告警统计趋势、跨城市对比）
算法：多无人机 4D 航路冲突检测与可视化（时间+空间碰撞预判）
后端：无人机档案注册管理接口 + 前端管理界面
测试：pytest 覆盖后端核心算法 + 前端关键 Hook 单元测试

## In Progress


##  Done
[应飞扬] 前端：基于 React + Vite + Deck.gl 搭建 3D WebGIS 渲染底座
[应飞扬] 前端：基于 MapLibre GL JS 集成本地瓦片与动态样式控制
[应飞扬] 前端：实现带有玻璃拟态的 UI 组件库
[应飞扬] 前端： Dashboard 全局状态概览面板（空域负载、累计航班统计）
[应飞扬] 前端：实现飞行器个体点选事件，侧边栏弹出 FlightDetailPanel 高精雷达页面
[应飞扬] 前端：打通前端时间轴插值计算引擎 (useUAVAnimation)，独立托管渲染帧调度
[应飞扬] 前端：重构拆解臃肿的 MapContainer，抽出 useCityData 状态管理机制
[应飞扬] 后端：抛弃旧版直线虚假轨迹，单独开辟 trajectory_lab 实验室环境
[应飞扬] 后端：通过 Python FastAPI 框架建立高并发与高性能的数据投递接口
[应飞扬] 后端：基于地理数学类库 Shapely 编写 POI 洗白过滤和建筑多边形交并计算逻辑
[应飞扬] 算法：设计基于 A* 的三维立体错落避障寻路生成机制
[应飞扬] 算法：编写基于真实城市 OSM 建筑数据与高德 POI 数据的 3D 禁飞区围栏规避
[应飞扬] 算法/模型：实现无人机物理能耗评估体系，包括瞬时功率、由于天气和载重导致的综合电池消耗模型
[应飞扬] 数据：清洗大量开源环境下的飞行轨迹日志，提纯出具备机器学习的能耗数据(`airlab_energy`)
[应飞扬] 前端：修复无人机预计降落电量由于数据占位导致显示为0的Bug
[邓博]   前端：接入实时天气的可视化效果 (含雨、雪、厚积云粒子特效系统)
[邓博]   前端：抛弃原占位界面布局，设计为右侧集成控制面板 (环境控制、气温调节、算法调试入口)
[邓博]   前端：实现侧边栏收纳隐藏机制 (靛蓝色视觉拉手交互)
[邓博]   前端：预警面板深度优化 (UI 占比调整、全量预警内容中文化)
[邓博]   算法：增加天气风速对电池消耗的影响因子
[应飞扬] 数据：批处理全量生成六大城市无人机 500 条轨迹数据，并重新对齐修复能耗 JSON 映射。
[应飞扬] 前端：清理 `public/data/` 目录大量冗余散装数据及 raw 原文件，大幅缩减前端静默体积。
[应飞扬] 前端：深度修复 `MapContainer`-`DeckGL` 动画渲染引擎中因 `activeUAVs` 旧闭包引发的"暂停无人机即消失" Bug
[应飞扬] 前端：大幅切除 `utils/animation.ts` 每一帧的数组裁切拼凑，改原生 `TripsLayer` 硬件着色处理尾迹，彻底杜绝 GC 卡顿。
[应飞扬] 前端：将低电量、禁飞区碰撞检测中的哈弗辛三角公式及全量循环，替换为 O(logN) 二分与等距映射伪欧式无根号算法。
[应飞扬] 前端：解锁 `useCityData` 钩子请求流通道上限，释放 HTTP/2 多路复用并行下载性能，优化首屏黑屏时间。
[应飞扬] 前端：基于 ECharts 实现全新的全局运行统计分析面板，优化全局 UI 排版与抽屉折叠交互。
[应飞扬] 前端：`getActiveUAVs()` 零分配优化，消除每帧 `.slice()` 的 GC 压力，仅在活跃数量变化时重新切片。
[应飞扬] 前端：`animate` 回调稳定化重构——将 `isPlaying`/`animationSpeed` 依赖改为 ref 读取，RAF 循环不再因播放切换中断重注册，消除帧丢失闪烁。
[应飞扬] 前端：ECharts 延迟加载——AnalyticsPanel 改为 `React.lazy()` + `Suspense`，~800KB 包体不再阻塞首屏渲染。
[应飞扬] 前端：`FlightDetailPanel` 中遗留的 `findIndex` O(N) 线性扫描替换为公共 `binarySearchTimestamp` O(logN) 二分搜索。
[应飞扬] 前端：`hoverInfo` 减频优化——仅在 hover 目标对象变化时触发 MapContainer re-render，鼠标同对象移动不再全量重渲染。
[应飞扬] 前端：巨型 JSON 异步解析——新增 Web Worker (`jsonWorker.ts`) + 封装 `fetchJsonWithWorker`，5.6MB GeoJSON 的 JSON.parse 移至后台线程。
[应飞扬] 前端：修复 DashboardOverlay 硬编码"深圳南山"问题，切换城市后标题动态跟随更新。
[应飞扬] 前端：恢复 PlaybackControls 中被 `hidden` 隐藏的时间轴进度条（调试遗留 Bug）。
[应飞扬] 前端：提取 `calcWindFactor` + `binarySearchTimestamp` 到公共 `utils/physics.ts`，消除 FlightDetailPanel 与 useUAVAnimation 的重复定义。
[应飞扬] 前端：修复 WeatherOverlay 的 `animationFrameId` 闭包泄漏——改用 `useRef` 存储，清理函数始终取消最新动画帧。
[应飞扬] 前端：`deepClone` 手写递归替换为浏览器原生 `structuredClone`，正确处理 Date/Map/Set/循环引用。
[应飞扬] 前端：修复 `PersistentLRUCache` 中 `(this as any).cache` 类型穿透——改为 `protected` 修饰符合法访问。
[应飞扬] 工程：修复 `requirements.txt` UTF-16 编码损坏（空字节导致 flask-sqlalchemy/pyjwt 安装失败的根因）。
[应飞扬] 工程：重写 `start-dev.ps1` 一键启动脚本——自动检测 Python/Node 环境、逐个验证关键依赖、缺失时自动安装、启动后输出账号信息。
[应飞扬] 前端：登录页重新设计——左侧大屏截图毛玻璃背景 + 项目亮点数据，右侧干净白底登录表单。
[应飞扬] 后端：实现 JWT Token 认证登录 + 管理员/调度员/查看者角色分级 + 操作审计日志。
[应飞扬] 前端：React Router 多页面路由架构（`/login` → `/dashboard`）+ ProtectedRoute 鉴权守卫。