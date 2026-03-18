/**
 * 加载进度 Hook
 * 用于管理加载状态和进度追踪
 */

import { useState, useCallback, useRef } from 'react';
import type { LoadingProgress } from '../../types/feature';
import { LoadingStage, LoadingStageLabels } from './types';

interface UseLoadingProgressReturn {
    /** 加载进度状态 */
    progress: LoadingProgress;
    /** 开始加载 */
    startLoading: () => void;
    /** 更新进度 */
    updateProgress: (progress: number, stage?: LoadingStage) => void;
    /** 完成加载 */
    completeLoading: () => void;
    /** 设置错误 */
    setError: (error: string) => void;
    /** 重置状态 */
    reset: () => void;
}

/**
 * 加载进度管理 Hook
 * @param config - 加载配置
 * @returns 加载进度状态和控制方法
 */
export function useLoadingProgress(): UseLoadingProgressReturn {
    const [progress, setProgress] = useState<LoadingProgress>({
        isLoading: false,
        progress: 0,
        stage: undefined,
        error: null
    });

    const startTimeRef = useRef<number>(0);

    /**
     * 开始加载
     */
    const startLoading = useCallback(() => {
        startTimeRef.current = Date.now();
        setProgress({
            isLoading: true,
            progress: 0,
            stage: LoadingStageLabels[LoadingStage.INITIALIZING],
            error: null
        });
    }, []);

    /**
     * 更新加载进度
     * @param value - 进度值（0-100）
     * @param stage - 加载阶段
     */
    const updateProgress = useCallback((value: number, stage?: LoadingStage) => {
        setProgress(prev => ({
            ...prev,
            progress: Math.min(100, Math.max(0, value)),
            stage: stage ? LoadingStageLabels[stage] : prev.stage
        }));
    }, []);

    /**
     * 完成加载
     */
    const completeLoading = useCallback(() => {
        setProgress({
            isLoading: false,
            progress: 100,
            stage: LoadingStageLabels[LoadingStage.COMPLETED],
            error: null
        });
    }, []);

    /**
     * 设置错误状态
     * @param errorMessage - 错误信息
     */
    const setError = useCallback((errorMessage: string) => {
        setProgress({
            isLoading: false,
            progress: 0,
            stage: LoadingStageLabels[LoadingStage.ERROR],
            error: errorMessage
        });
    }, []);

    /**
     * 重置加载状态
     */
    const reset = useCallback(() => {
        startTimeRef.current = 0;
        setProgress({
            isLoading: false,
            progress: 0,
            stage: undefined,
            error: null
        });
    }, []);

    return {
        progress,
        startLoading,
        updateProgress,
        completeLoading,
        setError,
        reset
    };
}
