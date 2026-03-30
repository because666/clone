import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from 'react';
import { precompileTrajectories } from '../hooks/useCityData';
import { fetchTasks as fetchTasksApi } from '../services/api';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { Map as MapGL, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { INITIAL_VIEW_STATE, CITY_COORDS } from '../constants/map';
import { useCityData } from '../hooks/useCityData';
import type { UAVPath } from '../types/map';
import { useUAVAnimation } from '../hooks/useUAVAnimation';
import { useSSESubscription } from '../hooks/useSSESubscription';
import { useMapLayers } from '../hooks/useMapLayers';
import type { VisionMode } from './VisionModeDock';
import { useSandbox } from '../hooks/useSandbox';
import { useFlightPicking } from '../hooks/useFlightPicking';
import { useEnvironment } from '../contexts/EnvironmentContext';
import { useAlerts } from './AlertNotificationProvider';
import PlaybackControls from './PlaybackControls';
import HoverTooltip from './HoverTooltip';
import FlightDetailPanel from './FlightDetailPanel';
import WeatherOverlay from './WeatherOverlay';
import AiPreflightModal from './AiPreflightModal';
import AiMascot from './AiMascot';
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
    const [visionMode, setVisionMode] = useState<VisionMode>('default');
    const [toastState, setToastState] = useState<{ msg: string, type: 'info' | 'success' | 'error' | 'loading' } | null>(null);

    const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' | 'loading' = 'info') => {
        setToastState({ msg, type });
        setTimeout(() => setToastState(null), type === 'error' ? 5000 : 3000);
    }, []);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [currentCity, setCurrentCity] = useState("shenzhen");
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    // 【架构优化 P3-1】沙盘逻辑提取到独立 Hook
    const {
        isSandboxMode, sandboxCenters, sandboxRadius, sandboxCompareMode,
        roiDatas, radarSweepActive, radarSweepRadius, roiLoading, roiError,
        toggleSandbox, closeSandbox, handleToggleCompareMode,
        handleMapClick, handleRadiusChange,
    } = useSandbox({ currentCity });

    // 【架构优化 P3-2】航线选点逻辑提取到独立 Hook
    const { pickedFromDisplay, handleDemandPick, pendingAiTask, confirmCreateTask, cancelPendingTask } = useFlightPicking({
        currentCity, isSandboxMode, showToast
    });

    const [hoverInfo, setHoverInfoState] = useState<Record<string, any> | null>(null);
    // ==========================================
    // 渲染闭环稳定性防护：悬停状态频率节流
    // 由于 Deck.gl 的 onHover 每移动 1px 就会触发，如果直接 setState 会导致 MapContainer
    // 这个庞然大物遭受毁灭性的重绘雪崩（DOM树震荡）。
    // 解法：利用 mutable ref 同步真实状态，只在“鼠标跨越到新无人机”的边界时刻，才调用 setState 突破防线。
    // ==========================================
    const hoverInfoRef = useRef<Record<string, any> | null>(null);
    const setHoverInfo = useCallback((info: Record<string, any> | null) => {
        // 仅在 hover 目标对象变化时才触发 re-render（而非每次鼠标移动）
        const prevId = hoverInfoRef.current?.object?.properties?.name || hoverInfoRef.current?.object?.id;
        const newId = info?.object?.properties?.name || info?.object?.id;
        if (prevId !== newId || (!info && hoverInfoRef.current)) {
            setHoverInfoState(info);
        }
        hoverInfoRef.current = info;
    }, []);
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

    // 阻断渲染雪崩，将向下传递的事件处理全部用 useCallback 包装
    const handleOpenAnalytics = useCallback(() => setIsAnalyticsOpen(true), []);
    const handleOpenTasks = useCallback(() => setIsTasksOpen(true), []);
    const handleToggleRightPanel = useCallback(() => setIsRightPanelOpen(prev => !prev), []);
    const handleToggleSandbox = useCallback(() => {
        if (isSandboxMode) closeSandbox();
        else toggleSandbox();
    }, [isSandboxMode, closeSandbox, toggleSandbox]);

    const handleCloseAnalytics = useCallback(() => setIsAnalyticsOpen(false), []);
    const handleCloseTasks = useCallback(() => setIsTasksOpen(false), []);
    const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);


    // 将 zoom 量化为 0.5 级阶梯，只有跨阶梯时才触发依赖 zoom 的图层重建
    const quantizedZoom = useMemo(() => Math.round((viewState.zoom || 11) * 2) / 2, [viewState.zoom]);

    const mapRef = useRef<MapRef>(null);
    const deckRef = useRef<any>(null);
    // 【工程化改进 S2】消除 any，明确跟拍状态类型
    const trackingStateRef = useRef<{ isTracking: boolean, lockedFlight: UAVPath | null }>({ isTracking: false, lockedFlight: null });

    const { windSpeed } = useEnvironment();
    const { pushAlert } = useAlerts();

    const {
        isPlaying,
        setIsPlaying,
        animationSpeed,
        setAnimationSpeed,
    } = useUAVAnimation(trajectories, timeRangeRef, currentTimeRef, deckRef, energyData, poiSensitive, windSpeed, pushAlert, trackingStateRef);

    useEffect(() => {
        loadCityData("shenzhen", () => setSelectedFlight(null));
    }, [loadCityData]);

    // 基于 SSE 获取并注入执行中的实时任务轨迹
    const fetchActiveTasks = useCallback(async () => {
        try {
            // 【工程化改进 S1】统一 API 调用层，消除裸 fetch + 手动 token
            const tasks = await fetchTasksApi('EXECUTING');
            setTrajectories(prev => {
                const existingIds = new Set(prev.map((t: any) => t.id));
                // 【性能优化 P4-A】建立活跃 ID 索引，用于剔除无效僵尸航班
                const activeIds = new Set(tasks.map((t: any) => t.trajectory_data?.id).filter(Boolean));
                const newTrajs: any[] = [];
                for (const task of tasks) {
                    if (task.trajectory_data && task.trajectory_data.id) {
                        if (!existingIds.has(task.trajectory_data.id)) {
                            const newTraj = { ...task.trajectory_data };
                            const offset = currentTimeRef.current;
                            newTraj.timestamps = newTraj.timestamps.map((t: number) => t + offset);
                            newTrajs.push(newTraj);
                        }
                    }
                }

                // 【性能优化 P4-B】精准垃圾回收：剔除后端已完成的任务（失去连接状态），防止系统随时间运行产生内存溢出与渲染泄露
                const aliveTrajs = prev.filter((t: any) => activeIds.has(t.id));

                if (newTrajs.length > 0 || aliveTrajs.length !== prev.length) {
                    // 【性能优化 P2-B】对 SSE 注入的新轨迹执行 SoA 预编译，
                    // 确保动画循环中走 Float32Array 快路径而非 AoS 慢路径
                    if (newTrajs.length > 0) precompileTrajectories(newTrajs);
                    return [...aliveTrajs, ...newTrajs];
                }
                return prev;
            });
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
        visionMode,
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
            onRetry={handleRetryLoad}
        >
            <div
                className={`absolute inset-0 z-0 bg-[#f0f0f0] ${visionMode !== 'default' ? 'map-filter-active' : ''}`}
                onContextMenu={handleContextMenu}
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
                    onOpenAnalytics={handleOpenAnalytics}
                    onOpenTasks={handleOpenTasks}
                    onToggleSandbox={handleToggleSandbox}
                    isSandboxMode={isSandboxMode}
                    currentCity={currentCity}
                    isRightPanelOpen={isRightPanelOpen}
                    onToggleRightPanel={handleToggleRightPanel}
                />

                <HoverTooltip hoverInfo={hoverInfo} />

                {isSandboxMode && (
                    <RoiSandboxCard
                        data={roiDatas}
                        isLoading={roiLoading}
                        error={roiError}
                        radius={sandboxRadius}
                        isCompareMode={sandboxCompareMode}
                        isRightPanelOpen={isRightPanelOpen}
                        onToggleCompareMode={handleToggleCompareMode}
                        onRadiusChange={handleRadiusChange}
                        onClose={closeSandbox}
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
                            onClose={handleCloseAnalytics}
                        />
                    )}
                </Suspense>

                <Suspense fallback={null}>
                    {isTasksOpen && (
                        <TaskManagementPanel
                            isVisible={isTasksOpen}
                            onClose={handleCloseTasks}
                            activeUAVCount={trajectories.length}
                            trajectories={trajectories}
                            currentCity={currentCity}
                            onFocusFlight={handleFocusFlight}
                        />
                    )}
                </Suspense>

                <AiPreflightModal
                    isOpen={!!pendingAiTask}
                    fromPoint={pendingAiTask?.fromPoint || null}
                    toPoint={pendingAiTask?.toPoint || null}
                    city={currentCity}
                    weather={{ desc: "多云", windSpeed: windSpeed }}
                    onClose={cancelPendingTask}
                    onConfirm={confirmCreateTask}
                />

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

                {/* 毛玻璃风格的灵动胶囊提示条，不再遮挡视线，已切换白昼主题 */}
                {toastState && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-4">
                        <div className="bg-white/85 text-slate-700 px-6 py-2.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white ring-1 ring-slate-900/5 backdrop-blur-xl flex items-center space-x-3 transition-colors">
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
                    visionMode={visionMode}
                    setVisionMode={setVisionMode}
                />

                <WeatherOverlay />
                <AiMascot isRightPanelOpen={isRightPanelOpen} />
            </div>
        </ErrorBoundary>
    );
}
