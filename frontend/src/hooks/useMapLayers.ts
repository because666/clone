/**
 * 地图图层构建 Hook
 *
 * 从 MapContainer.tsx 中提取所有 Deck.gl 图层的 useMemo 构建逻辑。
 * MapContainer 的角色从"超级组件"退化为纯粹的组装器/编排器。
 */

import { useMemo, useState, useEffect } from 'react';
import { GeoJsonLayer, ColumnLayer, PathLayer, ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { uavPositionsBuffer, uavOrientationsBuffer, activeUAVTrajectories, activeUAVCount, conflictPairsBuffer, conflictPairCount } from '../utils/animation';
import { binarySearchTimestamp } from '../utils/physics';
import type { VisionMode } from '../components/VisionModeDock';

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
    sandboxCenters: { lat: number; lon: number }[];
    sandboxRadius: number;
    radarSweepActive: boolean;
    radarSweepRadius: number;
    setSelectedFlight: (flight: any) => void;
    setHoverInfo: (info: any) => void;
    handleDemandPick: (info: any) => void;
    visionMode: VisionMode;
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
    sandboxCenters,
    sandboxRadius,
    radarSweepActive,
    radarSweepRadius,
    setSelectedFlight,
    setHoverInfo,
    handleDemandPick,
    visionMode,
}: UseMapLayersParams) {

    const sensitivePoints = useMemo(() =>
        poiSensitive?.features?.filter((f: any) => f.geometry.type === 'Point') || [],
        [poiSensitive]
    );

    // ==================== [性能优化] 延时销毁发光图层 ====================
    const [haloVisible, setHaloVisible] = useState(visionMode === 'uav');
    useEffect(() => {
        if (visionMode === 'uav') {
            setHaloVisible(true);
        } else {
            const t = setTimeout(() => setHaloVisible(false), 600);
            return () => clearTimeout(t);
        }
    }, [visionMode]);

    // ==================== [性能优化] 动态扩容伪属性选色缓冲区 ====================
    // 强制给所有无人机分配专属拾取色以达成统一的高亮效果，基于当前容量动态避免爆显存
    const fakePickingColorsBuffer = useMemo(() => {
        const safeCount = Math.max(4000, (trajectories?.length || 0) + 1000);
        const buffer = new Uint8ClampedArray(safeCount * 3);
        for (let i = 0; i < safeCount * 3; i += 3) buffer[i] = 1;
        return buffer;
    }, [trajectories?.length]);

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
            getFillColor: visionMode === 'building'
                ? [0, 255, 255, 40]
                : visionMode !== 'default'
                    ? [30, 40, 50, 255]
                    : [170, 180, 195, 255],
            getLineColor: visionMode === 'building'
                ? [0, 255, 255, 255]
                : visionMode !== 'default'
                    ? [50, 60, 70, 255]
                    : [80, 90, 110, 255],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            getElevation: ((d: any) => d.properties.height || 20) as any,
            pickable: false,
            autoHighlight: false,
            material: { ambient: 0.4, diffuse: 0.6, shininess: 32, specularColor: [220, 230, 240] },
            updateTriggers: {
                getFillColor: visionMode,
                getLineColor: visionMode
            },
            transitions: {
                getFillColor: 600,
                getLineColor: 600
            }
        });
    }, [buildingsData, quantizedZoom, visionMode]);

    const poiDemandLayer = useMemo(() => {
        if (!poiDemand) return null;
        return new GeoJsonLayer({
            id: 'poi-demand-layer',
            data: poiDemand,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 1,
            getPointRadius: 45,
            pointRadiusMinPixels: 5,
            visible: visionMode === 'default',
            getFillColor: (d: any) => {
                if (pickedFromDisplay && d.properties?.poi_id === pickedFromDisplay.id) return [52, 255, 100, 40];
                return [52, 211, 153, 25];
            },
            getLineColor: (d: any) => {
                if (pickedFromDisplay && d.properties?.poi_id === pickedFromDisplay.id) return [52, 255, 100, 255];
                return [16, 185, 129, 230];
            },
            getLineWidth: 3,
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
    }, [poiDemand, pickedFromDisplay, handleDemandPick, visionMode]);

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
            getLineWidth: z > 11.5 ? 3 : 0,
            getPosition: (d: any) => d.geometry.coordinates,
            getFillColor: visionMode === 'nofly' ? [255, 0, 0, 180] : visionMode !== 'default' ? [50, 0, 0, 50] : [239, 68, 68, Math.round(fillAlpha * 0.4)],
            getLineColor: visionMode === 'nofly' ? [255, 0, 0, 255] : visionMode !== 'default' ? [100, 0, 0, 100] : [248, 113, 113, lineAlpha],
            getElevation: 400,
            updateTriggers: {
                getFillColor: visionMode,
                getLineColor: visionMode,
                getElevation: visionMode
            },
            transitions: {
                getFillColor: 600,
                getLineColor: 600,
                getElevation: 600
            }
        });
    }, [sensitivePoints, quantizedZoom, visionMode]);

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
            data: {
                length: 0,
                attributes: visionMode === 'uav' ? {
                    instancePickingColors: { value: fakePickingColorsBuffer, size: 3 }
                } : undefined
            },
            scenegraph: '/dji_spark.glb',
            getPosition: (_: any, { index }: any) => [
                uavPositionsBuffer[index * 3 + 0],
                uavPositionsBuffer[index * 3 + 1],
                uavPositionsBuffer[index * 3 + 2]
            ],
            getOrientation: (_: any, { index }: any) => [
                uavOrientationsBuffer[index * 3 + 0],
                uavOrientationsBuffer[index * 3 + 1],
                uavOrientationsBuffer[index * 3 + 2]
            ],
            sizeScale: 7.5,
            _lighting: 'pbr',
            _animations: { '*': { playing: true } },
            visible: true,
            pickable: true,
            autoHighlight: visionMode !== 'uav',
            highlightedObjectIndex: visionMode === 'uav' ? 0 : -1, // 欺骗高亮着色器让它以为我们只 hover 了索引 0，但其实所有飞机都是 0
            highlightColor: [255, 230, 0, 255], // 刺眼的超级黄
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
            },
            getColor: [255, 255, 255],
            updateTriggers: {
                // 用于告诉 DeckGL 重置 buffer
            }
        });
    }, [visionMode, setSelectedFlight, setHoverInfo, hoverInfoRef, fakePickingColorsBuffer]);

    const uavPointLayer = useMemo(() => {
        return new ScatterplotLayer({
            id: 'uav-point-layer',
            data: {
                length: 0,
                attributes: {
                    getPosition: { value: uavPositionsBuffer, size: 3 }
                }
            },
            getFillColor: visionMode === 'uav' ? [255, 215, 0, 255] : visionMode !== 'default' ? [0, 255, 255, 100] : [0, 255, 255, 255],
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
            },
            updateTriggers: {
                getFillColor: visionMode
            }
        });
    }, [visionMode, setSelectedFlight, setHoverInfo]);

    // ==================== 动态图层 ====================

    // 无人机全轨迹层 (仅在航班模式下显示，以暗黄体现全部轨迹预测)
    const uavFullTrajectoryLayer = useMemo(() => {
        if (visionMode !== 'uav' || !trajectories || trajectories.length === 0) return null;
        return new PathLayer({
            id: 'uav-full-trajectory-layer',
            data: trajectories,
            getPath: (d: any) => d.path,
            getColor: [255, 215, 0, 80],
            getWidth: 2,
            widthMinPixels: 1.5,
            pickable: false,
        });
    }, [trajectories, visionMode]);

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
                if (visionMode === 'uav') return [255, 220, 0, 255];
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
            opacity: visionMode === 'uav' ? 1.0 : layerOpacity,
            pickable: false,
            transitions: {
                getColor: 500,
                opacity: 500
            },
            updateTriggers: {
                getColor: { energyData, visionMode },
                opacity: visionMode
            }
        });
    }, [trajectories, energyData, quantizedZoom, visionMode]);

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

    // 沙盘静态范围图层
    const roiRadiusLayer = useMemo(() => {
        if (!sandboxCenters || sandboxCenters.length === 0) return null;
        return new ScatterplotLayer({
            id: 'roi-radius-layer',
            visible: visionMode === 'default',
            data: sandboxCenters,
            getPosition: (d: any) => [d.lon, d.lat],
            // 站点A使用科技蓝，站点B使用琥珀金
            getFillColor: (_d: any, { index }: any) => index === 0 ? [59, 130, 246, 50] : [245, 158, 11, 50],
            getLineColor: (_d: any, { index }: any) => index === 0 ? [59, 130, 246, 200] : [245, 158, 11, 200],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            getRadius: sandboxRadius,
            pickable: false,
            updateTriggers: {
                getRadius: sandboxRadius,
                getFillColor: sandboxCenters.length,
                getLineColor: sandboxCenters.length
            }
        });
    }, [sandboxCenters, sandboxRadius]);

    // 沙盘实体 3D 机塔图层
    const roiCenterModelLayer = useMemo(() => {
        if (!sandboxCenters || sandboxCenters.length === 0) return null;
        return new ScenegraphLayer({
            id: 'roi-center-model-layer',
            visible: visionMode === 'default',
            data: sandboxCenters,
            scenegraph: '/sci-fi_communication_tower.glb',
            getPosition: (d: any) => [d.lon, d.lat],
            getOrientation: [0, 0, 90],
            sizeScale: 40.0,
            parameters: { depthTest: true, cull: false },
            // A 使用白底透蓝，B 使用高对比度的耀金
            getColor: (_d: any, { index }: any) => index === 0 ? [240, 248, 255, 255] : [255, 200, 100, 255],
            pickable: false,
            updateTriggers: {
                getOrientation: [0, 0, 90],
                getColor: sandboxCenters.length
            },
            transitions: {
                getPosition: { duration: 500, type: 'spring', stiffness: 0.1, damping: 0.5 }
            }
        });
    }, [sandboxCenters]);

    // 雷达扫描波图层 - 每次落地时触发激波扩散
    const radarSweepLayer = useMemo(() => {
        if (!radarSweepActive || sandboxCenters.length === 0) return null;
        // 只跟随最后落下的点扩散
        const lastCenter = sandboxCenters[sandboxCenters.length - 1];
        const isB = sandboxCenters.length > 1;
        return new ScatterplotLayer({
            id: 'radar-sweep-layer',
            visible: visionMode === 'default',
            data: [lastCenter],
            getPosition: (d: any) => [d.lon, d.lat],
            getFillColor: [0, 0, 0, 0], // 中空
            getLineColor: isB ? [251, 191, 36, 255] : [56, 189, 248, 255], // 随点阵变色
            lineWidthMinPixels: 4,
            stroked: true,
            filled: false,
            getRadius: radarSweepRadius,
            pickable: false,
            updateTriggers: {
                getRadius: radarSweepRadius
            }
        });
    }, [radarSweepActive, radarSweepRadius, sandboxCenters]);

    // ==================== 最终组装 ====================
    // 【性能优化 P0-A】用 useMemo 包裹最终 layers 数组的组装，
    // 消除 MapContainer 每次 re-render 时的数组重建与 filter(Boolean) 的 GC 脉冲
    const layers = useMemo(() => {
        const assembled = [
            ...staticLayers,
            uavFullTrajectoryLayer,
            activeTailLayer,
            hoverPathLayer,
            roiRadiusLayer,     // 重新加上沙盘的静态探测圈图层
            radarSweepLayer,    // 添加沙盘动态激波扩散层
            roiCenterModelLayer,
            // ============ 4D 冲突检测弧线层 ============
            conflictPairCount > 0 ? new ArcLayer({
                id: 'conflict-arc-layer',
                data: Array.from({ length: conflictPairCount }, (_, i) => ({
                    source: [conflictPairsBuffer[i * 6], conflictPairsBuffer[i * 6 + 1], conflictPairsBuffer[i * 6 + 2]],
                    target: [conflictPairsBuffer[i * 6 + 3], conflictPairsBuffer[i * 6 + 4], conflictPairsBuffer[i * 6 + 5]],
                })),
                getSourcePosition: (d: any) => d.source,
                getTargetPosition: (d: any) => d.target,
                getSourceColor: [255, 60, 60, 220],
                getTargetColor: [255, 160, 60, 220],
                getWidth: 3,
                widthMinPixels: 2,
                getHeight: 0.3,
                pickable: false,
            }) : null,
            haloVisible ? new ScatterplotLayer({
                id: 'uav-halo-glow-layer',
                data: {
                    length: activeUAVCount,
                    attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
                },
                getFillColor: [255, 215, 0, visionMode === 'uav' ? 50 : 0],
                getRadius: visionMode === 'uav' ? 28 : 2,
                radiusMinPixels: visionMode === 'uav' ? 8 : 0,
                radiusMaxPixels: 35,
                pickable: false,
                parameters: { depthTest: false, blend: true, blendEquation: 32774 },
                transitions: {
                    getFillColor: 600,
                    getRadius: 600,
                    radiusMinPixels: 600
                },
                updateTriggers: {
                    getFillColor: visionMode,
                    getRadius: visionMode,
                    radiusMinPixels: visionMode
                } as any
            }) : null,
            haloVisible ? new ScatterplotLayer({
                id: 'uav-halo-core-layer',
                data: {
                    length: activeUAVCount,
                    attributes: { getPosition: { value: uavPositionsBuffer, size: 3 } }
                },
                getFillColor: [255, 255, 200, visionMode === 'uav' ? 180 : 0],
                getRadius: visionMode === 'uav' ? 8 : 1,
                radiusMinPixels: visionMode === 'uav' ? 3 : 0,
                radiusMaxPixels: 12,
                pickable: false,
                parameters: { depthTest: false },
                transitions: {
                    getFillColor: 400,
                    getRadius: 400,
                    radiusMinPixels: 400
                },
                updateTriggers: {
                    getFillColor: visionMode,
                    getRadius: visionMode,
                    radiusMinPixels: visionMode
                } as any
            }) : null,
            quantizedZoom >= 13 ? uavModelLayer.clone({
                data: {
                    length: activeUAVCount,
                    attributes: visionMode === 'uav' ? { instancePickingColors: { value: fakePickingColorsBuffer, size: 3 } } : undefined
                } as any
            }) : uavPointLayer.clone({
                data: {
                    length: activeUAVCount,
                    attributes: {
                        getPosition: { value: uavPositionsBuffer, size: 3 }
                    }
                },
                updateTriggers: {
                    getFillColor: visionMode
                } as any
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
        return assembled;
    }, [staticLayers, uavFullTrajectoryLayer, activeTailLayer, hoverPathLayer, roiRadiusLayer, radarSweepLayer,
        roiCenterModelLayer, uavModelLayer, uavPointLayer, quantizedZoom, selectedFlight, haloVisible, fakePickingColorsBuffer, visionMode]);

    return { layers };
}
