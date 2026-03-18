/**
 * 城市数据加载 Hook
 * 支持分步加载进度追踪和错误处理
 */

import { useState, useCallback, useRef } from 'react';
import type { CityData, UAVPath } from '../types/map';
import type { StepItem } from '../features/LoadingProgress/StepProgress';

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
    reloadCurrentTrajectories: () => Promise<void>;
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
 * 城市数据加载 Hook
 * 提供分步加载进度追踪和错误处理功能
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

    const timeRangeRef = useRef({ min: 0, max: 0 });
    const currentTimeRef = useRef(0);
    const dataCacheRef = useRef<Map<string, CityData>>(new Map());
    const currentCityRef = useRef("shenzhen");
    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * 清除错误状态
     */
    const clearError = useCallback(() => {
        setLoadingError(null);
    }, []);

    /**
     * 加载单个数据源
     * @param url - 数据 URL
     * @param stepId - 步骤 ID
     * @param signal - AbortSignal
     */
    const fetchWithProgress = async <T,>(
        url: string,
        stepId: string,
        signal: AbortSignal
    ): Promise<T | null> => {
        setLoadingSteps(prev => updateStepStatus(prev, stepId, 'loading'));

        try {
            const response = await fetch(url, { signal });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            setLoadingSteps(prev => updateStepStatus(prev, stepId, 'completed'));
            return data;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return null;
            }
            setLoadingSteps(prev => updateStepStatus(prev, stepId, 'error'));
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
            setLoadingSteps(DEFAULT_STEPS.map(s => ({ ...s, status: 'completed' })));
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
        setLoadingSteps(DEFAULT_STEPS);

        const basePath = `/data/processed/${city}`;
        const cacheBuster = `?t=${Date.now()}`;

        try {
            const buildings = await fetchWithProgress<any>(
                `${basePath}/buildings_3d.geojson${cacheBuster}`,
                'buildings',
                signal
            );

            if (signal.aborted) return;

            const poiDemandData = await fetchWithProgress<any>(
                `${basePath}/poi_demand.geojson${cacheBuster}`,
                'poi_demand',
                signal
            );

            if (signal.aborted) return;

            const poiSensitiveData = await fetchWithProgress<any>(
                `${basePath}/poi_sensitive.geojson${cacheBuster}`,
                'poi_sensitive',
                signal
            );

            if (signal.aborted) return;

            let trajectoriesData: { trajectories: UAVPath[]; timeRange: { min: number; max: number } } | null = null;
            try {
                trajectoriesData = await fetchWithProgress<{
                    trajectories: UAVPath[];
                    timeRange: { min: number; max: number };
                }>(
                    `/data/processed/trajectories/${city}_uav_trajectories.json${cacheBuster}`,
                    'trajectories',
                    signal
                );
            } catch {
                setLoadingSteps(prev => updateStepStatus(prev, 'trajectories', 'completed'));
            }

            if (signal.aborted) return;

            let energyDataResult: any = null;
            try {
                energyDataResult = await fetchWithProgress<any>(
                    `/data/processed/${city}_energy_predictions.json${cacheBuster}`,
                    'energy',
                    signal
                );
            } catch {
                setLoadingSteps(prev => updateStepStatus(prev, 'energy', 'completed'));
            }

            if (signal.aborted) return;

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
            const errorStep = loadingSteps.find(s => s.status === 'error');

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
    }, [loadingSteps]);

    /**
     * 重新加载当前城市的轨迹数据
     */
    const reloadCurrentTrajectories = useCallback(async () => {
        const city = currentCityRef.current;
        const cacheBuster = `?t=${Date.now()}`;
        try {
            const tRes = await fetch(`/data/processed/trajectories/${city}_uav_trajectories.json${cacheBuster}`)
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
            }
        } catch (e) {
            console.error('热重载轨迹失败', e);
        }
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
