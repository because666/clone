import { useState, useCallback, useRef, useEffect } from 'react';
import type { UAVPath } from '../types/map';
import { updateActiveUAVsBuffer, formatElapsed, uavModelBuffer } from '../utils/animation';

const ANIMATION_SPEED = 0.016;

export function useUAVAnimation(
    trajectories: UAVPath[],
    timeRangeRef: React.MutableRefObject<{ min: number; max: number }>,
    currentTimeRef: React.MutableRefObject<number>,
    deckRef: React.MutableRefObject<any>
) {
    const trajectoriesRef = useRef<UAVPath[]>([]);
    useEffect(() => { trajectoriesRef.current = trajectories; }, [trajectories]);

    const [isPlaying, setIsPlaying] = useState(true);
    const [animationSpeed, setAnimationSpeed] = useState(1);
    const animFrameRef = useRef<number>(0);

    const progressBarRef = useRef<HTMLDivElement>(null);
    const progressTextRef = useRef<HTMLSpanElement>(null);
    const metricsRef = useRef<{ active: number[], cumulative: number[], maxActive: number }>({ active: [], cumulative: [], maxActive: 1 });

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

        animFrameRef.current = requestAnimationFrame(animate);
    }, [animationSpeed, updateDashboardDOM, isPlaying, timeRangeRef, currentTimeRef, deckRef]);

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
