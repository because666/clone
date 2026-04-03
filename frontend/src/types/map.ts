export interface UAVPath {
    id: string;
    path: [number, number, number][];
    timestamps: number[];
    // OPT-1: SoA (Structure of Arrays) 预编译数据
    pathLon?: Float32Array;
    pathLat?: Float32Array;
    pathAlt?: Float32Array;
    timestampsF64?: Float64Array;
    // A* 搜索探索节点（用于可视化）
    explored_nodes?: [number, number][];
    nodes_expanded?: number;
    // 任务系统标记
    fromTaskSystem?: boolean;
    _taskDbId?: string;
}

export interface CityData {
    buildings: any;
    poiDemand: any;
    poiSensitive: any;
    trajectories: UAVPath[];
    energyData: any;
    timeRange: { min: number; max: number };
}
