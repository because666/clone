import { useState, useCallback, useRef } from 'react';
import type { CityData, UAVPath } from '../types/map';

export function useCityData() {
    const [buildingsData, setBuildingsData] = useState<any>(null);
    const [poiDemand, setPoiDemand] = useState<any>(null);
    const [poiSensitive, setPoiSensitive] = useState<any>(null);
    const [trajectories, setTrajectories] = useState<UAVPath[]>([]);
    const [energyData, setEnergyData] = useState<any>(null);
    const [isLoadingCity, setIsLoadingCity] = useState(false);

    const timeRangeRef = useRef({ min: 0, max: 0 });
    const currentTimeRef = useRef(0);
    const dataCacheRef = useRef<Map<string, CityData>>(new Map());
    const currentCityRef = useRef("shenzhen");

    const loadCityData = useCallback(async (city: string, onFlightClear?: () => void) => {
        const cached = dataCacheRef.current.get(city);
        if (cached) {
            setBuildingsData(cached.buildings);
            setPoiDemand(cached.poiDemand);
            setPoiSensitive(cached.poiSensitive);
            setTrajectories(cached.trajectories);
            setEnergyData(cached.energyData);
            timeRangeRef.current = cached.timeRange;
            currentTimeRef.current = 0;
            if (onFlightClear) onFlightClear();
            return;
        }

        setIsLoadingCity(true);
        const basePath = `/data/processed/${city}`;
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const [bRes, pDRes, pSRes, tRes, eRes] = await Promise.all([
                fetch(`${basePath}/buildings_3d.geojson${cacheBuster}`).then(r => r.ok ? r.json() : null),
                fetch(`${basePath}/poi_demand.geojson${cacheBuster}`).then(r => r.ok ? r.json() : null),
                fetch(`${basePath}/poi_sensitive.geojson${cacheBuster}`).then(r => r.ok ? r.json() : null),
                fetch(`/data/processed/trajectories/${city}_uav_trajectories.json${cacheBuster}`).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`/data/processed/${city}_energy_predictions.json${cacheBuster}`).then(r => r.ok ? r.json() : null).catch(() => null)
            ]);

            const cityTrajectories = tRes?.trajectories || [];
            const cityTimeRange = tRes?.timeRange || { min: 0, max: 0 };

            const cityData: CityData = {
                buildings: bRes,
                poiDemand: pDRes,
                poiSensitive: pSRes,
                trajectories: cityTrajectories,
                energyData: eRes,
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
        } catch (e) {
            console.error(`加载城市 ${city} 数据失败`, e);
            setTrajectories([]);
            timeRangeRef.current = { min: 0, max: 0 };
        } finally {
            setIsLoadingCity(false);
        }
    }, []);

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
        timeRangeRef,
        currentTimeRef,
        currentCityRef,
        loadCityData,
        reloadCurrentTrajectories,
        setTrajectories
    };
}
