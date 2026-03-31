# TODO

> 本文档用于团队协作，记录各个模块的开发进度和认领人
> 格式：`[认领人] 任务描述`

## Backlog
后端：引入 PostgreSQL + PostGIS 空间数据库，实现航线任务 CRUD 持久化
算法/AI：训练航线能耗预测模型（线性回归/随机森林），提供 AI 预审功能
后端：无人机档案注册管理接口 + 前端管理界面
[应飞扬] 测试：pytest 覆盖后端 API + 前端 useSandbox/useFlightPicking Hook 测试

## In Progress

##  Done
[应飞扬] 全栈：落地独立全屏数据分析页 `/analytics`（6 大可视化模块 + 后端聚合统计 API + 跨城市雷达对比 + 告警饼图 + 算法性能面板），实现 Dashboard ↔ Analytics 双页导航体系
[应飞扬] 算法/前端：实现 4D 时空冲突检测引擎——基于空间哈希 O(N) 邻域碰撞检测 + 时间切片分帧均摊 + ArcLayer 实时冲突弧线渲染 + 三级告警（conflict/danger-zone/low-battery）统一推送
[应飞扬] 算法/工程：上线 Qwen 大模型 AI 航线安全预审中枢（基于 Shapely 实现 3D 禁飞区雷达穿透拦截），并封装桌面级 Qwen 悬浮晶核拟态交互组件
[应飞扬] 前端：研发并落地 Cyberpunk Vision Mode 多视图视觉系统，实现无人机 3D 模型深度着色器混叠高亮与无缝丝滑 GPU 过渡动画
[应飞扬] 工程：深度性能优化 12 项（Context 稳定化、粒子系统 ref 驱动、layers memo、SSE 轨迹预编译、组件 memo 化、内存泄漏修复、雷达动画优化、cloneLayers 哈希查找、Vite 构建优化）+ 工程化改进 7 项（统一 API Service 层、TypeScript 类型安全、后端响应格式统一、脚本文档、.env.example、Dockerfile 修复、/api/health 端点）
[应飞扬] 工程：全栈架构重构——后端 Blueprint 模块化拆分（server.py 770→110行）、统一 API 响应格式 {code,data,message}、前端 Hook 提取（useSandbox/useFlightPicking）、Context 合并、死代码清理（~420行）
[应飞扬] 全栈：研发基于空间计算的"基建 ROI 沙盘 DSS 辅助决策引擎"（含 A/B 方案博弈、投资财务闭环与 3D 雷达激波渲染）
[应飞扬] 前端：深度重构动画底层管线实现极度渲染降耗（引入 SoA 连续内存、O(1) 空间哈希剪裁、DOM 降频与无锁状态机）
[应飞扬] 前端：全面模块化解耦 MapContainer 巨型组件，基于发布订阅模式接入 SSE 事件流重构实时通信架构
[应飞扬] 前/后端：完成双轨制的航线审批及任务调度流（集成防抖检索引擎）
[应飞扬] 前端：实现 60FPS 电影级全视野硬锁机跟拍引擎（动态接管地图 ViewState）
[应飞扬] 后端：升级 0 延迟实时管线，基于 Server-Sent Events (SSE) 替换传统轮询
[应飞扬] 工程：重构全站前端打包工程化，落地按需路由懒加载与静默预拉取，突破 WebGL 体积瓶颈实现百 KB 首屏秒开

(近期压缩归档/重构类)
[应飞扬] 前端：深度重构大运力动画数据流（剥离 O(N) 切片 GC 压力、原生 TripsLayer 着色、Web Worker 解码巨型 GeoJSON）
[应飞扬] 前端：前端算力与渲染降频优化（O(logN) 二分搜索替换所有线性查找、hoverInfo 减频防闪、ECharts 懒加载抽屉包裹）
[应飞扬] 前端：修复多处内存隔离泄漏（deepClone 提纯兼容、LRU 封装解耦、WeatherOverlay 时钟销毁闭包拦截）
[应飞扬] 全栈：建立 React Router 多级鉴权大门与定制化左屏登录墙，联通后端 JWT 多态角色分级与审计总线
[应飞扬] 工程：彻底修复跨端部署水土不服与依赖损坏，编写基于 PowerShell 的一键全栈治愈与环境搭建脚本

(前期归档/基础搭建类)
[应飞扬] 前端：基于 React+Vite+Deck.gl+MapLibre 夯实 3D WebGIS 底盘并落地全量玻璃拟态组件库
[应飞扬] 前端：切分 Dashboard 宏观概览视角与 FlightDetailPanel 微观实体雷达视角的空间数据拓扑关系
[应飞扬] 前端：抽取统领时间轴动画的 useUAVAnimation 核心循环体系与城建状态管理 useCityData 钩子引擎
[应飞扬] 后端/数据：单开 backend 实验田，结合 Shapely 实现全国数据提纯洗白并批处理产出五大城市测试集
[应飞扬] 算法：自研融合真实 3D 建筑物禁飞围栏规避与 A* 错落避障底座，并注入含风速重力的电池耗电预测物理学机制
[应飞扬] 前端：清理并精简静态冗余资产，完成跨层级城市硬编码解耦及动态文案跟随补偿
[邓博]   前端：操刀全域气候可视化的环境集成面板并打通物理级的雨/雪/云层颗粒系统交互
[邓博]   前端/算法：校调预警警报面板布局比重与全内容本地化翻译，协同优化风噪干预电耗的物理下切因子