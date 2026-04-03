/**
 * 【架构优化 P3-1】沙盘模式 Hook
 *
 * 从 MapContainer.tsx 中提取全部沙盘/ROI 相关状态与逻辑：
 * - 沙盘开关、对比模式
 * - 站点中心点管理
 * - 辐射半径管理
 * - 雷达扫描波动画
 * - ROI API 调用与数据管理
 * - 地图点击处理
 */

import { useState, useCallback, useRef } from 'react';
import { analyzeRoi } from '../services/api';

interface SandboxCenter {
    lat: number;
    lon: number;
}

interface RoiData {
    covered_pois: number;
    commercial_pois: number;
    avg_dist_reduction_pct: number;
    est_daily_orders: number;
    est_capex_w: number;
    est_payback_years: number;
    radius_m: number;
}

interface UseSandboxParams {
    currentCity: string;
}

export function useSandbox({ currentCity }: UseSandboxParams) {
    const [isSandboxMode, setIsSandboxMode] = useState(false);
    const [sandboxCenters, setSandboxCenters] = useState<SandboxCenter[]>([]);
    const [sandboxRadius, setSandboxRadius] = useState(3000);
    const [sandboxCompareMode, setSandboxCompareMode] = useState(false);
    const [roiDatas, setRoiDatas] = useState<RoiData[]>([]);

    // 雷达扫描波状态
    const [radarSweepActive, setRadarSweepActive] = useState(false);
    const [radarSweepRadius, setRadarSweepRadius] = useState(0);
    /**
     * 【性能优化 P2-D】雷达扫描波 ref 驱动中间帧。
     * 仅在动画首帧和末帧调用 setState；中间帧直接修改 ref 值，
     * 再通过 Deck.gl 的 updateTriggers 让图层感知变化（由主动画循环 cloneLayers 触发）。
     * 从而将 ~45 帧的 React re-render 降为 2 帧。
     */
    const radarSweepRadiusRef = useRef(0);

    // ROI API 调用状态
    const [roiLoading, setRoiLoading] = useState(false);
    const [roiError, setRoiError] = useState<string | null>(null);

    /** 沙盘模式切换 */
    const toggleSandbox = useCallback(() => {
        setIsSandboxMode(prev => !prev);
    }, []);

    /** 触发雷达扫描波动画 */
    const triggerRadarSweep = useCallback((targetRadius: number) => {
        setRadarSweepActive(true);
        setRadarSweepRadius(0);
        radarSweepRadiusRef.current = 0;
        let currR = 0;
        const step = targetRadius / 45;
        const runSweep = () => {
            currR += step * (1 + (currR / targetRadius) * 2);
            if (currR >= targetRadius) {
                radarSweepRadiusRef.current = targetRadius;
                setRadarSweepRadius(targetRadius);
                setTimeout(() => setRadarSweepActive(false), 300);
            } else {
                // 【P2-D】中间帧仅更新 ref，不调用 setState
                radarSweepRadiusRef.current = currR;
                requestAnimationFrame(runSweep);
            }
        };
        requestAnimationFrame(runSweep);
    }, []);

    /** 地图点击 → 落点 + ROI 分析 */
    const handleMapClick = useCallback((info: { coordinate?: number[] }) => {
        if (!isSandboxMode || !info.coordinate) return;
        const [lon, lat] = info.coordinate;

        setSandboxCenters(prev => {
            const next = sandboxCompareMode ? [...prev, { lat, lon }] : [{ lat, lon }];
            if (next.length > 2) return next.slice(next.length - 2);
            return next;
        });

        triggerRadarSweep(sandboxRadius);

        // 【工程化改进 S1】使用统一 API service 层
        setRoiLoading(true);
        setRoiError(null);

        analyzeRoi({ city: currentCity, lat, lon, radius_m: sandboxRadius })
            .then(resp => {
                if (resp.ok) {
                    setRoiDatas(prev => {
                        const next = sandboxCompareMode ? [...prev, resp.data as RoiData] : [resp.data as RoiData];
                        if (next.length > 2) return next.slice(next.length - 2);
                        return next;
                    });
                } else {
                    setRoiError(resp.message || '分析失败');
                }
            })
            .catch(e => setRoiError(`请求失败: ${e.message}`))
            .finally(() => setRoiLoading(false));
    }, [isSandboxMode, currentCity, sandboxRadius, sandboxCompareMode, triggerRadarSweep]);

    /** 辐射半径变更 → 重新计算全部站点的 ROI */
    const handleRadiusChange = useCallback((newRadius: number) => {
        setSandboxRadius(newRadius);
        if (sandboxCenters.length > 0) {
            setRoiLoading(true);
            setRoiError(null);

            // 【工程化改进 S1】统一 API service 层
            Promise.all(sandboxCenters.map(center =>
                analyzeRoi({ city: currentCity, lat: center.lat, lon: center.lon, radius_m: newRadius })
            ))
                .then(results => {
                    const newDatas = results
                        .filter(r => r.ok)
                        .map(r => r.data as RoiData);
                    setRoiDatas(newDatas);
                    if (newDatas.length < results.length) {
                        setRoiError('部分分析失败');
                    }
                })
                .catch(e => setRoiError(`请求失败: ${e.message}`))
                .finally(() => setRoiLoading(false));
        }
    }, [sandboxCenters, currentCity]);

    /** 关闭沙盘并重置状态 */
    const closeSandbox = useCallback(() => {
        setIsSandboxMode(false);
        setSandboxCenters([]);
        setRoiDatas([]);
    }, []);

    /** 切换对比模式，退出对比时只保留最新落点 */
    const handleToggleCompareMode = useCallback((isCompare: boolean) => {
        setSandboxCompareMode(isCompare);
        if (!isCompare) {
            setSandboxCenters(prev => prev.length > 1 ? [prev[prev.length - 1]] : prev);
            setRoiDatas(prev => prev.length > 1 ? [prev[prev.length - 1]] : prev);
        }
    }, []);

    return {
        // 状态
        isSandboxMode,
        sandboxCenters,
        sandboxRadius,
        sandboxCompareMode,
        roiDatas,
        radarSweepActive,
        radarSweepRadius,
        roiLoading,
        roiError,
        // 操作
        toggleSandbox,
        closeSandbox,
        handleToggleCompareMode,
        handleMapClick,
        handleRadiusChange,
    };
}
