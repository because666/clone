# DEVLOG & CHANGELOG

> 记录依赖变动、核心重构或重大 Bug 排查结果
> 格式：`## MM-DD [你的名字] 变更简述`

## 03-22 [应飞扬] 增加全新运行统计大屏与 UI 细节优化
  1. 引入 ECharts 构建了《全局运行态势分析》数据面板，涵盖分时段调度分布等三个横向排布的图表卡片。
  2. 修复组件参数下发遗漏，将统计入口整体锚定至左上角，重新校准打磨系统级全局毛玻璃参数。
  3. 优化视觉体验空间，将右侧环境综合抽屉 `RightControlPanel` 调整为默认闭合触发形式。

## 03-19 [应飞扬] 批量数据同步与渲染引擎 Bug 修复
  1. 优化了 `batch_generate.py` 和 `generate_energy.py`，支持多城市逗号分隔执行（默认参数 `n=500`），并彻底全量生成了包含北京、成都、重庆、广州、上海、深圳在内的全局轨迹与关联能耗数据至 public 目录。
  2. 清理剥换了 `frontend/public/data` 下的大量历史无用数据包，如 CSV 或 raw 文件，保持资源树整洁。
  3. 修复了前端地图暂停即闪退飞机的严重呈现 Bug：剥离了 `MapContainer` 中 `activeUAVs` 针对 mutable buffer 的浅引用 `useMemo` 缓存。这一改动完美规避了因暂停触发 React re-render 重新读取空状态闭包导致模型消失的问题，实现了丝滑帧冻结。
  4. 移除了 `utils/animation.ts` 每秒在主进程申请十多万个微小切片数组的糟糕设计（彻底消除 GC 停顿回收瓶颈）。改抛进 GPU 显卡内核将 500 架飞机同时测算禁飞区距离的检测砍至伪欧式二维平面投射，只有报警前瞬才换算真实距离；低电量时间匹配由普通线形扫描变更为 O(logN) 标准二分搜索。
  5. 解锁 `useCityData` 钩子加载大尺寸 JSON 与 GeoJSON 数据通道由原本的 3 线程至 10 线程并发，榨干 HTTP/2 首屏加载带宽。

## 03-09 [应飞扬] 能源数据结构
  1. 算法端重写了 `generate_energy.py`，加入了基于真实载重和物理阻力的耗电推演。
  2. 在前端最终产出的轨迹 JSON 中追加了 `energy_data` 节点（包含电池流失曲线和载重上限）
  3. 前端侧新增并完善了 `FlightDetailPanel` 悬浮组件以消费此数据。
如果有旧的生成数据没有这个节点，前端渲染时可能会白屏报错，请必须用最新的 `batch_generate.py` 重新跑一遍全城数据。（但是源数据我还没有git，主要原因是大小）

## 03-08 [应飞扬] MapContainer 重构
  1. 将曾经高达 800 行的 `MapContainer.tsx` 进行了拆分。
  2. 把取数据的逻辑剥离到了 `useCityData` Hook 中
  3. 把控制无人机怎么飞的 `requestAnimationFrame` 剥离到了 `useUAVAnimation` 中
  4. 抽离了纯静态展现的 `DashboardOverlay`
