/**
 * 加载进度模块类型定义
 */

import type { LoadingProgress, LoadingProgressConfig } from '../../types/feature';

export type { LoadingProgress, LoadingProgressConfig };

/**
 * 加载进度阶段常量
 */
export const LoadingStage = {
    /** 初始化 */
    INITIALIZING: 'initializing',
    /** 加载建筑数据 */
    LOADING_BUILDINGS: 'loading_buildings',
    /** 加载 POI 数据 */
    LOADING_POI: 'loading_poi',
    /** 加载轨迹数据 */
    LOADING_TRAJECTORIES: 'loading_trajectories',
    /** 加载能耗数据 */
    LOADING_ENERGY: 'loading_energy',
    /** 渲染场景 */
    RENDERING: 'rendering',
    /** 完成 */
    COMPLETED: 'completed',
    /** 错误 */
    ERROR: 'error'
} as const;

export type LoadingStageType = typeof LoadingStage[keyof typeof LoadingStage];

/**
 * 加载阶段描述映射
 */
export const LoadingStageLabels: Record<string, string> = {
    [LoadingStage.INITIALIZING]: '正在初始化...',
    [LoadingStage.LOADING_BUILDINGS]: '正在加载建筑数据...',
    [LoadingStage.LOADING_POI]: '正在加载 POI 数据...',
    [LoadingStage.LOADING_TRAJECTORIES]: '正在加载轨迹数据...',
    [LoadingStage.LOADING_ENERGY]: '正在加载能耗数据...',
    [LoadingStage.RENDERING]: '正在渲染场景...',
    [LoadingStage.COMPLETED]: '加载完成',
    [LoadingStage.ERROR]: '加载失败'
};
