import { useState, useEffect, useRef } from 'react';

/**
 * 驱动 A* 搜索激波动画的时间引擎
 * 返回：progressIndex（搜索进度）、isComplete（搜索完成）、completionFade（完成后的渐变进度 0→1）
 * 
 * 【性能优化 R2-7】使用 ref 存储帧进度，降频触发 setState，
 * 从 60fps 的 React reconciliation 降至 ~30fps，减半组件重渲染
 */
export function useAStarAnimation(
    exploredNodes: [number, number][] | undefined,
    isPlaying: boolean = true,
    totalDurationMs: number = 2000
): { progressIndex: number; isComplete: boolean; completionFade: number } {
    const [progressIndex, setProgressIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [completionFade, setCompletionFade] = useState(0);
    const animationRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const fadeStartRef = useRef<number>(0);
    // R2-7: 上次提交到 React 的进度值，用于判断变化幅度
    const lastCommittedIndex = useRef<number>(0);

    useEffect(() => {
        if (!exploredNodes || exploredNodes.length === 0 || !isPlaying) {
            setProgressIndex(exploredNodes?.length || 0);
            setIsComplete(!!(exploredNodes && exploredNodes.length > 0));
            setCompletionFade(1);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const totalNodes = exploredNodes.length;
        // R2-7: 只有进度变化超过此阈值才触发 setState（约等于每 ~33ms 更新一次）
        const updateThreshold = Math.max(1, Math.floor(totalNodes / 60));
        
        setProgressIndex(0);
        setIsComplete(false);
        setCompletionFade(0);
        startTimeRef.current = 0;
        fadeStartRef.current = 0;
        lastCommittedIndex.current = 0;

        const FADE_DURATION = 600; // ms

        const animate = (time: number) => {
            if (!startTimeRef.current) startTimeRef.current = time;
            const elapsed = time - startTimeRef.current;
            
            let progress = elapsed / totalDurationMs;
            
            if (progress >= 1) {
                progress = 1;
                setProgressIndex(totalNodes);

                if (!fadeStartRef.current) {
                    fadeStartRef.current = time;
                    setIsComplete(true);
                }
                
                const fadeElapsed = time - fadeStartRef.current;
                const fade = Math.min(1, fadeElapsed / FADE_DURATION);
                const easedFade = 1 - Math.pow(1 - fade, 3);
                setCompletionFade(easedFade);

                if (fade < 1) {
                    animationRef.current = requestAnimationFrame(animate);
                }
            } else {
                const currentIndex = Math.floor(progress * totalNodes);
                // R2-7: 只在变化幅度足够大时才更新 React state
                if (currentIndex - lastCommittedIndex.current >= updateThreshold) {
                    lastCommittedIndex.current = currentIndex;
                    setProgressIndex(currentIndex);
                }
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [exploredNodes, isPlaying, totalDurationMs]);

    return { progressIndex, isComplete, completionFade };
}
