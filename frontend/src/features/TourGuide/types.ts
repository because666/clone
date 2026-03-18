/**
 * 新手引导模块类型定义
 */

import type { TourStep, TourConfig } from '../../types/feature';

export type { TourStep, TourConfig };

/**
 * 引导状态
 */
export interface TourState {
    /** 当前步骤索引 */
    currentStep: number;
    /** 是否正在进行引导 */
    isActive: boolean;
    /** 是否已完成引导 */
    isCompleted: boolean;
    /** 是否被跳过 */
    isSkipped: boolean;
}

/**
 * 引导存储键名
 */
export const TOUR_STORAGE_KEY = 'aetherweave_tour_state';

/**
 * 预定义引导步骤 ID
 */
export enum TourStepId {
    /** 欢迎介绍 */
    WELCOME = 'welcome',
    /** 地图控制 */
    MAP_CONTROLS = 'map_controls',
    /** 城市切换 */
    CITY_SWITCH = 'city_switch',
    /** 播放控制 */
    PLAYBACK_CONTROLS = 'playback_controls',
    /** 轨迹详情 */
    FLIGHT_DETAILS = 'flight_details',
    /** 算法实验室 */
    ALGO_LAB = 'algo_lab',
    /** 完成 */
    COMPLETED = 'completed'
}

/**
 * 默认引导步骤配置
 */
export const defaultTourSteps: TourStep[] = [
    {
        id: TourStepId.WELCOME,
        title: '欢迎使用 AetherWeave',
        content: '这是一个无人机轨迹可视化平台，让我们快速了解一下主要功能。',
        order: 1,
        placement: 'center',
        disableOverlay: false
    },
    {
        id: TourStepId.MAP_CONTROLS,
        title: '地图控制',
        content: '使用鼠标左键拖拽移动地图，滚轮缩放，右键拖拽旋转视角。',
        target: '.map-container',
        order: 2,
        placement: 'right'
    },
    {
        id: TourStepId.CITY_SWITCH,
        title: '城市切换',
        content: '点击左上角的城市选择器，可以切换不同的城市数据。',
        target: '.city-selector',
        order: 3,
        placement: 'right'
    },
    {
        id: TourStepId.PLAYBACK_CONTROLS,
        title: '播放控制',
        content: '使用底部控制栏可以播放、暂停、调整速度，以及跳转到指定时间点。',
        target: '.playback-controls',
        order: 4,
        placement: 'top'
    },
    {
        id: TourStepId.FLIGHT_DETAILS,
        title: '轨迹详情',
        content: '点击无人机轨迹可以查看详细的飞行信息，包括位置、速度、能耗等数据。',
        target: '.flight-detail-panel',
        order: 5,
        placement: 'left'
    },
    {
        id: TourStepId.ALGO_LAB,
        title: '算法实验室',
        content: '打开算法实验室，可以自定义轨迹生成参数，进行轨迹规划实验。',
        target: '.algo-lab-trigger',
        order: 6,
        placement: 'left'
    },
    {
        id: TourStepId.COMPLETED,
        title: '引导完成',
        content: '您已完成新手引导，开始探索吧！如需再次查看，可在设置中重新启动引导。',
        order: 7,
        placement: 'center'
    }
];
