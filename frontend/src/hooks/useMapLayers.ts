/**
 * 【架构优化 P1-1】地图图层构建 Hook
 *
 * 从 MapContainer.tsx 中提取所有 Deck.gl 图层的 useMemo 构建逻辑。
 * MapContainer 的角色从"超级组件"退化为纯粹的组装器/编排器。
 */

import { useMemo } from 'react';
import { GeoJsonLayer, ColumnLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { uavPositionsBuffer, uavOrientationsBuffer, activeUAVTrajectories, activeUAVCount } from '../utils/animation';
import { binarySearchTimestamp } from '../utils/physics';

interface UseMapLayersParams {
    buildingsData: any;
    poiDemand: any;
    poiSensitive: any;
    trajectories: any[];
    energyData: any;
    quantizedZoom: number;
    hoverInfo: any;
    hoverInfoRef: React.MutableRefObject<any>;
    selectedFlight: any;
    pickedFromDisplay: { lat: number; lon: number; id: string; name: string } | null;
    currentTimeRef: React.MutableRefObject<number>;
    setSelectedFlight: (flight: any) => void;
    setHoverInfo: (info: any) => void;
    handleDemandPick: (info: any) => void;
}

/**
 * 构建所有 Deck.gl 渲染图层
 * 将 MapContainer 中 ~300 行的 useMemo 图层逻辑集中管理
 */
export function useMapLayers({
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
    setSelectedFlight,
    setHoverInfo,
    handleDemandPick,
}: UseMapLayersParams) {

    const sensitivePoints = useMemo(() =>
        poiSensitive?.features?.filter((f: any) => f.geometry.type === 'Point') || [],
        [poiSensitive]
    );

    // ==================== 静态图层 ====================

    const buildingsLayer = useMemo(() => {
        if (!buildingsData) return null;
        const z = quantizedZoom;
        return new GeoJsonLayer({
            id: 'buildings-layer',
            data: buildingsData,
            extruded: true,
            filled: true,
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
            getPointRadius: 45,
            pointRadiusMinPixels: 4,
            getFillColor: (d: any) => {
                if (pickedFromDisplay && d.properties?.poi_id === pickedFromDisplay.id) return [52, 255, 100, 255];
                return [52, 211, 153, 140];
            },
            getLineColor: [5, 150, 105, 220],
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 220, 50, 220],
            onClick: handleDemandPick,
            onHover: (info: any) => setHoverInfo(info),
            cursor: 'pointer',
            updateTriggers: {
                getFillColor: [pickedFromDisplay?.id]
            }
        } as any);
    }, [poiDemand, pickedFromDisplay, handleDemandPick]);

    const poiSensitiveLayer = useMemo(() => {
        if (!sensitivePoints.length) return null;
        const z = quantizedZoom;
        const t = Math.max(0, Math.min(1, (z - 10.5) / 3.0));
        const fillAlpha = Math.round(t * 25);
        const lineAlpha = Math.round(t * 200);

        return new ColumnLayer({
            id: 'poi-sensitive-point-layer',
            data: sensitivePoints,
            diskResolution: 12,
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

    const staticLayers = useMemo(() => {
        const layers = [];
        if (buildingsLayer) layers.push(buildingsLayer);
        if (poiDemandLayer) layers.push(poiDemandLayer);
        if (poiSensitiveLayer) layers.push(poiSensitiveLayer);
        return layers;
    }, [buildingsLayer, poiDemandLayer, poiSensitiveLayer]);

    // ==================== UAV 图层 ====================

    const uavModelLayer = useMemo(() => {
        return new ScenegraphLayer({
            id: 'uav-model-layer',
            data: { length: 0 },
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
                } else if (hoverInfoRef.current?.object?.properties?.type === 'uav') {
                    setHoverInfo(null);
                }
            }
        });
    }, []);

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
                } else if (hoverInfoRef.current?.object?.properties?.type === 'uav') {
                    setHoverInfo(null);
                }
            }
        });
    }, []);

    // ==================== 动态图层 ====================

    const activeTailLayer = useMemo(() => {
        const z = quantizedZoom;
        const t = Math.max(0, Math.min(1, (z - 10.5) / 3.0));
        const widthMinPx = 0.5 + t * 2.0;
        const layerOpacity = 0.4 + t * 0.5;

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
            pickable: false,
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

    // ==================== 最终组装 ====================

    const layers = [
        ...staticLayers,
        activeTailLayer,
        hoverPathLayer,
        quantizedZoom >= 13 ? uavModelLayer.clone({
            data: { length: activeUAVCount },
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
        }),
        selectedFlight ? new ScatterplotLayer({
            id: 'selected-uav-layer',
            data: [selectedFlight],
            getPosition: (d: any) => {
                const t = currentTimeRef.current;
                const times = d.timestamps;
                const index = binarySearchTimestamp(times, t);
                if (index <= 0) return d.path[0];
                if (index >= times.length) return d.path[d.path.length - 1];
                
                const t0 = times[index - 1];
                const t1 = times[index];
                const p0 = d.path[index - 1];
                const p1 = d.path[index];
                const ratio = (t - t0) / (t1 - t0);
                return [
                    p0[0] + (p1[0] - p0[0]) * ratio,
                    p0[1] + (p1[1] - p0[1]) * ratio,
                    (p0[2] + (p1[2] - p0[2]) * ratio) || 0
                ];
            },
            getFillColor: [255, 190, 0, 200],
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 3,
            radiusMinPixels: 15,
            radiusMaxPixels: 60,
            opacity: 1,
            stroked: true,
            filled: true,
            updateTriggers: {
                getPosition: currentTimeRef.current
            }
        }) : null
    ].filter(Boolean);

    return { layers };
}
