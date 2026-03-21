/**
 * 城市数据加载 Hook
 * 支持分步加载进度追踪、错误处理和自动重试
 */

import { useState, useCallback, useRef } from 'react';
import type { CityData, UAVPath } from '../types/map';
import type { StepItem } from '../features/LoadingProgress/StepProgress';
import { retryWithBackoff } from '../utils/helpers';
import { LRUCache } from '../utils/cache';

export interface LoadingError {
    step: string;
    message: string;
    city: string;
}

interface UseCityDataReturn {
    buildingsData: any;
    poiDemand: any;
    poiSensitive: any;
    trajectories: UAVPath[];
    energyData: any;
    isLoadingCity: boolean;
    loadingSteps: StepItem[];
    loadingError: LoadingError | null;
    timeRangeRef: React.MutableRefObject<{ min: number; max: number }>;
    currentTimeRef: React.MutableRefObject<number>;
    currentCityRef: React.MutableRefObject<string>;
    loadCityData: (city: string, onFlightClear?: () => void) => Promise<void>;
    reloadCurrentTrajectories: () => Promise<UAVPath[]>;
    setTrajectories: React.Dispatch<React.SetStateAction<UAVPath[]>>;
    clearError: () => void;
}

const DEFAULT_STEPS: StepItem[] = [
    { id: 'buildings', label: '加载建筑数据', status: 'pending' },
    { id: 'poi_demand', label: '加载 POI 需求点', status: 'pending' },
    { id: 'poi_sensitive', label: '加载 POI 敏感点', status: 'pending' },
    { id: 'trajectories', label: '加载轨迹数据', status: 'pending' },
    { id: 'energy', label: '加载能耗数据', status: 'pending' }
];

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const MAX_CONCURRENT = 10; // 极大提升并发数，发挥 HTTP/2 多路复用性能

/**
 * 数据任务返回类型
 */
interface DataTaskResult {
    type: 'buildings' | 'poi_demand' | 'poi_sensitive' | 'trajectories' | 'energy';
    data: any;
    error?: unknown;
}

/**
 * 更新步骤状态
 * @param steps - 当前步骤列表
 * @param stepId - 要更新的步骤 ID
 * @param status - 新状态
 */
const updateStepStatus = (
    steps: StepItem[],
    stepId: string,
    status: StepItem['status']
): StepItem[] => {
    return steps.map(step =>
        step.id === stepId ? { ...step, status } : step
    );
};

/**
 * 并发控制函数
 * @param tasks - 任务列表
 * @param maxConcurrent - 最大并发数
 * @returns 所有任务的结果
 */
async function runWithConcurrency(
    tasks: Array<() => Promise<DataTaskResult>>,
    maxConcurrent: number
): Promise<DataTaskResult[]> {
    const results: DataTaskResult[] = new Array(tasks.length);
    const executing: Set<Promise<void>> = new Set();

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const promise = (async () => {
            const result = await task();
            results[i] = result;
        })();

        executing.add(promise);
        promise.then(() => executing.delete(promise));

        if (executing.size >= maxConcurrent) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);
    return results;
}

/**
 * 城市数据加载 Hook
 * 提供分步加载进度追踪、错误处理和自动重试功能
 */
export function useCityData(): UseCityDataReturn {
    const [buildingsData, setBuildingsData] = useState<any>(null);
    const [poiDemand, setPoiDemand] = useState<any>(null);
    const [poiSensitive, setPoiSensitive] = useState<any>(null);
    const [trajectories, setTrajectories] = useState<UAVPath[]>([]);
    const [energyData, setEnergyData] = useState<any>(null);
    const [isLoadingCity, setIsLoadingCity] = useState(false);
    const [loadingSteps, setLoadingSteps] = useState<StepItem[]>(DEFAULT_STEPS);
    const [loadingError, setLoadingError] = useState<LoadingError | null>(null);

    // 使用 ref 存储当前步骤状态，避免依赖循环
    const loadingStepsRef = useRef<StepItem[]>(DEFAULT_STEPS);

    const timeRangeRef = useRef({ min: 0, max: 0 });
    const currentTimeRef = useRef(0);
    // 使用 LRU 缓存替代普通 Map，最大缓存 5 个城市
    const dataCacheRef = useRef<LRUCache<CityData>>(new LRUCache<CityData>({ maxSize: 5 }));
    const currentCityRef = useRef("shenzhen");
    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * 更新步骤状态（同步更新 ref 和 state）
     */
    const updateSteps = useCallback((stepId: string, status: StepItem['status']) => {
        loadingStepsRef.current = updateStepStatus(loadingStepsRef.current, stepId, status);
        setLoadingSteps(loadingStepsRef.current);
    }, []);

    /**
     * 清除错误状态
     */
    const clearError = useCallback(() => {
        setLoadingError(null);
    }, []);

    /**
     * 带重试机制的异步数据获取
     * @param url - 数据 URL
     * @param stepId - 步骤 ID
     * @param signal - AbortSignal
     * @param maxRetries - 最大重试次数
     * @param baseDelay - 基础延迟毫秒数
     */
    const fetchWithRetry = async <T,>(
        url: string,
        stepId: string,
        signal: AbortSignal,
        maxRetries: number = MAX_RETRIES,
        baseDelay: number = BASE_DELAY
    ): Promise<T | null> => {
        updateSteps(stepId, 'loading');

        try {
            const data = await retryWithBackoff(async () => {
                if (signal.aborted) {
                    throw new DOMException('请求已取消', 'AbortError');
                }

                const response = await fetch(url, { signal });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response.json() as Promise<T>;
            }, maxRetries, baseDelay);

            updateSteps(stepId, 'completed');
            return data;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return null;
            }

            updateSteps(stepId, 'error');
            throw error;
        }
    };

    /**
     * 加载城市数据
     * @param city - 城市名称
     * @param onFlightClear - 清除飞行选择的回调
     */
    const loadCityData = useCallback(async (city: string, onFlightClear?: () => void) => {
        currentCityRef.current = city;

        const cached = dataCacheRef.current.get(city);
        if (cached) {
            setBuildingsData(cached.buildings);
            setPoiDemand(cached.poiDemand);
            setPoiSensitive(cached.poiSensitive);
            setTrajectories(cached.trajectories);
            setEnergyData(cached.energyData);
            timeRangeRef.current = cached.timeRange;
            currentTimeRef.current = 0;
            loadingStepsRef.current = DEFAULT_STEPS.map(s => ({ ...s, status: 'completed' }));
            setLoadingSteps(loadingStepsRef.current);
            setLoadingError(null);
            if (onFlightClear) onFlightClear();
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        setIsLoadingCity(true);
        setLoadingError(null);
        loadingStepsRef.current = [...DEFAULT_STEPS];
        setLoadingSteps(loadingStepsRef.current);

        const basePath = `/data/processed/${city}`;

        try {
            // 定义所有数据加载任务
            const dataTasks = [
                // 任务 1: 建筑数据
                async () => {
                    try {
                        const data = await fetchWithRetry<any>(
                            `${basePath}/buildings_3d.geojson`,
                            'buildings',
                            signal
                        );
                        return { type: 'buildings' as const, data };
                    } catch (error) {
                        if ((error as Error).name === 'AbortError') throw error;
                        return { type: 'buildings' as const, data: null, error };
                    }
                },
                // 任务 2: POI 需求点
                async () => {
                    try {
                        const data = await fetchWithRetry<any>(
                            `${basePath}/poi_demand.geojson`,
                            'poi_demand',
                            signal
                        );
                        return { type: 'poi_demand' as const, data };
                    } catch (error) {
                        if ((error as Error).name === 'AbortError') throw error;
                        return { type: 'poi_demand' as const, data: null, error };
                    }
                },
                // 任务 3: POI 敏感点
                async () => {
                    try {
                        const data = await fetchWithRetry<any>(
                            `${basePath}/poi_sensitive.geojson`,
                            'poi_sensitive',
                            signal
                        );
                        return { type: 'poi_sensitive' as const, data };
                    } catch (error) {
                        if ((error as Error).name === 'AbortError') throw error;
                        return { type: 'poi_sensitive' as const, data: null, error };
                    }
                },
                // 任务 4: 轨迹数据（可选）
                async () => {
                    try {
                        const data = await fetchWithRetry<{
                            trajectories: UAVPath[];
                            timeRange: { min: number; max: number };
                        }>(
                            `/data/processed/trajectories/${city}_uav_trajectories.json`,
                            'trajectories',
                            signal
                        );
                        return { type: 'trajectories' as const, data };
                    } catch {
                        updateSteps('trajectories', 'completed');
                        return { type: 'trajectories' as const, data: null };
                    }
                },
                // 任务 5: 能耗数据（可选）
                async () => {
                    try {
                        const data = await fetchWithRetry<any>(
                            `/data/processed/${city}_energy_predictions.json`,
                            'energy',
                            signal
                        );
                        return { type: 'energy' as const, data };
                    } catch {
                        updateSteps('energy', 'completed');
                        return { type: 'energy' as const, data: null };
                    }
                }
            ];

            // 使用并发控制并行加载所有数据
            const results = await runWithConcurrency(dataTasks, MAX_CONCURRENT);

            if (signal.aborted) return;

            // 检查是否有错误
            const errors = results.filter(r => 'error' in r && r.error);
            if (errors.length > 0) {
                const firstError = errors[0];
                throw firstError.error;
            }

            // 提取数据
            const buildings = results.find(r => r.type === 'buildings')?.data;
            const poiDemandData = results.find(r => r.type === 'poi_demand')?.data;
            const poiSensitiveData = results.find(r => r.type === 'poi_sensitive')?.data;
            const trajectoriesData = results.find(r => r.type === 'trajectories')?.data;
            const energyDataResult = results.find(r => r.type === 'energy')?.data;

            const cityTrajectories = trajectoriesData?.trajectories || [];
            const cityTimeRange = trajectoriesData?.timeRange || { min: 0, max: 0 };

            const cityData: CityData = {
                buildings,
                poiDemand: poiDemandData,
                poiSensitive: poiSensitiveData,
                trajectories: cityTrajectories,
                energyData: energyDataResult,
                timeRange: cityTimeRange
            };

            dataCacheRef.current.set(city, cityData);

            setBuildingsData(cityData.buildings);
            setPoiDemand(cityData.poiDemand);
            setPoiSensitive(cityData.poiSensitive);
            setTrajectories(cityData.trajectories);
            setEnergyData(cityData.energyData);
            timeRangeRef.current = cityData.timeRange;
            currentTimeRef.current = 0;

            if (onFlightClear) onFlightClear();
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return;
            }

            const errorMessage = error instanceof Error ? error.message : '未知错误';
            const errorStep = loadingStepsRef.current.find(s => s.status === 'error');

            setLoadingError({
                step: errorStep?.id || 'unknown',
                message: errorMessage,
                city
            });

            console.error(`加载城市 ${city} 数据失败:`, error);
            setTrajectories([]);
            timeRangeRef.current = { min: 0, max: 0 };
        } finally {
            setIsLoadingCity(false);
            abortControllerRef.current = null;
        }
    }, [updateSteps]); // 只依赖 updateSteps，它是稳定的

    /**
     * 重新加载当前城市的轨迹数据
     */
    const reloadCurrentTrajectories = useCallback(async (): Promise<UAVPath[]> => {
        const city = currentCityRef.current;
        try {
            const tRes = await fetch(`/data/processed/trajectories/${city}_uav_trajectories.json`)
                .then(r => r.ok ? r.json() : null).catch(() => null);
            if (tRes) {
                const newTrajs = tRes.trajectories || [];
                setTrajectories(newTrajs);
                timeRangeRef.current = tRes.timeRange || { min: 0, max: 0 };
                currentTimeRef.current = 0;
                const cached = dataCacheRef.current.get(city);
                if (cached) {
                    cached.trajectories = newTrajs;
                    cached.timeRange = tRes.timeRange || { min: 0, max: 0 };
                }
                return newTrajs;
            }
        } catch (e) {
            console.error('热重载轨迹失败', e);
        }
        return [];
    }, []);

    return {
        buildingsData,
        poiDemand,
        poiSensitive,
        trajectories,
        energyData,
        isLoadingCity,
        loadingSteps,
        loadingError,
        timeRangeRef,
        currentTimeRef,
        currentCityRef,
        loadCityData,
        reloadCurrentTrajectories,
        setTrajectories,
        clearError
    };
}
