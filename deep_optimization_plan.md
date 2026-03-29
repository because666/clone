# 🔬 深度性能优化计划 — 底层级别

基于对 `animation.ts`、`useUAVAnimation.ts`、`useMapLayers.ts`、`useCityData.ts`、`server.py` 的系统级源代码审计，识别出以下底层优化机会。

---

## 本次优化哲学

> 上一轮解决了"**做了不该做的事**"（多余依赖、重复计算）。
> 本轮要解决"**可以做得更好的事**"（算法级、内存级、GPU 管线级优化）。

---

## OPT-1：🔴 轨迹数据 SoA 预编译 — 消除热路径的 AoS 间接引用

**当前问题**：`updateActiveUAVsBuffer()` 每帧遍历 `trajectories[]`，每条轨迹的 `path` 是 `[lon, lat, alt][]` 形式的 AoS（Array of Structs）。每次访问 `path[segIdx][0]` 都是双重间接寻址（数组→子数组→元素），对 CPU 缓存极不友好。

**优化方案**：在轨迹数据加载完成后，一次性将 AoS 展平为 SoA Float32Array：
```typescript
// 预编译阶段（一次性）
pathLon = new Float32Array(totalPoints);
pathLat = new Float32Array(totalPoints);
pathAlt = new Float32Array(totalPoints);
timestamps = new Float64Array(totalPoints);
```
热路径中 `p0[0]` 变成 `pathLon[offset + segIdx]`，连续内存，CPU 缓存命中率从 ~30% 跃升至 ~95%。

**影响范围**：`animation.ts`、加载管线 `useCityData.ts`
**预期收益**：动画帧时间减少 15-25%（1000+ 轨迹场景）

---

## OPT-2：🔴 Web Worker 并行化动画计算 — 主线程零负载渲染

**当前问题**：`updateActiveUAVsBuffer()` 在主线程 RAF 中运行。当 500+ 条轨迹同屏时，每帧的二分搜索 + 插值计算消耗 2-4ms，挤压 Deck.gl 渲染预算。

**优化方案**：将 `updateActiveUAVsBuffer` 移入 Web Worker：
1. 创建 `animationWorker.ts`
2. 通过 `SharedArrayBuffer` + `Atomics` 共享 `uavPositionsBuffer` 和 `uavOrientationsBuffer`
3. 主线程 RAF 只负责调用 `deck.setProps()`，计算在 Worker 线程异步完成
4. Worker 写完后通过 `Atomics.notify` 信号量通知主线程可以读取

> [!WARNING]
> `SharedArrayBuffer` 需要页面设置 COOP/COEP 响应头。若部署环境不支持，降级为 `postMessage` + `Transferable` 的双缓冲方案。

**影响范围**：`animation.ts`、`useUAVAnimation.ts`、`vite.config.ts`（设置响应头）
**预期收益**：主线程动画计算负载降至 0，释放 2-4ms/帧给 GPU 渲染

---

## OPT-3：🟠 图层 Diff 拦截 — 消除每帧 `clone()` 的 Props 扩散

**当前问题**：`cloneLayers()` 每帧对 5-7 个图层执行 `layer.clone()`，Deck.gl 内部会做完整的 props shallow merge + diff check。对于 `buildings-layer` 等静态图层，clone 结果等于自身引用。

**优化方案**：用 `id` 快速过滤，只 clone 需要更新的层，静态图层直接引用传递（现有代码部分做了但 `cloneLayers` 函数对 buildings 等仍走 else 分支创建新引用）。进一步优化：
- **取消 `activeTailLayer` 的 clone**：`TripsLayer` 的 `currentTime` 可直接通过 `deck.props.layers[i].state` 内部 uniform 更新，无需 clone
- 将静态图层引用缓存在 `useRef` 中，clone 调用之前先比较 `layer.id` 前缀

**影响范围**：`useUAVAnimation.ts` 的 `cloneLayers()`
**预期收益**：每帧减少 2-3 次不必要的 shallow merge

---

## OPT-4：🟠 GeoJSON 建筑预处理 — 14MB → ~3MB 压缩优化

**当前问题**：`buildings_3d.geojson` 单城市文件高达 **14MB**。前端 JSON.parse 14MB 即使在 Worker 中也需要 200-400ms。浮点坐标精度过高（15 位小数 vs 实际需要 5-6 位）。

**优化方案**（分三级实施）：
1. **坐标精度截断**：Python 脚本离线处理，`round(coord, 6)`，减少 JSON 体积 30-40%
2. **启用 gzip/brotli 压缩**：Vite dev server 已默认支持。检查生产环境 nginx 配置
3. **Protocol Buffers / FlatBuffers**（竞赛答辩亮点）：将建筑数据序列化为 `.fbs` 二进制格式，前端直接 `arrayBuffer → Typed View`，跳过 JSON.parse。减少解析时间 5-10x

> [!IMPORTANT]
> 第 3 级需要引入额外依赖（flatbuffers），建议大文件优先用第 1-2 级，效果已很显著。

**影响范围**：离线预处理脚本、`workerFetch.ts`

---

## OPT-5：🟠 告警检测空间索引 — 网格哈希替代暴力遍历

**当前问题**：`checkAlerts()` 对每架 UAV 遍历所有 `sensitivePoints`（O(N×M)），虽然有时间切片但 M 可能上百。

**优化方案**：将敏感点预先建立**网格空间索引（Grid Hash）**：
```typescript
// 以 0.005° 为网格粒度（约 500m），根据 lat/lon 分桶
const grid = new Map<string, SensitivePoint[]>();
function getKey(lon: number, lat: number) { 
    return `${(lon/0.005)|0}_${(lat/0.005)|0}`; 
}
```
查询时只检查 UAV 所在网格及邻居 9 格的敏感点，将 O(M) 降到平均 O(1-3)。

**影响范围**：`useUAVAnimation.ts` 的 `checkAlerts()`
**预期收益**：告警检测从 O(N×M) 降至 O(N)

---

## OPT-6：🟡 无锁帧状态机 — 消除 animate 闭包中的 4 个 useRef 同步

**当前问题**：`useUAVAnimation` 中有 `isPlayingRef`、`animSpeedRef`、`energyDataRef`、`windSpeedRef` 四个通过 `useEffect` 同步到 ref 的状态。每次状态变更触发 4 个微任务（useEffect 是异步的），存在 1 帧的读取延迟。

**优化方案**：创建一个单一的 `AnimationState` 对象，用 `useRef` 存储：
```typescript
const stateRef = useRef({
    isPlaying: true,
    speed: 1,
    energyData: null,
    windSpeed: 3,
});
// 直接写入（同步更新，无 useEffect 延迟）
stateRef.current.speed = newSpeed;
```
减少 4 个 `useEffect` → 0 个，消除帧间同步延迟。

**影响范围**：`useUAVAnimation.ts`
**预期收益**：减少 4 次 useEffect 调度，消除 1 帧的状态延迟

---

## OPT-7：🟡 ScenegraphLayer 实例矩阵预计算 — GPU instancing 加速

**当前问题**：`ScenegraphLayer` 的 `getPosition` 和 `getOrientation` 是 CPU 回调函数。Deck.gl 内部对每个实例调用回调计算 model matrix。500 个实例 = 500 次函数调用/帧。

**优化方案**：预计算 `instanceModelMatrix` 为 `Float32Array`（每实例 16 floats），直接通过 binary attribute 传入 GPU：
```typescript
const instanceMatrices = new Float32Array(MAX_UAVS * 16);
// 在 updateActiveUAVsBuffer 中直接写入 4x4 矩阵
data: {
    length: activeUAVCount,
    attributes: {
        instanceModelMatrix: { value: instanceMatrices, size: 16 }
    }
}
```
这样 Deck.gl 跳过 CPU 端的逐实例回调，直接将矩阵数组上传 GPU。

> [!IMPORTANT]  
> 需要确认 Deck.gl v9 的 ScenegraphLayer 是否暴露 `instanceModelMatrix` 作为 binary attribute。如果不支持，降级为仅优化 `ScatterplotLayer`（该层已经支持 binary `getPosition`）。

**影响范围**：`animation.ts`、`useMapLayers.ts`

---

## OPT-8：🟡 进度条/文本更新 — requestAnimationFrame 批量化

**当前问题**：`animate()` 每帧更新 `progressBar.style.width`、`progressText.textContent`、以及 4 个 Dashboard DOM 元素。共 6 次 DOM 写入/帧。虽然浏览器会合批，但逐行 DOM mutation 仍会触发 style recalc。

**优化方案**：降频 DOM 更新至 15fps（每 4 帧更新一次），人眼对进度条精度不敏感：
```typescript
if (frameCount % 4 === 0) {
    updateProgressDOM(next);
    updateDashboardDOM(next);
}
```

**影响范围**：`useUAVAnimation.ts`
**预期收益**：DOM mutation 频率降低 75%

---

## 优先级矩阵

| 编号 | 项目 | 影响 | 复杂度 | 建议顺序 |
|------|------|------|--------|----------|
| OPT-1 | SoA 预编译 | 🔴高 | 中 | ⭐ 1 |
| OPT-6 | 无锁帧状态机 | 🟡中 | 低 | ⭐ 2 |
| OPT-8 | DOM 降频更新 | 🟡中 | 低 | ⭐ 3 |
| OPT-5 | 空间索引 | 🟠中高 | 中 | ⭐ 4 |
| OPT-3 | 图层 diff 拦截 | 🟠中高 | 中 | ⭐ 5 |
| OPT-4 | GeoJSON 预处理 | 🟠中高 | 低-中 | ⭐ 6 |
| OPT-2 | Worker 并行化 | 🔴高 | 高 | ⭐ 7 |
| OPT-7 | 实例矩阵预计算 | 🟡中 | 高 | ⭐ 8 |

---

## 验证计划

### 构建验证
- `npm run build` 确保编译通过

### 性能基准对比
- 在浏览器 DevTools Performance 面板中录制 10 秒动画
- 对比优化前后的 `Scripting`、`Rendering` 时间和 FPS 稳定性
- 重点观察：帧时间 P95 是否从 >16ms 降至 <12ms

## 开放性问题

> [!IMPORTANT]
> 1. **SharedArrayBuffer** 是否可行？需要确认部署环境是否能设置 `Cross-Origin-Embedder-Policy: require-corp` 响应头
> 2. **OPT-1 SoA 预编译**改变了数据存储格式，需要适配 `handleFocusFlight`、`FlightDetailPanel` 等读取 `path[i]` 的代码
> 3. 以上 8 项是否全部执行，还是选择子集？建议至少执行 OPT-1/6/8/5（低风险高回报组合）
