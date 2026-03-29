import { useState, useCallback, useRef, useEffect } from 'react';
import type { UAVPath } from '../types/map';
import { updateActiveUAVsBuffer, formatElapsed, uavPositionsBuffer, activeUAVTrajectories, activeUAVCount, setActiveUAVCount, sabPositions, sabOrientations, sabActiveTrajectoryIndices, uavActiveIndicesBuffer } from '../utils/animation';
import { calcWindFactor, binarySearchTimestamp } from '../utils/physics';
import AnimationWorker from '../workers/animation.worker?worker';

// 动画渲染的步长常量
const ANIMATION_SPEED = 0.016;

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
 */
function cloneLayers(deck: any, currentTime: number): any[] {
    const currentLayers = deck.props.layers || [];
    const len = currentLayers.length;
    const updatedLayers = new Array(len);
    for (let li = 0; li < len; li++) {
        const layer = currentLayers[li];
        if (!layer) { updatedLayers[li] = layer; continue; }
        const lid = layer.id;
        if (lid === 'uav-active-tail-layer') {
            updatedLayers[li] = layer.clone({ currentTime });
        } else if (lid === 'selected-uav-layer') {
            updatedLayers[li] = layer.clone({ updateTriggers: { getPosition: currentTime } });
        } else if (lid === 'uav-model-layer') {
            updatedLayers[li] = layer.clone({
                data: { length: activeUAVCount },
                updateTriggers: { getPosition: currentTime, getOrientation: currentTime }
            });
        } else if (lid === 'uav-point-layer') {
            updatedLayers[li] = layer.clone({
                data: {
                    length: activeUAVCount,
                    attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
                },
                updateTriggers: { getPosition: currentTime }
            });
        } else {
            updatedLayers[li] = layer; // 静态图层：零拷贝引用传递
        }
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
    pushAlert?: (type: 'low-battery' | 'danger-zone', flightId: string, message: string) => void,
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
    animationStateRef.current = { isPlaying, speed: animationSpeed, energyData, windSpeed, pushAlert };

    const animFrameRef = useRef<number>(0);

    const progressBarRef = useRef<HTMLDivElement>(null);
    const progressTextRef = useRef<HTMLSpanElement>(null);
    const metricsRef = useRef<{ active: ArrayLike<number>, cumulative: ArrayLike<number>, maxActive: number }>({ active: [], cumulative: [], maxActive: 1 });
    const alertFrameCounter = useRef(0);

    // 【性能优化 OPT-5】建立空间哈希索引网格，消除暴力空间遍历
    const sensitivePointsRef = useRef<any[]>([]);
    const sensitiveGridRef = useRef<Map<string, any[]>>(new Map());

    useEffect(() => {
        if (poiSensitive?.features) {
            const points = poiSensitive.features.filter((f: any) => f.geometry?.type === 'Point');
            sensitivePointsRef.current = points;

            // 构建约 500m (0.005度) 分桶的哈希网格
            const grid = new Map<string, any[]>();
            for (const p of points) {
                const [lon, lat] = p.geometry.coordinates;
                const k = `${(lon / 0.005) | 0}_${(lat / 0.005) | 0}`;
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

    const updateDashboardDOM = useCallback((time: number) => {
        const metricsLen = metricsRef.current.active.length;
        if (metricsLen === 0) return;

        const sec = time < metricsLen ? (time | 0) : metricsLen - 1;
        if (sec < 0) return;

        const activeCount = metricsRef.current.active[sec] || 0;
        const cumCount = metricsRef.current.cumulative[sec] || 0;
        const loadPct = ((activeCount / metricsRef.current.maxActive) * 100 + 0.5) | 0;

        // 懒初始化 DOM 缓存
        const cache = domCacheRef.current;
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
                        const localPoints = grid.get(`${gx + dx}_${gy + dy}`);
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
                progressTextRef.current.textContent = formatElapsed(next);
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

