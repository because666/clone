import { useState, useCallback, useRef, useEffect } from 'react';
import type { UAVPath } from '../types/map';
import { updateActiveUAVsBuffer, formatElapsed, uavPositionsBuffer, activeUAVTrajectories, activeUAVCount } from '../utils/animation';
import { calcWindFactor, binarySearchTimestamp } from '../utils/physics';

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

/** 极速坐标系两点距离平方估算（米^2），免除三角/开方等高昂运算 */
function fastDistSq(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6371000;
    const x = (lon2 - lon1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    const y = (lat2 - lat1) * Math.PI / 180;
    const dx = R * x;
    const dy = R * y;
    return dx * dx + dy * dy;
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
    useEffect(() => { trajectoriesRef.current = trajectories; }, [trajectories]);

    const [isPlaying, setIsPlaying] = useState(true);
    const [animationSpeed, setAnimationSpeed] = useState(1);

    // ==========================================
    // 渲染闭环稳定性防护：状态解耦机制
    // React state 更新往往会导致组件重渲染。但这里是高频核心动画引擎，
    // 为了防止 requestAnimationFrame (RAF) 因组件重绘而频繁被注销/重启（导致闪动），
    // 强制将频繁变更的依赖缓存至 MutableRefObject，使 animate 函数永久保持闭包级别固定引用。
    // ==========================================
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    const animSpeedRef = useRef(animationSpeed);
    useEffect(() => { animSpeedRef.current = animationSpeed; }, [animationSpeed]);
    const animFrameRef = useRef<number>(0);

    const progressBarRef = useRef<HTMLDivElement>(null);
    const progressTextRef = useRef<HTMLSpanElement>(null);
    const metricsRef = useRef<{ active: number[], cumulative: number[], maxActive: number }>({ active: [], cumulative: [], maxActive: 1 });
    const alertFrameCounter = useRef(0);

    // 缓存敏感 POI 点数组
    const sensitivePointsRef = useRef<any[]>([]);
    useEffect(() => {
        if (poiSensitive?.features) {
            sensitivePointsRef.current = poiSensitive.features.filter(
                (f: any) => f.geometry?.type === 'Point'
            );
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

        metricsRef.current = {
            active: Array.from(active),
            cumulative: Array.from(cum),
            maxActive: maxActive || 1
        };
    }, [trajectories, timeRangeRef]);

    const updateDashboardDOM = useCallback((time: number) => {
        const sec = Math.min(Math.floor(time), metricsRef.current.active.length - 1);
        if (sec >= 0) {
            const activeCount = metricsRef.current.active[sec] || 0;
            const cumCount = metricsRef.current.cumulative[sec] || 0;
            const loadPct = Math.min(100, Math.round((activeCount / metricsRef.current.maxActive) * 100));

            const domActive = document.getElementById('dashboard-active-drones');
            if (domActive) domActive.textContent = activeCount.toString();

            const domCum = document.getElementById('dashboard-cumulative-flights');
            if (domCum) domCum.textContent = cumCount.toString();

            const domLoad = document.getElementById('dashboard-airspace-load');
            if (domLoad) domLoad.textContent = `${loadPct}%`;

            const domBar = document.getElementById('dashboard-airspace-bar');
            if (domBar) domBar.style.width = `${loadPct}%`;
        }
    }, []);

    // 缓存 energyData/windSpeed/pushAlert 到 ref，供 animate 帧循环中稳定读取
    const energyDataRef = useRef(energyData);
    useEffect(() => { energyDataRef.current = energyData; }, [energyData]);
    const windSpeedRef = useRef(windSpeed);
    useEffect(() => { windSpeedRef.current = windSpeed; }, [windSpeed]);
    const pushAlertRef = useRef(pushAlert);
    useEffect(() => { pushAlertRef.current = pushAlert; }, [pushAlert]);

    // ---- 告警检测逻辑（使用时间切片优化） ----
    const checkAlerts = useCallback((currentTime: number, currentFrame: number) => {
        const currentPushAlert = pushAlertRef.current;
        const currentEnergyData = energyDataRef.current;
        if (!currentPushAlert || !currentEnergyData) return;

        const wf = calcWindFactor(windSpeedRef.current ?? 3);
        const sensitivePoints = sensitivePointsRef.current;
        
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

            // ② 危险区检测
            if (sensitivePoints.length > 0) {
                const uavLon = uavPositionsBuffer[i * 3 + 0];
                const uavLat = uavPositionsBuffer[i * 3 + 1];
                for (const poi of sensitivePoints) {
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
                        break; // 一架无人机一次只报一个危险区
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
        
        // 【性能优化】从 ref 读取播放状态，避免 animate 依赖 isPlaying state
        if (isPlayingRef.current) {
            next += ANIMATION_SPEED * animSpeedRef.current;
            if (next > timeRangeRef.current.max) next = 0;
            currentTimeRef.current = next;
        }

        const deck = deckRef.current?.deck;
        if (deck) {
            const currentLayers = deck.props.layers || [];
            const updatedLayers = currentLayers.map((layer: any) => {
                if (layer?.id === 'uav-active-tail-layer') {
                    return layer.clone({
                        currentTime: next
                    });
                }
                if (layer?.id === 'selected-uav-layer') {
                    return layer.clone({
                        updateTriggers: { getPosition: next }
                    });
                }
                if (layer?.id === 'uav-model-layer' || layer?.id === 'uav-point-layer') {
                    // 全局仅写入唯一的一组 TypedArray 内存映射
                    updateActiveUAVsBuffer(trajectoriesRef.current, next, timeRangeRef.current.max);
                    const isModel = layer.id === 'uav-model-layer';
                    
                    return layer.clone(isModel ? {
                        data: { length: activeUAVCount },
                        updateTriggers: { getPosition: next, getOrientation: next }
                    } : {
                        data: {
                            length: activeUAVCount,
                            attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
                        },
                        updateTriggers: { getPosition: next }
                    });
                }
                return layer;
            });
            
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

        if (progressBarRef.current) {
            const progress = timeRangeRef.current.max > 0 ? (next / timeRangeRef.current.max) * 100 : 0;
            progressBarRef.current.style.width = `${progress}%`;
        }
        if (progressTextRef.current) {
            progressTextRef.current.textContent = formatElapsed(next);
        }

        updateDashboardDOM(next);

        // 降频告警检测 -> 优化为时间切片告警检测，每帧只算 1/60 的数据！消灭性能尖刺！
        alertFrameCounter.current++;
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
            const currentLayers = deck.props.layers || [];
            const updatedLayers = currentLayers.map((layer: any) => {
                if (layer?.id === 'uav-active-tail-layer') {
                    return layer.clone({
                        currentTime: currentTimeRef.current
                    });
                }
                if (layer?.id === 'selected-uav-layer') {
                    return layer.clone({
                        updateTriggers: { getPosition: currentTimeRef.current }
                    });
                }
                if (layer?.id === 'uav-model-layer' || layer?.id === 'uav-point-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, currentTimeRef.current, timeRangeRef.current.max);
                    const isModel = layer.id === 'uav-model-layer';
                    return layer.clone(isModel ? {
                        data: { length: activeUAVCount },
                        updateTriggers: { getPosition: currentTimeRef.current, getOrientation: currentTimeRef.current }
                    } : {
                        data: {
                            length: activeUAVCount,
                            attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
                        },
                        updateTriggers: { getPosition: currentTimeRef.current }
                    });
                }
                return layer;
            });
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

