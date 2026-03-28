import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ColumnLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { Map as MapGL, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';

import { INITIAL_VIEW_STATE, CITY_COORDS } from '../constants/map';
import { useCityData } from '../hooks/useCityData';
import { useUAVAnimation } from '../hooks/useUAVAnimation';
import { useWindSpeed } from '../contexts/WindSpeedContext';
import { useAlerts } from './AlertNotificationProvider';
import PlaybackControls from './PlaybackControls';
import HoverTooltip from './HoverTooltip';
import FlightDetailPanel from './FlightDetailPanel';
import WeatherOverlay from './WeatherOverlay';
// 【性能优化】ECharts 延迟加载：统计面板默认隐藏，ECharts ~800KB 不再阻塞首屏
const AnalyticsPanel = lazy(() => import('./AnalyticsPanel'));
import DashboardOverlay from './DashboardOverlay';
import { uavPositionsBuffer, uavOrientationsBuffer, activeUAVTrajectories, activeUAVCount } from '../utils/animation';
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
    const [toastState, setToastState] = useState<{ msg: string, type: 'info' | 'success' | 'error' | 'loading' } | null>(null);

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
    } = useUAVAnimation(trajectories, timeRangeRef, currentTimeRef, deckRef, energyData, poiSensitive, windSpeed, pushAlert);

    useEffect(() => {
        loadCityData("shenzhen", () => setSelectedFlight(null));
    }, [loadCityData]);

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

    const handleViewStateChange = useCallback(({ viewState }: any) => {
        const { longitude, latitude, zoom, pitch, bearing } = viewState;
        setViewState({ longitude, latitude, zoom, pitch, bearing, maxPitch: INITIAL_VIEW_STATE.maxPitch });
    }, []);

    const handleDemandPick = useCallback((info: any) => {
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

            showToast(`正在生成到 ${picked.name || picked.id} 的轨迹...`, 'loading');

            // 异步调用 single API 生成轨迹（仅演示，不保存到文件）
            fetch('/api/single', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city: currentCity,
                    from_lat: from.lat, from_lon: from.lon, from_id: from.id,
                    to_lat: picked.lat, to_lon: picked.lon, to_id: picked.id,
                    save: false // 仅在前端演示，不保存到后端 json 文件以避免触发页面刷新
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
                    if (data.ok && data.trajectory) {
                        showToast(`轨迹生成成功！`, 'success');
                        // 将 API 返回的轨迹 timestamps 偏移到当前动画时间，使其立即可见
                        const newTraj = { ...data.trajectory };
                        const offset = currentTimeRef.current;
                        newTraj.timestamps = newTraj.timestamps.map((t: number) => t + offset);
                        setTrajectories(prev => [...prev, newTraj]);
                        setSelectedFlight(newTraj);
                    } else {
                        showToast(`生成失败：${data.error || data.message || '未知错误'}`, 'error');
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

    const sensitivePoints = useMemo(() =>
        poiSensitive?.features?.filter((f: any) => f.geometry.type === 'Point') || [],
        [poiSensitive]
    );

    // 渐进式渲染：根据加载状态决定是否渲染各图层
    const buildingsLayer = useMemo(() => {
        if (!buildingsData) return null;
        const z = quantizedZoom;
        return new GeoJsonLayer({
            id: 'buildings-layer',
            data: buildingsData,
            extruded: true,
            filled: true,
            // 远景时关闭3D轮廓线，避免密集的线框导致抗锯齿计算过载和花屏
            stroked: z > 13,
            wireframe: z > 13,
            getFillColor: [170, 180, 195, 255],
            getLineColor: [80, 90, 110, 255],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            getElevation: ((d: any) => d.properties.height || 20) as any,
            pickable: false,
            autoHighlight: false,
            material: { ambient: 0.4, diffuse: 0.6, shininess: 32, specularColor: [220, 230, 240] },
        });
    }, [buildingsData, quantizedZoom]);

    const poiDemandLayer = useMemo(() => {
        if (!poiDemand) return null;
        return new GeoJsonLayer({
            id: 'poi-demand-layer',
            data: poiDemand,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 1,
            // 放大基础半径到45米，使其在3D空间中成为包围大楼的“发光底座”
            getPointRadius: 45,
            pointRadiusMinPixels: 4,
            // 删除了 pointRadiusMaxPixels 限制，让光圈可以随视角放大而正常占据视野，绝不会再在近距离缩成找不到的小点
            getFillColor: (d: any) => {
                if (pickedFromDisplay && d.properties?.poi_id === pickedFromDisplay.id) return [52, 255, 100, 255];
                return [52, 211, 153, 140]; // 略微透明，更好融合地面
            },
            getLineColor: [5, 150, 105, 220],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 220, 50, 220],
            onClick: handleDemandPick,
            onHover: (info: any) => setHoverInfo(info),
            cursor: 'pointer',
            // 移除 depthTest: false，恢复真实的 3D 物理遮挡，保留最优雅的空间层次感
            updateTriggers: {
                getFillColor: [pickedFromDisplay?.id]
            }
        } as any);
    }, [poiDemand, pickedFromDisplay, handleDemandPick]);

    const poiSensitiveLayer = useMemo(() => {
        if (!sensitivePoints.length) return null;
        // 基于量化 Zoom 计算平滑过渡因子 (10.5 远景 -> 13.5 近景)
        const z = quantizedZoom;
        const t = Math.max(0, Math.min(1, (z - 10.5) / 3.0));
        const fillAlpha = Math.round(t * 25);
        const lineAlpha = Math.round(t * 200);

        return new ColumnLayer({
            id: 'poi-sensitive-point-layer',
            data: sensitivePoints,
            diskResolution: 20,
            radius: 100,
            getRadius: (d: any) => {
                const category = d.properties?.category || '';
                switch (category) {
                    case 'hospital': return 300;
                    case 'clinic': return 250;
                    case 'school': return 300;
                    case 'kindergarten': return 250;
                    case 'college': return 200;
                    case 'university': return 200;
                    case 'police': return 150;
                    default: return 200;
                }
            },
            pickable: true,
            elevationScale: 1,
            wireframe: z > 11.5,
            getLineWidth: z > 11.5 ? 2 : 0,
            getPosition: (d: any) => d.geometry.coordinates,
            getFillColor: [255, 60, 60, fillAlpha],
            getLineColor: [255, 80, 80, lineAlpha],
            getElevation: 400,
        });
    }, [sensitivePoints, quantizedZoom]);

    // 组合静态图层（渐进式渲染）
    const staticLayers = useMemo(() => {
        const layers = [];
        if (buildingsLayer) layers.push(buildingsLayer);
        if (poiDemandLayer) layers.push(poiDemandLayer);
        if (poiSensitiveLayer) layers.push(poiSensitiveLayer);
        return layers;
    }, [buildingsLayer, poiDemandLayer, poiSensitiveLayer]);

    // ==========================================
    // 超大规模集群渲染方案：3D 模型层 (ScenegraphLayer)
    // 问题：Deck.gl 官方虽然声称支持 Binary Attributes，但 ScenegraphLayer 因历史包袱，
    // 其底层实现仍在 CPU 上遍历计算 16 维的 instanceModelMatrix。
    // 解法：放弃传入直接的 attributes 对象，转而向 data 传入 { length: N } 作为迭代触发器。
    // 在 getOrientation 等回调中，利用暴露的 {index} 直接越过对象的重重解构，
    // 指针直达我们在 Worker / 动画引擎中维护的 Float32Array SoA 内存块。
    // 这保持了前端架构的绝对“零内存分配”，避免了海量新生代对象引发的 GC 卡顿。
    // ==========================================
    const uavModelLayer = useMemo(() => {
        return new ScenegraphLayer({
            id: 'uav-model-layer',
            data: {
                length: 0
            },
            scenegraph: '/dji_spark.glb',
            getPosition: (_: any, {index}: any) => [
                uavPositionsBuffer[index * 3 + 0],
                uavPositionsBuffer[index * 3 + 1],
                uavPositionsBuffer[index * 3 + 2]
            ],
            getOrientation: (_: any, {index}: any) => [
                uavOrientationsBuffer[index * 3 + 0],
                uavOrientationsBuffer[index * 3 + 1],
                uavOrientationsBuffer[index * 3 + 2]
            ],
            sizeScale: 7.5,
            _lighting: 'pbr',
            _animations: { '*': { playing: true } },
            visible: true,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 0, 255],
            onClick: (info: any) => {
                if (info.index >= 0 && activeUAVTrajectories[info.index]) {
                    setSelectedFlight(activeUAVTrajectories[info.index]);
                }
            },
            onHover: (info: any) => {
                if (info.index >= 0 && activeUAVTrajectories[info.index]) {
                    const traj = activeUAVTrajectories[info.index];
                    setHoverInfo({
                        ...info,
                        object: { properties: { name: `无人机 ${traj.id}`, type: 'uav' }, trajectory: traj }
                    });
                } else if (hoverInfo?.object?.properties?.type === 'uav') {
                    setHoverInfo(null);
                }
            }
        });
    }, [hoverInfo]);

    // ==========================================
    // 超大规模集群渲染方案：LOD (Level of Detail) 降级光点层
    // 策略：当缩放级别（Zoom）退远，模型细小到几个像素时，强行调用 3D 渲染器是不理智的。
    // 我们无缝切换至原生支持 Binary Attributes 直传的 ScatterplotLayer（散点层）。
    // 将整个 uavPositionsBuffer 作为单一二进制流推入 GPU VRAM，此时 CPU 连 for 循环开销都省了。
    // ==========================================
    const uavPointLayer = useMemo(() => {
        return new ScatterplotLayer({
            id: 'uav-point-layer',
            data: {
                length: 0,
                attributes: {
                    getPosition: { value: uavPositionsBuffer, size: 3 }
                }
            },
            getFillColor: [0, 255, 255, 255],
            getRadius: 8,
            radiusMinPixels: 4,
            radiusMaxPixels: 12,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 0, 255],
            onClick: (info: any) => {
                if (info.index >= 0 && activeUAVTrajectories[info.index]) {
                    setSelectedFlight(activeUAVTrajectories[info.index]);
                }
            },
            onHover: (info: any) => {
                if (info.index >= 0 && activeUAVTrajectories[info.index]) {
                    const traj = activeUAVTrajectories[info.index];
                    setHoverInfo({
                        ...info,
                        object: { properties: { name: `无人机 ${traj.id}`, type: 'uav' }, trajectory: traj }
                    });
                } else if (hoverInfo?.object?.properties?.type === 'uav') {
                    setHoverInfo(null);
                }
            }
        });
    }, [hoverInfo]);

    const activeTailLayer = useMemo(() => {
        // 轨迹平滑衰减处理（使用量化 zoom，减少重建频率）
        const z = quantizedZoom;
        const t = Math.max(0, Math.min(1, (z - 10.5) / 3.0));
        const widthMinPx = 0.5 + t * 2.0;    // 0.5px -> 2.5px
        const layerOpacity = 0.4 + t * 0.5;  // 0.4 -> 0.9

        return new TripsLayer({
            id: 'uav-active-tail-layer',
            data: trajectories,
            getPath: (d: any) => d.path,
            getTimestamps: (d: any) => d.timestamps,
            getColor: (d: any) => {
                const realId = d.id ? d.id.replace('_ghost', '') : '';
                if (realId && energyData && energyData[realId]) {
                    const payload = energyData[realId].payload;
                    if (payload >= 2.0) return [245, 158, 11];
                    if (payload >= 1.0) return [16, 185, 129];
                    return [14, 165, 233];
                }
                return [14, 165, 233];
            },
            widthMinPixels: widthMinPx,
            trailLength: 100,
            currentTime: currentTimeRef.current,
            shadowEnabled: false,
            opacity: layerOpacity,
            pickable: true,
            updateTriggers: {
                getColor: energyData
            }
        });
    }, [trajectories, energyData, quantizedZoom]);

    const hoverPathLayer = useMemo(() => {
        let pathData: any[] = [];
        if (hoverInfo?.object?.trajectory?.path) {
            pathData = [hoverInfo.object.trajectory];
        } else if (selectedFlight) {
            pathData = [selectedFlight];
        }

        return new PathLayer({
            id: 'uav-hover-path-layer',
            data: pathData,
            pickable: false,
            widthScale: 1,
            widthMinPixels: 4,
            getPath: (d: any) => d.path,
            getColor: [255, 215, 0, 255],
            getWidth: 2
        });
    }, [hoverInfo, selectedFlight]);

    const layers = [
        ...staticLayers,
        activeTailLayer,
        hoverPathLayer,
        // 核心渲染调度：根据量化后的整数级视角缩放 (quantizedZoom >= 13) 进行实时 LOD 切换调度
        // 注：之所以使用 clone() 模式，是利用 Deck.gl 的 Diff 机制，复用前一帧的底层 WebGL Context，
        // 从而将帧切换的成本从“重组 Scene 图”降维成了单纯的 Uniform 变量和 Buffer 指针更新。
        quantizedZoom >= 13 ? uavModelLayer.clone({
            data: {
                length: activeUAVCount
            },
            updateTriggers: {
                getPosition: currentTimeRef.current,
                getOrientation: currentTimeRef.current
            }
        }) : uavPointLayer.clone({
            data: {
                length: activeUAVCount,
                attributes: {
                    getPosition: { value: uavPositionsBuffer, size: 3 }
                }
            },
            updateTriggers: {
                getPosition: currentTimeRef.current
            }
        })
    ].filter(Boolean);

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
                >
                    <MapGL
                        ref={mapRef}
                        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                        reuseMaps
                        onLoad={handleMapLoad}
                        maxPitch={INITIAL_VIEW_STATE.maxPitch}
                    />
                </DeckGL>

                <DashboardOverlay onOpenAnalytics={() => setIsAnalyticsOpen(true)} currentCity={currentCity} />

                <HoverTooltip hoverInfo={hoverInfo} />

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
