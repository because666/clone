import { useState, useCallback, useRef, useEffect } from 'react';
import type { UAVPath } from '../types/map';
import { updateActiveUAVsBuffer, formatElapsed, uavModelBuffer } from '../utils/animation';

const ANIMATION_SPEED = 0.016;
const ALERT_CHECK_INTERVAL = 60; // 每 60 帧检测一次告警（约 1 秒）

/** 禁飞缓冲半径（米） */
const NFZ_RADIUS: Record<string, number> = {
    hospital: 300, school: 300,
    clinic: 250, kindergarten: 250,
    college: 200, university: 200,
    police: 150,
};
const DEFAULT_NFZ_RADIUS = 200;

/** Haversine 两点距离（米），快速近似 */
function haversineDist(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 风速影响因子 */
function calcWindFactor(windSpeed: number): number {
    const d = windSpeed - 3;
    return 1 + 0.03 * d * d;
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
    pushAlert?: (type: 'low-battery' | 'danger-zone', flightId: string, message: string) => void
) {
    const trajectoriesRef = useRef<UAVPath[]>([]);
    useEffect(() => { trajectoriesRef.current = trajectories; }, [trajectories]);

    const [isPlaying, setIsPlaying] = useState(true);
    const [animationSpeed, setAnimationSpeed] = useState(1);
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

    // ---- 告警检测逻辑 ----
    const checkAlerts = useCallback((currentTime: number) => {
        if (!pushAlert || !energyData) return;

        const wf = calcWindFactor(windSpeed ?? 3);
        const sensitivePoints = sensitivePointsRef.current;

        for (let i = 0; i < uavModelBuffer.length; i++) {
            const uav = uavModelBuffer[i];
            if (!uav.isActive || !uav.trajectory) continue;

            const flightId = uav.trajectory.id;
            const ed = energyData[flightId];

            // ① 低电量检测
            if (ed?.battery && ed.battery.length > 0) {
                const timestamps = uav.trajectory.timestamps;
                let idx = 0;
                for (let j = 0; j < timestamps.length; j++) {
                    if (timestamps[j] >= currentTime) { idx = j; break; }
                    idx = j;
                }
                const startBat = ed.battery[0];
                const rawBat = ed.battery[idx];
                const adjustedBat = Math.max(0, startBat - (startBat - rawBat) * wf);
                if (adjustedBat < 20 && adjustedBat > 0) {
                    pushAlert(
                        'low-battery',
                        flightId,
                        `无人机 ${flightId} 电量过低 (${adjustedBat.toFixed(1)}%)，存在坠落风险，请立即介入。`
                    );
                }
            }

            // ② 危险区检测
            if (sensitivePoints.length > 0 && uav.position) {
                const [uavLon, uavLat] = uav.position;
                for (const poi of sensitivePoints) {
                    const coords = poi.geometry?.coordinates;
                    if (!coords) continue;
                    const [poiLon, poiLat] = coords;
                    const category = poi.properties?.category || '';
                    const radius = NFZ_RADIUS[category] || DEFAULT_NFZ_RADIUS;
                    const dist = haversineDist(uavLon, uavLat, poiLon, poiLat);
                    if (dist < radius) {
                        const poiName = poi.properties?.name || category;
                        pushAlert(
                            'danger-zone',
                            flightId,
                            `无人机 ${flightId} 已进入 ${poiName} 限制空域（距中心 ${Math.round(dist)}m），请立即调度绕行。`
                        );
                        break; // 一架无人机一次只报一个危险区
                    }
                }
            }
        }
    }, [energyData, windSpeed, pushAlert]);

    const animate = useCallback(() => {
        if (timeRangeRef.current.max === 0) {
            animFrameRef.current = requestAnimationFrame(animate);
            return;
        }

        let next = currentTimeRef.current;
        if (isPlaying) {
            next += ANIMATION_SPEED * animationSpeed;
            if (next > timeRangeRef.current.max) next = 0;
            currentTimeRef.current = next;
        }

        const deck = deckRef.current?.deck;
        if (deck) {
            const currentLayers = deck.props.layers;
            const updatedLayers = currentLayers.map((layer: any) => {
                if (layer?.id === 'uav-active-tail-layer') {
                    const activeTails = uavModelBuffer.filter(u => u.isActive && u.tailPath && u.tailPath.length > 1);
                    return layer.clone({
                        data: activeTails,
                        currentTime: next
                    });
                }
                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, next, timeRangeRef.current.max, uavModelBuffer);
                    return layer.clone({
                        data: uavModelBuffer.filter(u => u.isActive),
                        updateTriggers: {
                            getPosition: next,
                            getOrientation: next
                        }
                    });
                }
                return layer;
            });
            deck.setProps({ layers: updatedLayers });
        }

        if (progressBarRef.current) {
            const progress = timeRangeRef.current.max > 0 ? (next / timeRangeRef.current.max) * 100 : 0;
            progressBarRef.current.style.width = `${progress}%`;
        }
        if (progressTextRef.current) {
            progressTextRef.current.textContent = formatElapsed(next);
        }

        updateDashboardDOM(next);

        // 降频告警检测
        alertFrameCounter.current++;
        if (alertFrameCounter.current >= ALERT_CHECK_INTERVAL) {
            alertFrameCounter.current = 0;
            checkAlerts(next);
        }

        animFrameRef.current = requestAnimationFrame(animate);
    }, [animationSpeed, updateDashboardDOM, isPlaying, timeRangeRef, currentTimeRef, deckRef, checkAlerts]);

    useEffect(() => {
        if (isPlaying) {
            animFrameRef.current = requestAnimationFrame(animate);
        }
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isPlaying, animate]);

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
                    const activeTails = uavModelBuffer.filter(u => u.isActive && u.tailPath && u.tailPath.length > 1);
                    return layer.clone({
                        data: activeTails,
                        currentTime: currentTimeRef.current
                    });
                }
                if (layer?.id === 'uav-model-layer') {
                    updateActiveUAVsBuffer(trajectoriesRef.current, currentTimeRef.current, timeRangeRef.current.max, uavModelBuffer);
                    return layer.clone({
                        data: uavModelBuffer.filter(u => u.isActive),
                        updateTriggers: {
                            getPosition: currentTimeRef.current,
                            getOrientation: currentTimeRef.current
                        }
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

