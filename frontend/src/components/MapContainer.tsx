import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { Map as MapGL, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { INITIAL_VIEW_STATE, CITY_COORDS } from '../constants/map';
import { useCityData } from '../hooks/useCityData';
import { useUAVAnimation } from '../hooks/useUAVAnimation';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { useMapLayers } from '../hooks/useMapLayers';
import { useWindSpeed } from '../contexts/WindSpeedContext';
import { useAlerts } from './AlertNotificationProvider';
import PlaybackControls from './PlaybackControls';
import HoverTooltip from './HoverTooltip';
import FlightDetailPanel from './FlightDetailPanel';
import WeatherOverlay from './WeatherOverlay';
// 【性能优化】ECharts 延迟加载：统计面板默认隐藏，ECharts ~800KB 不再阻塞首屏
const AnalyticsPanel = lazy(() => import('./AnalyticsPanel'));
// 【性能优化】TaskManagementPanel ~30KB 最大组件，默认隐藏，延迟加载减少首屏 bundle
const TaskManagementPanel = lazy(() => import('./TaskManagementPanel'));
import DashboardOverlay from './DashboardOverlay';
import RoiSandboxCard from './RoiSandboxCard';
import { binarySearchTimestamp } from '../utils/physics';
import { StepProgress } from '../features/LoadingProgress/StepProgress';
import { ErrorAlert } from './ErrorAlert';
import { ErrorBoundary } from './ErrorBoundary';
import { MapSkeleton } from './MapSkeleton';

export default function MapContainer() {
    const {
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
        loadCityData,
        setTrajectories,
        clearError
    } = useCityData();

    const [selectedFlight, setSelectedFlight] = useState<any>(null);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [isTasksOpen, setIsTasksOpen] = useState(false);
    const [toastState, setToastState] = useState<{ msg: string, type: 'info' | 'success' | 'error' | 'loading' } | null>(null);

    // Sandbox states
    const [isSandboxMode, setIsSandboxMode] = useState(false);
    const [sandboxCenters, setSandboxCenters] = useState<{lat: number, lon: number}[]>([]);
    const [sandboxRadius, setSandboxRadius] = useState(3000);
    const [roiDatas, setRoiDatas] = useState<any[]>([]);
    const [sandboxCompareMode, setSandboxCompareMode] = useState(false);
    
    // 雷达图层动画状态
    const [radarSweepActive, setRadarSweepActive] = useState(false);
    const [radarSweepRadius, setRadarSweepRadius] = useState(0);

    const [roiLoading, setRoiLoading] = useState(false);
    const [roiError, setRoiError] = useState<string | null>(null);

    const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' | 'loading' = 'info') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), type === 'error' ? 5000 : 3000);
    }, []);

    // 两点选取状态：点击第一个 demand POI 选起点，点击第二个自动生成轨迹
    const pickedFromRef = useRef<{ lat: number; lon: number; id: string; name: string } | null>(null);
    const [pickedFromDisplay, setPickedFromDisplay] = useState<{ lat: number; lon: number; id: string; name: string } | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [hoverInfo, setHoverInfoState] = useState<any>(null);
    // ==========================================
    // 渲染闭环稳定性防护：悬停状态频率节流
    // 由于 Deck.gl 的 onHover 每移动 1px 就会触发，如果直接 setState 会导致 MapContainer
    // 这个庞然大物遭受毁灭性的重绘雪崩（DOM树震荡）。
    // 解法：利用 mutable ref 同步真实状态，只在“鼠标跨越到新无人机”的边界时刻，才调用 setState 突破防线。
    // ==========================================
    const hoverInfoRef = useRef<any>(null);
    const setHoverInfo = useCallback((info: any) => {
        // 仅在 hover 目标对象变化时才触发 re-render（而非每次鼠标移动）
        const prevId = hoverInfoRef.current?.object?.properties?.name || hoverInfoRef.current?.object?.id;
        const newId = info?.object?.properties?.name || info?.object?.id;
        if (prevId !== newId || (!info && hoverInfoRef.current)) {
            setHoverInfoState(info);
        }
        hoverInfoRef.current = info;
    }, []);
    const [currentCity, setCurrentCity] = useState("shenzhen");
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

    // 将 zoom 量化为 0.5 级阶梯，只有跨阶梯时才触发依赖 zoom 的图层重建
    const quantizedZoom = useMemo(() => Math.round((viewState.zoom || 11) * 2) / 2, [viewState.zoom]);

    const mapRef = useRef<MapRef>(null);
    const deckRef = useRef<any>(null);
    // 【新增】用于脱离 React 生命周期的独立锁机跟拍状态
    const trackingStateRef = useRef<{ isTracking: boolean, lockedFlight: any | null }>({ isTracking: false, lockedFlight: null });

    const { windSpeed } = useWindSpeed();
    const { pushAlert } = useAlerts();

    const {
        isPlaying,
        setIsPlaying,
        animationSpeed,
        setAnimationSpeed,
        progressBarRef,
        progressTextRef,
        handleProgressClick
    } = useUAVAnimation(trajectories, timeRangeRef, currentTimeRef, deckRef, energyData, poiSensitive, windSpeed, pushAlert, trackingStateRef);

    useEffect(() => {
        loadCityData("shenzhen", () => setSelectedFlight(null));
    }, [loadCityData]);

    // 基于 SSE 获取并注入执行中的实时任务轨迹
    const fetchActiveTasks = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/tasks?status=EXECUTING', {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const data = await res.json();
            if (data.ok && data.tasks) {
                setTrajectories(prev => {
                    const existingIds = new Set(prev.map((t: any) => t.id));
                    const newTrajs = [];
                    for (const task of data.tasks) {
                        if (task.trajectory_data && task.trajectory_data.id) {
                            if (!existingIds.has(task.trajectory_data.id)) {
                                const newTraj = { ...task.trajectory_data };
                                const offset = currentTimeRef.current;
                                newTraj.timestamps = newTraj.timestamps.map((t: number) => t + offset);
                                newTrajs.push(newTraj);
                            }
                        }
                    }
                    if (newTrajs.length > 0) {
                        return [...prev, ...newTrajs];
                    }
                    return prev;
                });
            }
        } catch (err) {
            console.warn('[MapContainer] 活跃任务获取失败:', err);
        }
    }, [setTrajectories, currentTimeRef]);

    // 初始拉取
    useEffect(() => { fetchActiveTasks(); }, [fetchActiveTasks]);

    // 【架构优化 P1-2】使用全局单例 SSE 连接，一个 tab 只维护一条长连接
    useSSESubscription(fetchActiveTasks);

    const handleFocusFlight = useCallback((flight: any) => {
        if (!flight || !flight.path || !flight.timestamps) return;
        
        setSelectedFlight(flight);
        // 开启硬锁定跟拍模式
        trackingStateRef.current = { isTracking: true, lockedFlight: flight };

        const t = currentTimeRef.current;
        const times = flight.timestamps;
        // 【性能优化】O(logN) 二分搜索替代 O(N) findIndex
        const index = binarySearchTimestamp(times, t);
        
        let lon, lat;
        if (index > 0 && index < times.length) {
            const t0 = times[index - 1];
            const t1 = times[index];
            const p0 = flight.path[index - 1];
            const p1 = flight.path[index];
            const ratio = (t - t0) / (t1 - t0);
            lon = p0[0] + (p1[0] - p0[0]) * ratio;
            lat = p0[1] + (p1[1] - p0[1]) * ratio;
        } else if (index === -1) {
            lon = flight.path[flight.path.length - 1][0];
            lat = flight.path[flight.path.length - 1][1];
        } else {
            lon = flight.path[0][0];
            lat = flight.path[0][1];
        }

        setViewState((prev: any) => {
            const targetZoom = Math.max(prev.zoom, 14.5);
            // 计算右偏置距：使无人机显示在屏幕中右侧，避免被左侧侧边栏遮挡
            const lngOffset = 0.05 * Math.pow(2, 13 - targetZoom);
            return {
                ...prev,
                longitude: lon - lngOffset,
                latitude: lat,
                pitch: 45,
                transitionDuration: 1000,
                transitionInterpolator: new FlyToInterpolator({ speed: 1.2 })
            };
        });
    }, [currentTimeRef]);

    const handleViewStateChange = useCallback(({ viewState: nextViewState, interactionState }: any) => {
        const { longitude, latitude, zoom, pitch, bearing } = nextViewState;
        setViewState({ longitude, latitude, zoom, pitch, bearing, maxPitch: INITIAL_VIEW_STATE.maxPitch });
        
        // 任何人为的交互拖拽操作立即解除硬锁定，退回手动视野模式
        if (interactionState?.isDragging || interactionState?.isPanning || interactionState?.isRotating) {
            trackingStateRef.current.isTracking = false;
        }
    }, []);

    const handleCityJump = useCallback((city: string) => {
        setCurrentCity(city);
        setIsDropdownOpen(false);

        if (CITY_COORDS[city]) {
            setViewState(prev => ({
                ...prev,
                longitude: CITY_COORDS[city].longitude,
                latitude: CITY_COORDS[city].latitude,
            }));
        }
        loadCityData(city, () => setSelectedFlight(null));
    }, [loadCityData]);

    const handleMapClick = useCallback((info: any) => {
        if (!isSandboxMode || !info.coordinate) return;
        const [lon, lat] = info.coordinate;
        
        setSandboxCenters(prev => {
            const next = sandboxCompareMode ? [...prev, { lat, lon }] : [{ lat, lon }];
            if (next.length > 2) return next.slice(next.length - 2); // 保持最多2个(A/B)
            return next;
        });

        // 触发刚落地的激光雷达扫描波纹
        setRadarSweepActive(true);
        setRadarSweepRadius(0);
        let currR = 0;
        const step = sandboxRadius / 45; // 约45帧内放好
        const runSweep = () => {
            currR += step * (1 + (currR / sandboxRadius) * 2); // ease-in/out
            if (currR >= sandboxRadius) {
                setRadarSweepRadius(sandboxRadius);
                setTimeout(() => setRadarSweepActive(false), 300); // 留存0.3s后消失
            } else {
                setRadarSweepRadius(currR);
                requestAnimationFrame(runSweep);
            }
        };
        requestAnimationFrame(runSweep);

        setRoiLoading(true);
        setRoiError(null);

        const token = localStorage.getItem('token');
        fetch('/api/analysis/roi', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
                city: currentCity,
                lat, lon,
                radius_m: sandboxRadius
            }),
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) {
                setRoiDatas(prev => {
                    const next = sandboxCompareMode ? [...prev, data] : [data];
                    if (next.length > 2) return next.slice(next.length - 2);
                    return next;
                });
            } else {
                setRoiError(data.error || '分析失败');
            }
        })
        .catch(e => setRoiError(`请求失败: ${e.message}`))
        .finally(() => setRoiLoading(false));
    }, [isSandboxMode, currentCity, sandboxRadius, sandboxCompareMode]);

    const handleRadiusChange = useCallback((newRadius: number) => {
        setSandboxRadius(newRadius);
        if (sandboxCenters.length > 0) {
            setRoiLoading(true);
            setRoiError(null);
            const token = localStorage.getItem('token');
            
            // 重新计算全部站点的 ROI
            Promise.all(sandboxCenters.map(center => 
                fetch('/api/analysis/roi', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify({
                        city: currentCity,
                        lat: center.lat, lon: center.lon,
                        radius_m: newRadius
                    }),
                }).then(res => res.json())
            ))
            .then(results => {
                const newDatas = results.map(r => r.ok ? r : null).filter(Boolean);
                setRoiDatas(newDatas);
                if (newDatas.length < results.length) {
                    setRoiError('部分分析失败');
                }
            })
            .catch(e => setRoiError(`请求失败: ${e.message}`))
            .finally(() => setRoiLoading(false));
        }
    }, [sandboxCenters, currentCity]);

    const handleDemandPick = useCallback((info: any) => {
        // 沙盘模式下屏蔽正常的 POI 点击
        if (isSandboxMode) return;
        
        if (!info.object) return;
        const feat = info.object;
        const coords = feat.geometry?.coordinates;
        if (!coords) return;
        const [lon, lat] = coords;
        const props = feat.properties || {};
        const picked = { lat, lon, id: String(props.poi_id || props.osm_id || ''), name: props.name || '' };

        if (!pickedFromRef.current) {
            // 第一次点击：选起点
            pickedFromRef.current = picked;
            setPickedFromDisplay(picked);
            showToast(`已选择起点：${picked.name || picked.id}，请点击另一个点作为终点`, 'info');
        } else {
            // 第二次点击：选终点，自动调用 API 生成轨迹
            const from = pickedFromRef.current;

            // 如果点击同一个点，则取消选择
            if (from.id === picked.id) {
                pickedFromRef.current = null;
                setPickedFromDisplay(null);
                showToast(`已取消选择`, 'info');
                return;
            }

            pickedFromRef.current = null;
            setPickedFromDisplay(null);

            showToast(`正在提交到 ${picked.name || picked.id} 的任务审批...`, 'loading');

            // 异步调用 tasks API 提交调度任务（状态：PENDING等待审批）
            const token = localStorage.getItem('token');
            fetch('/api/tasks', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    city: currentCity,
                    from_lat: from.lat, from_lon: from.lon, from_id: from.id,
                    to_lat: picked.lat, to_lon: picked.lon, to_id: picked.id
                }),
            })
                .then(async r => {
                    const text = await r.text();
                    try {
                        const data = JSON.parse(text);
                        return { data };
                    } catch (err) {
                        if (r.status === 504 || r.status === 502) {
                            throw new Error("后台算法服务未启动 (网关超时)，请确保运行了 python server.py");
                        }
                        throw new Error(`非预期的服务器响应 (状态码 ${r.status})`);
                    }
                })
                .then(({ data }) => {
                    if (data.ok) {
                        showToast(`🚀 任务提交成功！已进入待审批状态 (ID: ${data.task_id.substring(0,8)})`, 'success');
                    } else {
                        showToast(`提交失败：${data.error || data.message || '未知错误'}`, 'error');
                    }
                })
                .catch((e) => {
                    showToast(`请求失败：${e.message}`, 'error');
                });
        }
    }, [currentCity, setTrajectories, showToast]);

    const handleMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const style = map.getStyle();
        if (!style?.layers) return;

        for (const layer of style.layers) {
            const id = layer.id.toLowerCase();
            if (id.includes('water') && layer.type === 'fill') {
                map.setPaintProperty(layer.id, 'fill-color', '#7ab8e0');
            }
            if ((id.includes('park') || id.includes('green') || id.includes('landcover') || id.includes('landuse')) && layer.type === 'fill') {
                map.setPaintProperty(layer.id, 'fill-color', '#a3d9a5');
                map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
            }
        }
    }, []);

    // 【架构优化 P1-1】图层构建逻辑提取到独立 hook
    const { layers } = useMapLayers({
        buildingsData,
        poiDemand,
        poiSensitive,
        trajectories,
        energyData,
        quantizedZoom,
        hoverInfo,
        hoverInfoRef,
        selectedFlight,
        pickedFromDisplay,
        currentTimeRef,
        sandboxCenters,
        sandboxRadius,
        radarSweepActive,
        radarSweepRadius,
        setSelectedFlight,
        setHoverInfo,
        handleDemandPick,
    });

    const handleRetryLoad = useCallback(() => {
        if (loadingError) {
            clearError();
            loadCityData(loadingError.city, () => setSelectedFlight(null));
        }
    }, [loadingError, clearError, loadCityData]);

    return (
        <ErrorBoundary
            title="地图加载错误"
            onRetry={() => loadCityData(currentCity, () => setSelectedFlight(null))}
        >
            <div
                className="absolute inset-0 z-0"
                style={{ background: '#f0f0f0' }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <DeckGL
                    ref={deckRef}
                    initialViewState={viewState}
                    controller={{
                        doubleClickZoom: true,
                        touchRotate: true,
                        dragRotate: true,
                        scrollZoom: true,
                        dragPan: true,
                        keyboard: true
                    }}
                    layers={layers}
                    onViewStateChange={handleViewStateChange}
                    onClick={handleMapClick}
                >
                    <MapGL
                        ref={mapRef}
                        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                        reuseMaps
                        onLoad={handleMapLoad}
                        maxPitch={INITIAL_VIEW_STATE.maxPitch}
                    />
                </DeckGL>

                <DashboardOverlay 
                    onOpenAnalytics={() => setIsAnalyticsOpen(true)} 
                    onOpenTasks={() => setIsTasksOpen(true)} 
                    onToggleSandbox={() => {
                        setIsSandboxMode(prev => {
                            const newMode = !prev;
                            if (!newMode) {
                                setSandboxCenters([]);
                                setRoiDatas([]);
                            }
                            return newMode;
                        });
                    }}
                    isSandboxMode={isSandboxMode}
                    currentCity={currentCity} 
                />

                <HoverTooltip hoverInfo={hoverInfo} />

                {isSandboxMode && (
                    <RoiSandboxCard
                        data={roiDatas}
                        isLoading={roiLoading}
                        error={roiError}
                        radius={sandboxRadius}
                        isCompareMode={sandboxCompareMode}
                        onToggleCompareMode={(isCompare) => {
                            setSandboxCompareMode(isCompare);
                            if (!isCompare) {
                                // 切换回单点模式，只保留最新一个落点
                                setSandboxCenters(prev => prev.length > 1 ? [prev[prev.length - 1]] : prev);
                                setRoiDatas(prev => prev.length > 1 ? [prev[prev.length - 1]] : prev);
                            }
                        }}
                        onRadiusChange={handleRadiusChange}
                        onClose={() => {
                            setIsSandboxMode(false);
                            setSandboxCenters([]);
                            setRoiDatas([]);
                        }}
                    />
                )}

                <FlightDetailPanel
                    selectedFlight={selectedFlight}
                    energyData={energyData}
                    currentTimeRef={currentTimeRef}
                    setSelectedFlight={setSelectedFlight}
                />

                <Suspense fallback={null}>
                    {isAnalyticsOpen && (
                        <AnalyticsPanel 
                            trajectories={trajectories}
                            energyData={energyData}
                            currentTimeRef={currentTimeRef}
                            isVisible={isAnalyticsOpen}
                            onClose={() => setIsAnalyticsOpen(false)}
                        />
                    )}
                </Suspense>

                <Suspense fallback={null}>
                    {isTasksOpen && (
                        <TaskManagementPanel
                            isVisible={isTasksOpen}
                            onClose={() => setIsTasksOpen(false)}
                            activeUAVCount={trajectories.length}
                            trajectories={trajectories}
                            currentCity={currentCity}
                            onFocusFlight={handleFocusFlight}
                        />
                    )}
                </Suspense>

                {/* 骨架屏 - 在数据加载完成前显示 */}
                {isLoadingCity && (
                    <MapSkeleton loadingSteps={loadingSteps} />
                )}

                {/* 进度条 - 显示在骨架屏上方 */}
                {isLoadingCity && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
                        <StepProgress
                            steps={loadingSteps}
                            title="正在加载城市数据"
                            isLoading={isLoadingCity}
                            hideDelay={500}
                        />
                    </div>
                )}

                {loadingError && !isLoadingCity && (
                    <ErrorAlert
                        title="数据加载失败"
                        message={`加载 ${loadingError.city} 的数据时出错：${loadingError.message}`}
                        onRetry={handleRetryLoad}
                        onDismiss={clearError}
                    />
                )}

                <div className="absolute top-4 left-4 bg-white/80 backdrop-blur text-slate-700 text-xs px-3 py-1.5 rounded-lg shadow border border-slate-200 z-10 pointer-events-none">
                    💡 提示：按住 <span className="font-semibold text-cyan-600">右键</span> 或 <span className="font-semibold text-cyan-600">Ctrl+左键</span> 拖动可360°旋转/调整视角
                </div>

                {/* 毛玻璃风格的灵动胶囊提示条，不再遮挡视线 */}
                {toastState && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-4">
                        <div className="bg-slate-900/60 text-white px-6 py-2.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/10 backdrop-blur-md flex items-center space-x-3">
                            {toastState.type === 'info' && <span className="text-lg">🎯</span>}
                            {toastState.type === 'success' && <span className="text-lg drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]">✨</span>}
                            {toastState.type === 'error' && <span className="text-lg drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]">❌</span>}
                            {toastState.type === 'loading' && (
                                <span className="flex items-center justify-center w-5 h-5">
                                    <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                                </span>
                            )}
                            <span className="text-sm font-medium tracking-wide whitespace-nowrap">{toastState.msg}</span>
                        </div>
                    </div>
                )}

                <PlaybackControls
                    isPlaying={isPlaying}
                    setIsPlaying={setIsPlaying}
                    animationSpeed={animationSpeed}
                    setAnimationSpeed={setAnimationSpeed}
                    currentCity={currentCity}
                    handleCityJump={handleCityJump}
                    isDropdownOpen={isDropdownOpen}
                    setIsDropdownOpen={setIsDropdownOpen}
                    progressBarRef={progressBarRef}
                    progressTextRef={progressTextRef}
                    handleProgressClick={handleProgressClick}
                    timeRangeMax={timeRangeRef.current.max}
                />

                <WeatherOverlay />
            </div>
        </ErrorBoundary>
    );
}
