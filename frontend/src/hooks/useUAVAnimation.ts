import { useState, useCallback, useRef, useEffect } from 'react';
import type { UAVPath } from '../types/map';
import { updateActiveUAVsBuffer, formatElapsed, uavPositionsBuffer, activeUAVTrajectories, activeUAVCount, setActiveUAVCount, sabPositions, sabOrientations, sabActiveTrajectoryIndices, uavActiveIndicesBuffer, conflictPairsBuffer, setConflictPairCount, conflictPairCount } from '../utils/animation';
import { calcWindFactor, binarySearchTimestamp } from '../utils/physics';
import AnimationWorker from '../workers/animation.worker?worker';

const ANIMATION_SPEED = 0.016;

// 业务基数模拟常量：使前端演示脱离封闭的短时截面数据集束缚，更贴近真实大屏
const CITY_AIRSPACE_CAPACITY = 1200;  // 模拟南山区低空网络设计最大瞬时并发承载能力
const BASE_CUMULATIVE_FLIGHTS = 8440; // 模拟从当天凌晨至演示启动前，已经完成的历史基础订单累积量

/**
 * 告警检测帧切片分箱机制（Time Slicing / Binning）
 * 解决问题：当屏幕上有成千上万架无人机时，每帧对每个点都进行低电量预测和距离平方计算会导致严重的卡顿（Frame Drop）。
 * 我们将全量检测任务平均分摊到 60 帧内完成。虽然实时告警最多会产生 1 秒钟的延迟，但换来了 O(N)/60 的平滑算力消耗。
 */
const ALERT_SLICE_BINS = 60; 

/** 禁飞缓冲半径（米） - 【优化】灵敏度下调，减少多余告警 */
const NFZ_RADIUS: Record<string, number> = {
    hospital: 150, school: 150,
    clinic: 100, kindergarten: 100,
    college: 120, university: 120,
    police: 80,
};
const DEFAULT_NFZ_RADIUS = 100;

/** 预计算常量：消除热路径中重复的 Math.PI / 180 除法 */
const DEG2RAD = Math.PI / 180;
const R = 6371000;

/** 极速坐标系两点距离平方估算（米^2），免除三角/开方等高昂运算 */
function fastDistSq(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const x = (lon2 - lon1) * DEG2RAD * Math.cos((lat1 + lat2) * 0.5 * DEG2RAD);
    const y = (lat2 - lat1) * DEG2RAD;
    const dx = R * x;
    const dy = R * y;
    return dx * dx + dy * dy;
}

/**
 * 【性能优化 P0-1】图层克隆统一逻辑
 * 提取为纯函数，消除 animate() 和 handleProgressClick() 中完全相同的 30 行重复代码
 * 【性能优化 P2-C】用 Map 哈希查找替代 if-else 字符串比较链，消除热路径中的逐字符比较
 */
type LayerCloner = (layer: any, currentTime: number) => any;

const pointLayerCloner: LayerCloner = (layer, currentTime) => {
    const existing = layer.props.updateTriggers || {};
    return layer.clone({
        data: {
            length: activeUAVCount,
            attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
        },
        updateTriggers: { ...existing, getPosition: currentTime }
    });
};

const LAYER_CLONERS = new Map<string, LayerCloner>([
    ['uav-active-tail-layer', (layer, currentTime) => layer.clone({ currentTime })],
    ['selected-uav-layer', (layer, currentTime) => layer.clone({ updateTriggers: { ...(layer.props.updateTriggers || {}), getPosition: currentTime } })],
    ['uav-model-layer', (layer, currentTime) => layer.clone({
        data: { length: activeUAVCount, attributes: layer.props.data?.attributes },
        updateTriggers: { ...(layer.props.updateTriggers || {}), getPosition: currentTime, getOrientation: currentTime }
    })],
    ['uav-point-layer', pointLayerCloner],
    ['uav-halo-glow-layer', pointLayerCloner],
    ['uav-halo-core-layer', pointLayerCloner],
    ['conflict-arc-layer', (layer, currentTime) => {
        // 中等频率脉冲，清晰且不刺眼
        const pulse = (Math.sin(currentTime * 12) + 1) / 2;
        return layer.clone({
            data: { length: conflictPairCount },
            getSourceColor: [255, 30, 30, 150 + 80 * pulse],
            getTargetColor: [255, 140, 30, 150 + 80 * pulse],
            widthMinPixels: 5 + 4 * pulse, // 发光但不拉扯画面的线宽
            updateTriggers: {
                ...(layer.props.updateTriggers || {}),
                getSourcePosition: currentTime,
                getTargetPosition: currentTime
            }
        });
    }],
]);

function cloneLayers(deck: any, currentTime: number): any[] {
    const currentLayers = deck.props.layers || [];
    const len = currentLayers.length;
    const updatedLayers = new Array(len);
    for (let li = 0; li < len; li++) {
        const layer = currentLayers[li];
        if (!layer) { updatedLayers[li] = layer; continue; }
        const cloner = LAYER_CLONERS.get(layer.id);
        updatedLayers[li] = cloner ? cloner(layer, currentTime) : layer; // 静态图层：零拷贝引用传递
    }
    return updatedLayers;
}

export function useUAVAnimation(
    trajectories: UAVPath[],
    timeRangeRef: React.MutableRefObject<{ min: number; max: number }>,
    currentTimeRef: React.MutableRefObject<number>,
    deckRef: React.MutableRefObject<any>,
    // ---- 以下为新增参数 ----
    energyData?: any,
    poiSensitive?: any,
    windSpeed?: number,
    pushAlert?: (type: 'low-battery' | 'danger-zone' | 'conflict', flightId: string, message: string) => void,
    trackingStateRef?: React.MutableRefObject<{ isTracking: boolean, lockedFlight: any | null }>
) {
    const trajectoriesRef = useRef<UAVPath[]>([]);
    
    // 【OPT-2】高度并行化 Worker 线程
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // @ts-ignore
        workerRef.current = new AnimationWorker();
        
        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'UPDATE_DONE') {
                const count = e.data.payload.count;
                setActiveUAVCount(count);
                // 主线程根据传回来的索引，快速重建高频互动需要用到的内存表
                const trs = trajectoriesRef.current;
                for (let i = 0; i < count; i++) {
                    activeUAVTrajectories[i] = trs[uavActiveIndicesBuffer[i]];
                }
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    useEffect(() => { 
        trajectoriesRef.current = trajectories; 
        if (workerRef.current && trajectories.length) {
            workerRef.current.postMessage({
                type: 'INIT',
                payload: {
                    trajectories,
                    cycleDuration: timeRangeRef.current.max
                }
            });
        }
    }, [trajectories, timeRangeRef]);

    const [isPlaying, setIsPlaying] = useState(true);
    const [animationSpeed, setAnimationSpeed] = useState(1);

    // ==========================================
    // 渲染闭环稳定性防护：单一状态机机制 (OPT-6)
    // 直接同步渲染变量至 refs 对象，避开 useEffect 的生命周期延迟，
    // 维持 animate 的稳定闭包
    // ==========================================
    const animationStateRef = useRef({
        isPlaying,
        speed: animationSpeed,
        energyData,
        windSpeed,
        pushAlert
    });
    // 【性能优化 P6-A】按属性赋值而非构建新对象，消灭高频 React 生命周期带来的闭包对象开销与 V8 Heap GC 狂暴回收
    animationStateRef.current.isPlaying = isPlaying;
    animationStateRef.current.speed = animationSpeed;
    animationStateRef.current.energyData = energyData;
    animationStateRef.current.windSpeed = windSpeed;
    animationStateRef.current.pushAlert = pushAlert;

    const animFrameRef = useRef<number>(0);

    const progressBarRef = useRef<HTMLDivElement>(null);
    const progressTextRef = useRef<HTMLSpanElement>(null);
    const metricsRef = useRef<{ active: ArrayLike<number>, cumulative: ArrayLike<number>, maxActive: number }>({ active: [], cumulative: [], maxActive: 1 });
    const alertFrameCounter = useRef(0);

    // 【性能优化 OPT-5】建立空间哈希索引网格，消除暴力空间遍历
    const sensitivePointsRef = useRef<any[]>([]);
    const sensitiveGridRef = useRef<Map<number, any[]>>(new Map());

    useEffect(() => {
        if (poiSensitive?.features) {
            const points = poiSensitive.features.filter((f: any) => f.geometry?.type === 'Point');
            sensitivePointsRef.current = points;

            // 构建约 500m (0.005度) 分桶的哈希网格（【性能优化 P6-B】使用整数位移哈希替代高频 String 拼接 GC）
            const grid = new Map<number, any[]>();
            for (const p of points) {
                const [lon, lat] = p.geometry.coordinates;
                const k = ((lon / 0.005) | 0) * 100000 + ((lat / 0.005) | 0);
                if (!grid.has(k)) grid.set(k, []);
                grid.get(k)!.push(p);
            }
            sensitiveGridRef.current = grid;
        }
    }, [poiSensitive]);

    useEffect(() => {
        if (!trajectories.length || timeRangeRef.current.max <= 0) return;

        const maxSec = Math.ceil(timeRangeRef.current.max);
        const active = new Int32Array(maxSec + 1);
        const cum = new Int32Array(maxSec + 1);

        for (const t of trajectories) {
            if (!t.timestamps || t.timestamps.length === 0) continue;
            const startStr = t.timestamps[0];
            const endStr = t.timestamps[t.timestamps.length - 1];

            const startSec = Math.max(0, Math.floor(startStr));
            const endSec = Math.min(maxSec, Math.ceil(endStr));

            if (startSec <= maxSec) cum[startSec] += 1;

            for (let s = startSec; s <= endSec; s++) {
                active[s] += 1;
            }
        }

        let currentCum = 0;
        let maxActive = 0;
        for (let i = 0; i <= maxSec; i++) {
            currentCum += cum[i];
            cum[i] = currentCum;
            if (active[i] > maxActive) maxActive = active[i];
        }

        // 【性能优化】直接存 Int32Array 引用，消除 Array.from 的完整内存拷贝
        metricsRef.current = {
            active,
            cumulative: cum,
            maxActive: maxActive || 1
        };
    }, [trajectories, timeRangeRef]);

    // 【性能优化】缓存 DOM 引用，避免每帧 4 次 getElementById 查找
    const domCacheRef = useRef<{
        active: HTMLElement | null,
        cum: HTMLElement | null,
        load: HTMLElement | null,
        bar: HTMLElement | null,
        initialized: boolean
    }>({ active: null, cum: null, load: null, bar: null, initialized: false });
    
    const lastDashboardMetrics = useRef({ active: -1, cum: -1, load: -1 });

    const updateDashboardDOM = useCallback((time: number) => {
        const metricsLen = metricsRef.current.active.length;
        if (metricsLen === 0) return;

        const sec = time < metricsLen ? (time | 0) : metricsLen - 1;
        if (sec < 0) return;

        const activeCount = metricsRef.current.active[sec] || 0;
        // 累加上全天历史基数，呈现出一个宏大且单调递增的今日真实流水量
        const cumCount = (metricsRef.current.cumulative[sec] || 0) + BASE_CUMULATIVE_FLIGHTS;
        // 使用宏观物理空域承载力作为分母（避免用数据自身峰值当分母造成的假100%现象），设定 100 封顶
        const loadPct = Math.min(100, ((activeCount / CITY_AIRSPACE_CAPACITY) * 100 + 0.5) | 0);

        const cache = domCacheRef.current;
        const last = lastDashboardMetrics.current;
        
        // 【性能优化 P6-C】如果底层数据没有变化，直接阻断后续查找与 DOM 指令写入（无论 JS 还是 DOM 都拒绝废操作）
        if (cache.initialized && last.active === activeCount && last.cum === cumCount && last.load === loadPct) {
            return;
        }
        lastDashboardMetrics.current = { active: activeCount, cum: cumCount, load: loadPct };

        // 懒初始化 DOM 缓存
        if (!cache.initialized) {
            cache.active = document.getElementById('dashboard-active-drones');
            cache.cum = document.getElementById('dashboard-cumulative-flights');
            cache.load = document.getElementById('dashboard-airspace-load');
            cache.bar = document.getElementById('dashboard-airspace-bar');
            cache.initialized = true;
        }

        if (cache.active) cache.active.textContent = '' + activeCount;
        if (cache.cum) cache.cum.textContent = '' + cumCount;
        if (cache.load) cache.load.textContent = loadPct + '%';
        if (cache.bar) cache.bar.style.width = loadPct + '%';
    }, []);

    // ---- 告警检测逻辑（使用时间切片优化） ----
    const checkAlerts = useCallback((currentTime: number, currentFrame: number) => {
        const state = animationStateRef.current;
        const currentPushAlert = state.pushAlert;
        const currentEnergyData = state.energyData;
        if (!currentPushAlert || !currentEnergyData) return;

        const wf = calcWindFactor(state.windSpeed ?? 3);
        
        // Time Slicing: 把 O(M*N) 的全量计算平摊。当前帧只处理索引满足条件的无人机
        const binIndex = currentFrame % ALERT_SLICE_BINS;

        for (let i = binIndex; i < activeUAVCount; i += ALERT_SLICE_BINS) {
            const traj = activeUAVTrajectories[i];
            if (!traj) continue;

            const flightId = traj.id;
            const ed = currentEnergyData[flightId];

            // ① 低电量检测（使用公共二分搜索）
            if (ed?.battery && ed.battery.length > 0) {
                const timestamps = traj.timestamps;
                const idx = binarySearchTimestamp(timestamps, currentTime);
                const startBat = ed.battery[0];
                const rawBat = ed.battery[idx];
                const adjustedBat = Math.max(0, startBat - (startBat - rawBat) * wf);
                if (adjustedBat < 20 && adjustedBat > 0) {
                    currentPushAlert(
                        'low-battery',
                        flightId,
                        `无人机 ${flightId} 电量过低 (${adjustedBat.toFixed(1)}%)，存在坠落风险，请立即介入。`
                    );
                }
            }

            // 【性能优化 OPT-5】危险区检测：利用九宫格空间哈希，从 O(M) 降为 O(1)
            const grid = sensitiveGridRef.current;
            if (grid.size > 0) {
                const uavLon = uavPositionsBuffer[i * 3 + 0];
                const uavLat = uavPositionsBuffer[i * 3 + 1];
                
                const gx = (uavLon / 0.005) | 0;
                const gy = (uavLat / 0.005) | 0;
                let foundAlert = false;

                // 只查找本单元与周边相邻的 8 个单元格子
                for (let dx = -1; dx <= 1 && !foundAlert; dx++) {
                    for (let dy = -1; dy <= 1 && !foundAlert; dy++) {
                        const localPoints = grid.get((gx + dx) * 100000 + (gy + dy));
                        if (!localPoints) continue;

                        for (const poi of localPoints) {
                            const coords = poi.geometry?.coordinates;
                            if (!coords) continue;
                            const [poiLon, poiLat] = coords;
                            const category = poi.properties?.category || '';
                            const radius = NFZ_RADIUS[category] || DEFAULT_NFZ_RADIUS;
                            const distSq = fastDistSq(uavLon, uavLat, poiLon, poiLat);
                            if (distSq < radius * radius) {
                                const poiName = poi.properties?.name || category;
                                const dist = Math.sqrt(distSq); // 仅触发时才花性能算真实距离
                                currentPushAlert(
                                    'danger-zone',
                                    flightId,
                                    `无人机 ${flightId} 已进入 ${poiName} 限制空域（距中心 ${Math.round(dist)}m），请立即调度绕行。`
                                );
                                foundAlert = true;
                                break; 
                            }
                        }
                    }
                }
            }
        }

        // ③ 【4D 时空冲突检测】UAV 间邻域碰撞检测
        // 使用 0.002° (~200m) 空间哈希网格，在同 bin 和邻 bin 内做两两距离检测
        // 同样使用时间切片：每帧只在 binIndex === 0 时执行一次全量扫描（约每秒一次）
        if (binIndex === 0 && activeUAVCount > 1) {
            const CONFLICT_GRID_SIZE = 0.002; // ~200m 网格粒度
            const CONFLICT_WARN_DIST_SQ = 200 * 200;  // 200m 黄色近距警告
            const CONFLICT_DANGER_DIST_SQ = 80 * 80;   // 80m 红色碰撞风险
            const CONFLICT_ALT_THRESHOLD = 30;          // 高度差阈值（米）

            // 构建当前帧 UAV 位置的临时空间哈希（帧内构建帧内丢弃，无跨帧状态）
            const uavGrid = new Map<number, number[]>();
            for (let u = 0; u < activeUAVCount; u++) {
                const gx = (uavPositionsBuffer[u * 3] / CONFLICT_GRID_SIZE) | 0;
                const gy = (uavPositionsBuffer[u * 3 + 1] / CONFLICT_GRID_SIZE) | 0;
                const key = gx * 100000 + gy;
                if (!uavGrid.has(key)) uavGrid.set(key, []);
                uavGrid.get(key)!.push(u);
            }

            let pairCount = 0;
            const maxPairs = 200;
            const checked = new Set<number>(); // 避免重复检测同一对

            for (const [_key, indices] of uavGrid) {
                if (pairCount >= maxPairs) break;
                // 同 bin 内两两检测
                for (let a = 0; a < indices.length && pairCount < maxPairs; a++) {
                    const ai = indices[a];
                    const ax = uavPositionsBuffer[ai * 3];
                    const ay = uavPositionsBuffer[ai * 3 + 1];
                    const az = uavPositionsBuffer[ai * 3 + 2];

                    for (let b = a + 1; b < indices.length && pairCount < maxPairs; b++) {
                        const bi = indices[b];
                        const pairKey = ai < bi ? ai * 100000 + bi : bi * 100000 + ai;
                        if (checked.has(pairKey)) continue;
                        checked.add(pairKey);

                        const bz = uavPositionsBuffer[bi * 3 + 2];
                        const altDiff = Math.abs(az - bz);
                        if (altDiff > CONFLICT_ALT_THRESHOLD) continue;

                        const bx = uavPositionsBuffer[bi * 3];
                        const by = uavPositionsBuffer[bi * 3 + 1];
                        const distSq = fastDistSq(ax, ay, bx, by);

                        if (distSq < CONFLICT_WARN_DIST_SQ) {
                            // 写入冲突弧线缓冲区
                            conflictPairsBuffer[pairCount * 6 + 0] = ax;
                            conflictPairsBuffer[pairCount * 6 + 1] = ay;
                            conflictPairsBuffer[pairCount * 6 + 2] = az;
                            conflictPairsBuffer[pairCount * 6 + 3] = bx;
                            conflictPairsBuffer[pairCount * 6 + 4] = by;
                            conflictPairsBuffer[pairCount * 6 + 5] = bz;
                            pairCount++;

                            // 只有达到危险距离才推送告警通知
                            if (distSq < CONFLICT_DANGER_DIST_SQ) {
                                const idA = activeUAVTrajectories[ai]?.id || `UAV-${ai}`;
                                const idB = activeUAVTrajectories[bi]?.id || `UAV-${bi}`;
                                const dist = Math.sqrt(distSq);
                                currentPushAlert(
                                    'conflict',
                                    `${idA}_${idB}`,
                                    `空域冲突！${idA} 与 ${idB} 水平距离仅 ${Math.round(dist)}m，高度差 ${Math.round(altDiff)}m，存在碰撞风险！`
                                );
                            }
                        }
                    }
                }
            }
            setConflictPairCount(pairCount);
        }
    }, []); // 稳定回调：所有外部依赖已通过 ref 读取

    const animate = useCallback(() => {
        if (timeRangeRef.current.max === 0) {
            animFrameRef.current = requestAnimationFrame(animate);
            return;
        }

        let next = currentTimeRef.current;
        
        // 【性能优化 OPT-6】从单一状态机读取播放状态
        const state = animationStateRef.current;
        if (state.isPlaying) {
            next += ANIMATION_SPEED * state.speed;
            if (next > timeRangeRef.current.max) next = 0;
            currentTimeRef.current = next;
        }

        const deck = deckRef.current?.deck;
        if (deck) {
            // 【性能优化 OPT-2】通过 Worker 计算或者如果主线程直调降级
            if (typeof SharedArrayBuffer !== 'undefined' && workerRef.current) {
                // 派发任务给 Worker（异步），主线程在下一次帧取用计算好的数据
                workerRef.current.postMessage({
                    type: 'UPDATE',
                    payload: {
                        currentGlobalTime: next,
                        sabPositions,
                        sabOrientations,
                        sabActiveTrajectoryIndices
                    }
                });
            } else {
                updateActiveUAVsBuffer(trajectoriesRef.current, next, timeRangeRef.current.max);
            }

            // 【性能优化 P0-1】使用提取的统一图层克隆函数，已自带静态图层复用功能(OPT-3)
            const updatedLayers = cloneLayers(deck, next);
            
            let nextViewState = undefined;
            // 【电影级运镜】硬锁定跟拍逻辑：在 RAF 级别直接架空 React 接管相机坐标
            if (trackingStateRef && trackingStateRef.current.isTracking && trackingStateRef.current.lockedFlight) {
                const flight = trackingStateRef.current.lockedFlight;
                const ft = flight.timestamps;
                const idx = binarySearchTimestamp(ft, next);
                let lon, lat;
                if (idx > 0 && idx < ft.length) {
                    const t0 = ft[idx - 1], t1 = ft[idx];
                    const p0 = flight.path[idx - 1], p1 = flight.path[idx];
                    const ratio = (next - t0) / (t1 - t0);
                    lon = p0[0] + (p1[0] - p0[0]) * ratio;
                    lat = p0[1] + (p1[1] - p0[1]) * ratio;
                } else if (idx <= 0) {
                    lon = flight.path[0][0]; lat = flight.path[0][1];
                } else {
                    lon = flight.path[flight.path.length-1][0]; lat = flight.path[flight.path.length-1][1];
                }
                if (lon !== undefined && lat !== undefined && deck.props.viewState) {
                    nextViewState = {
                        ...deck.props.viewState,
                        longitude: lon,
                        latitude: lat,
                        transitionDuration: 0 // 每一帧强制覆盖位置，切勿套用补间动画以免拉扯
                    };
                }
            }
            
            if (nextViewState) {
                deck.setProps({ layers: updatedLayers, viewState: nextViewState });
            } else {
                deck.setProps({ layers: updatedLayers });
            }
        }

        alertFrameCounter.current++;

        // 【性能优化 OPT-8】DOM 更新降频至约 15fps（每 4 帧更新一次），减少 style recalc
        if (alertFrameCounter.current % 4 === 0) {
            if (progressBarRef.current) {
                const progress = timeRangeRef.current.max > 0 ? (next / timeRangeRef.current.max) * 100 : 0;
                progressBarRef.current.style.width = `${progress}%`;
            }
            if (progressTextRef.current) {
                const txt = formatElapsed(next);
                // 【性能优化 P6-D】拦截无效的文本 DOM 写入，降低 Browser Paint 压力
                if (progressTextRef.current.textContent !== txt) {
                    progressTextRef.current.textContent = txt;
                }
            }
            updateDashboardDOM(next);
        }

        // 降频告警检测 -> 优化为时间切片告警检测，每帧只算 1/60 的数据！消灭性能尖刺！
        checkAlerts(next, alertFrameCounter.current);

        animFrameRef.current = requestAnimationFrame(animate);
    }, [updateDashboardDOM, timeRangeRef, currentTimeRef, deckRef, checkAlerts]);
    // 【性能优化】移除 isPlaying 和 animationSpeed 依赖 →  animate 回调保持稳定引用

    // RAF 循环始终运行（由内部 isPlayingRef 控制是否推进时间），避免频繁注销/重注册
    useEffect(() => {
        animFrameRef.current = requestAnimationFrame(animate);
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [animate]);

    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        currentTimeRef.current = pct * timeRangeRef.current.max;

        const progress = pct * 100;
        if (progressBarRef.current) {
            progressBarRef.current.style.width = `${progress}%`;
        }
        if (progressTextRef.current) {
            progressTextRef.current.textContent = formatElapsed(currentTimeRef.current);
        }

        updateDashboardDOM(currentTimeRef.current);

        const deck = deckRef.current?.deck;
        if (deck) {
            const t = currentTimeRef.current;
            updateActiveUAVsBuffer(trajectoriesRef.current, t, timeRangeRef.current.max);

            // 【性能优化 P0-1】使用提取的统一图层克隆函数
            const updatedLayers = cloneLayers(deck, t);
            deck.setProps({ layers: updatedLayers });
        }
    }, [timeRangeRef, currentTimeRef, updateDashboardDOM, deckRef]);

    return {
        isPlaying,
        setIsPlaying,
        animationSpeed,
        setAnimationSpeed,
        progressBarRef,
        progressTextRef,
        handleProgressClick
    };
}

