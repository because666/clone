import { useState, useEffect, useRef } from 'react';

/**
 * 专门用于驱动 A* 搜索激波动画的时间引擎
 * 返回当前允许渲染的最大切片索引（0到N）
 */
export function useAStarAnimation(
    exploredNodes: [number, number][] | undefined,
    isPlaying: boolean = true,
    totalDurationMs: number = 2000
) {
    const [progressIndex, setProgressIndex] = useState(0);
    const animationRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!exploredNodes || exploredNodes.length === 0 || !isPlaying) {
            setProgressIndex(exploredNodes?.length || 0);
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const totalNodes = exploredNodes.length;
        
        // 每次重新获得 exploredNodes 时重置动画
        setProgressIndex(0);
        startTimeRef.current = 0;

        const animate = (time: number) => {
            if (!startTimeRef.current) startTimeRef.current = time;
            const elapsed = time - startTimeRef.current;
            
            // 计算当前进度
            let progress = elapsed / totalDurationMs;
            if (progress >= 1) progress = 1;
            
            // 转换为当前的节点索引
            const currentIndex = Math.floor(progress * totalNodes);
            setProgressIndex(currentIndex);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [exploredNodes, isPlaying, totalDurationMs]);

    return progressIndex;
}
