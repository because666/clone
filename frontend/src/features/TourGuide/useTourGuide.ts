/**
 * 新手引导 Hook
 * 用于管理引导流程状态和控制
 */

import { useState, useCallback, useEffect } from 'react';
import type { TourStep, TourState } from './types';
import { TOUR_STORAGE_KEY, defaultTourSteps } from './types';
import { storage } from '../../utils/helpers';

interface UseTourGuideReturn {
    /** 引导状态 */
    state: TourState;
    /** 当前步骤 */
    currentStep: TourStep | null;
    /** 总步骤数 */
    totalSteps: number;
    /** 开始引导 */
    startTour: () => void;
    /** 下一步 */
    nextStep: () => void;
    /** 上一步 */
    prevStep: () => void;
    /** 跳转到指定步骤 */
    goToStep: (stepIndex: number) => void;
    /** 跳过引导 */
    skipTour: () => void;
    /** 完成引导 */
    completeTour: () => void;
    /** 重置引导 */
    resetTour: () => void;
}

interface UseTourGuideOptions {
    /** 引导步骤配置 */
    steps?: TourStep[];
    /** 引导 ID，用于区分不同的引导流程 */
    tourId?: string;
    /** 是否自动开始 */
    autoStart?: boolean;
    /** 完成回调 */
    onComplete?: () => void;
    /** 跳过回调 */
    onSkip?: () => void;
    /** 步骤变化回调 */
    onStepChange?: (stepIndex: number, step: TourStep) => void;
}

/**
 * 新手引导管理 Hook
 * @param options - 配置选项
 * @returns 引导状态和控制方法
 */
export function useTourGuide(options: UseTourGuideOptions = {}): UseTourGuideReturn {
    const {
        steps = defaultTourSteps,
        tourId = 'main_tour',
        autoStart = false,
        onComplete,
        onSkip,
        onStepChange
    } = options;

    const storageKey = `${TOUR_STORAGE_KEY}_${tourId}`;

    const [state, setState] = useState<TourState>(() => {
        const savedState = storage.get<TourState>(storageKey);
        if (savedState) {
            return savedState;
        }
        return {
            currentStep: 0,
            isActive: false,
            isCompleted: false,
            isSkipped: false
        };
    });

    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const currentStepData = state.isActive && state.currentStep < sortedSteps.length
        ? sortedSteps[state.currentStep]
        : null;

    /**
     * 保存状态到本地存储
     */
    const saveState = useCallback((newState: TourState) => {
        storage.set(storageKey, newState);
    }, [storageKey]);

    /**
     * 开始引导
     */
    const startTour = useCallback(() => {
        const newState: TourState = {
            currentStep: 0,
            isActive: true,
            isCompleted: false,
            isSkipped: false
        };
        setState(newState);
        saveState(newState);
    }, [saveState]);

    /**
     * 下一步
     */
    const nextStep = useCallback(() => {
        if (!state.isActive) return;

        const nextIndex = state.currentStep + 1;
        if (nextIndex >= sortedSteps.length) {
            completeTour();
            return;
        }

        setState(prev => {
            const newState = { ...prev, currentStep: nextIndex };
            saveState(newState);
            return newState;
        });

        if (onStepChange && nextIndex < sortedSteps.length) {
            onStepChange(nextIndex, sortedSteps[nextIndex]);
        }
    }, [state.isActive, state.currentStep, sortedSteps, saveState, onStepChange]);

    /**
     * 上一步
     */
    const prevStep = useCallback(() => {
        if (!state.isActive || state.currentStep <= 0) return;

        const prevIndex = state.currentStep - 1;
        setState(prev => {
            const newState = { ...prev, currentStep: prevIndex };
            saveState(newState);
            return newState;
        });

        if (onStepChange) {
            onStepChange(prevIndex, sortedSteps[prevIndex]);
        }
    }, [state.isActive, state.currentStep, sortedSteps, saveState, onStepChange]);

    /**
     * 跳转到指定步骤
     * @param stepIndex - 步骤索引
     */
    const goToStep = useCallback((stepIndex: number) => {
        if (stepIndex < 0 || stepIndex >= sortedSteps.length) return;

        setState(prev => {
            const newState = { ...prev, currentStep: stepIndex };
            saveState(newState);
            return newState;
        });

        if (onStepChange) {
            onStepChange(stepIndex, sortedSteps[stepIndex]);
        }
    }, [sortedSteps, saveState, onStepChange]);

    /**
     * 跳过引导
     */
    const skipTour = useCallback(() => {
        const newState: TourState = {
            ...state,
            isActive: false,
            isSkipped: true
        };
        setState(newState);
        saveState(newState);

        if (onSkip) {
            onSkip();
        }
    }, [state, saveState, onSkip]);

    /**
     * 完成引导
     */
    const completeTour = useCallback(() => {
        const newState: TourState = {
            currentStep: sortedSteps.length - 1,
            isActive: false,
            isCompleted: true,
            isSkipped: false
        };
        setState(newState);
        saveState(newState);

        if (onComplete) {
            onComplete();
        }
    }, [sortedSteps.length, saveState, onComplete]);

    /**
     * 重置引导
     */
    const resetTour = useCallback(() => {
        const newState: TourState = {
            currentStep: 0,
            isActive: false,
            isCompleted: false,
            isSkipped: false
        };
        setState(newState);
        storage.remove(storageKey);
    }, [storageKey]);

    useEffect(() => {
        if (autoStart && !state.isCompleted && !state.isSkipped && !state.isActive) {
            startTour();
        }
    }, [autoStart, state.isCompleted, state.isSkipped, state.isActive, startTour]);

    return {
        state,
        currentStep: currentStepData,
        totalSteps: sortedSteps.length,
        startTour,
        nextStep,
        prevStep,
        goToStep,
        skipTour,
        completeTour,
        resetTour
    };
}
