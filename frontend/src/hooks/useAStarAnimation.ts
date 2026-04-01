import { useState, useEffect, useRef } from 'react';

/**
 * 驱动 A* 搜索激波动画的时间引擎
 * 返回：progressIndex（搜索进度）、isComplete（搜索完成）、completionFade（完成后的渐变进度 0→1）
 */
export function useAStarAnimation(
    exploredNodes: [number, number][] | undefined,
    isPlaying: boolean = true,
    totalDurationMs: number = 2000
): { progressIndex: number; isComplete: boolean; completionFade: number } {
    const [progressIndex, setProgressIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [completionFade, setCompletionFade] = useState(0); // 0→1 在完成后 600ms 内渐变
    const animationRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const fadeStartRef = useRef<number>(0);

    useEffect(() => {
        if (!exploredNodes || exploredNodes.length === 0 || !isPlaying) {
            setProgressIndex(exploredNodes?.length || 0);
            setIsComplete(!!(exploredNodes && exploredNodes.length > 0));
            setCompletionFade(1);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const totalNodes = exploredNodes.length;
        
        setProgressIndex(0);
        setIsComplete(false);
        setCompletionFade(0);
        startTimeRef.current = 0;
        fadeStartRef.current = 0;

        const FADE_DURATION = 600; // ms

        const animate = (time: number) => {
            if (!startTimeRef.current) startTimeRef.current = time;
            const elapsed = time - startTimeRef.current;
            
            let progress = elapsed / totalDurationMs;
            
            if (progress >= 1) {
                // 搜索阶段结束
                progress = 1;
                setProgressIndex(totalNodes);

                if (!fadeStartRef.current) {
                    fadeStartRef.current = time;
                    setIsComplete(true);
                }
                
                // 渐变阶段：completionFade 从 0 平滑过渡到 1
                const fadeElapsed = time - fadeStartRef.current;
                const fade = Math.min(1, fadeElapsed / FADE_DURATION);
                // 使用 easeOutCubic 缓动函数让过渡更丝滑
                const easedFade = 1 - Math.pow(1 - fade, 3);
                setCompletionFade(easedFade);

                if (fade < 1) {
                    animationRef.current = requestAnimationFrame(animate);
                }
            } else {
                const currentIndex = Math.floor(progress * totalNodes);
                setProgressIndex(currentIndex);
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
