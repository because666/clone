export interface UAVPath {
    id: string;
    path: [number, number, number][];
    timestamps: number[];
    // OPT-1: SoA (Structure of Arrays) 预编译数据
    pathLon?: Float32Array;
    pathLat?: Float32Array;
    pathAlt?: Float32Array;
    timestampsF64?: Float64Array;
}

export interface CityData {
    buildings: any;
    poiDemand: any;
    poiSensitive: any;
    trajectories: UAVPath[];
    energyData: any;
    timeRange: { min: number; max: number };
}
