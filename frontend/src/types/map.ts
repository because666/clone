export interface UAVPath {
    id: string;
    path: [number, number, number][];
    timestamps: number[];
}

export interface CityData {
    buildings: any;
    poiDemand: any;
    poiSensitive: any;
    trajectories: UAVPath[];
    energyData: any;
    timeRange: { min: number; max: number };
}
