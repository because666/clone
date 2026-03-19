import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ColumnLayer, PathLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { Map as MapGL, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import AlgoLabPanel from './AlgoLabPanel';

import { INITIAL_VIEW_STATE, CITY_COORDS } from '../constants/map';
import { useCityData } from '../hooks/useCityData';
import { useUAVAnimation } from '../hooks/useUAVAnimation';
import { useWindSpeed } from '../contexts/WindSpeedContext';
import { useAlerts } from './AlertNotificationProvider';
import PlaybackControls from './PlaybackControls';
import HoverTooltip from './HoverTooltip';
import FlightDetailPanel from './FlightDetailPanel';
import WeatherOverlay from './WeatherOverlay';
import { uavModelBuffer } from '../utils/animation';
import { StepProgress } from '../features/LoadingProgress/StepProgress';
import { ErrorAlert } from './ErrorAlert';
import { ErrorBoundary } from './ErrorBoundary';
import { MapSkeleton } from './MapSkeleton';

export default function MapContainer({ onRightPanelToggle, isRightPanelOpen = false }: { onRightPanelToggle?: (open: boolean) => void, isRightPanelOpen?: boolean } = {}) {
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
        reloadCurrentTrajectories,
        clearError
    } = useCityData();

    const [selectedFlight, setSelectedFlight] = useState<any>(null);
    const [pickMode, setPickMode] = useState<'from' | 'to' | null>(null);
    const [pickedFrom, setPickedFrom] = useState<{ lat: number; lon: number; id: string; name: string } | null>(null);
    const [pickedTo, setPickedTo] = useState<{ lat: number; lon: number; id: string; name: string } | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [hoverInfo, setHoverInfo] = useState<any>(null);
    const [currentCity, setCurrentCity] = useState("shenzhen");
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

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
        if (!info.object || pickMode === null) return;
        const feat = info.object;
        const coords = feat.geometry?.coordinates;
        if (!coords) return;
        const [lon, lat] = coords;
        const props = feat.properties || {};
        const picked = { lat, lon, id: String(props.poi_id || props.osm_id || ''), name: props.name || '' };
        if (pickMode === 'from') {
            setPickedFrom(picked);
            setPickMode('to');
        } else {
            setPickedTo(picked);
            setPickMode(null);
        }
    }, [pickMode]);

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
        return new GeoJsonLayer({
            id: 'buildings-layer',
            data: buildingsData,
            extruded: true,
            filled: true,
            stroked: true,
            wireframe: true,
            getFillColor: [170, 180, 195, 255],
            getLineColor: [80, 90, 110, 255],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            getElevation: ((d: any) => d.properties.height || 20) as any,
            pickable: true,
            autoHighlight: true,
            highlightColor: [80, 140, 220, 255],
            material: { ambient: 0.4, diffuse: 0.6, shininess: 32, specularColor: [220, 230, 240] },
        });
    }, [buildingsData]);

    const poiDemandLayer = useMemo(() => {
        if (!poiDemand) return null;
        return new GeoJsonLayer({
            id: 'poi-demand-layer',
            data: poiDemand,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 1,
            getPointRadius: 25,
            pointRadiusMinPixels: 4,
            pointRadiusMaxPixels: 16,
            getFillColor: (d: any) => {
                if (pickedFrom && d.properties?.poi_id === pickedFrom.id) return [52, 255, 100, 255];
                if (pickedTo && d.properties?.poi_id === pickedTo.id) return [255, 80, 80, 255];
                return [52, 211, 153, 160];
            },
            getLineColor: [5, 150, 105, 220],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 220, 50, 220],
            onClick: handleDemandPick,
            onHover: (info: any) => setHoverInfo(info),
            cursor: pickMode !== null ? 'crosshair' : 'pointer',
        } as any);
    }, [poiDemand, pickedFrom, pickedTo, pickMode, handleDemandPick]);

    const poiSensitiveLayer = useMemo(() => {
        if (!sensitivePoints.length) return null;
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
            wireframe: true,
            getLineWidth: 2,
            getPosition: (d: any) => d.geometry.coordinates,
            getFillColor: [255, 60, 60, 25],
            getLineColor: [255, 80, 80, 200],
            getElevation: 400,
        });
    }, [sensitivePoints]);

    // 组合静态图层（渐进式渲染）
    const staticLayers = useMemo(() => {
        const layers = [];
        if (buildingsLayer) layers.push(buildingsLayer);
        if (poiDemandLayer) layers.push(poiDemandLayer);
        if (poiSensitiveLayer) layers.push(poiSensitiveLayer);
        return layers;
    }, [buildingsLayer, poiDemandLayer, poiSensitiveLayer]);

    // 实时读取最新的 mutable buffer，不缓存，避免暂停触发 React 重绘时拿到初始的空数组
    const activeUAVs = uavModelBuffer.filter(u => u.isActive);

    const uavModelLayer = useMemo(() => {
        return new ScenegraphLayer({
            id: 'uav-model-layer',
            data: [] as any[], // 基础层不绑定数据，在实际使用时 clone 注入
            scenegraph: '/dji_spark.glb',
            getPosition: (d: any) => d.position,
            getOrientation: (d: any) => d.orientation,
            sizeScale: 7.5,
            _lighting: 'pbr',
            _animations: { '*': { playing: true } },
            visible: true,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 0, 255],
            onClick: (info: any) => {
                if (info.object) setSelectedFlight(info.object.trajectory);
            },
            onHover: (info: any) => {
                if (info.object) {
                    setHoverInfo({
                        ...info,
                        object: { properties: { name: `无人机 ${info.object.id}`, type: 'uav' } }
                    });
                } else if (hoverInfo?.object?.properties?.type === 'uav') {
                    setHoverInfo(null);
                }
            }
        });
    }, [viewState.zoom]);

    const activeTailLayer = useMemo(() => {
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
            widthMinPixels: 2.5,
            trailLength: 100,
            currentTime: currentTimeRef.current,
            shadowEnabled: false,
            opacity: 0.9,
            pickable: true,
            updateTriggers: {
                getColor: energyData
            }
        });
    }, [trajectories, energyData]);

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
        uavModelLayer.clone({
            data: activeUAVs,
            updateTriggers: {
                getPosition: currentTimeRef.current,
                getOrientation: currentTimeRef.current
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

                <HoverTooltip hoverInfo={hoverInfo} />

                <FlightDetailPanel
                    selectedFlight={selectedFlight}
                    energyData={energyData}
                    currentTimeRef={currentTimeRef}
                    setSelectedFlight={setSelectedFlight}
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

                <AlgoLabPanel
                    city={currentCity}
                    onTrajectoriesUpdated={reloadCurrentTrajectories}
                    pickMode={pickMode}
                    setPickMode={setPickMode}
                    pickedFrom={pickedFrom}
                    pickedTo={pickedTo}
                    onClearPick={() => { setPickedFrom(null); setPickedTo(null); setPickMode(null); }}
                    onToggle={onRightPanelToggle}
                    isOpen={isRightPanelOpen}
                />
                <WeatherOverlay />
            </div>
        </ErrorBoundary>
    );
}
