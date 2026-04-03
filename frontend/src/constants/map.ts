import { Home, ShoppingCart, Building2, Building, Plane } from 'lucide-react';

export const DEMAND_TYPE_MAP: Record<string, { label: string, Icon: any }> = {
    'residential': { label: '住宅区', Icon: Home },
    'commercial': { label: '商业区', Icon: ShoppingCart },
    'apartments': { label: '公寓', Icon: Building },
    'office': { label: '办公楼', Icon: Building2 },
    // 兼容可能出现的其他类型
    'hotel': { label: '酒店', Icon: Building },
    'hospital': { label: '医院', Icon: Building2 },
    'school': { label: '学校', Icon: Building2 },
    'industrial': { label: '工业区', Icon: Building2 },
    // 新增无人机类型以配合 hover info
    'uav': { label: '活动无人机', Icon: Plane }
};

export const INITIAL_VIEW_STATE = {
    longitude: 113.935,
    latitude: 22.535,
    zoom: 13,
    pitch: 50,
    bearing: 15,
    maxPitch: 85 // 允许像常规地图一样更自由的俯仰角
};

export const CITY_COORDS: Record<string, { longitude: number, latitude: number, zoom: number }> = {
    "shenzhen": { longitude: 113.935, latitude: 22.535, zoom: 13 },
    "beijing": { longitude: 116.397, latitude: 39.908, zoom: 13 },
    "shanghai": { longitude: 121.473, latitude: 31.230, zoom: 13 },
    "guangzhou": { longitude: 113.264, latitude: 23.129, zoom: 13 },
    "chengdu": { longitude: 104.066, latitude: 30.572, zoom: 13 },
    "chongqing": { longitude: 106.551, latitude: 29.563, zoom: 13 }
};

export const CITIES = [
    { id: "shenzhen", label: "深圳 · 南山" },
    { id: "beijing", label: "北京 · 核心" },
    { id: "shanghai", label: "上海 · 核心" },
    { id: "guangzhou", label: "广州 · 核心" },
    { id: "chengdu", label: "成都 · 核心" },
    { id: "chongqing", label: "重庆 · 主城" }
];

/** 【P2-1 统一常量】城市简称映射 —— TaskManagementPanel 等使用 */
export const CITY_LABEL_MAP: Record<string, string> = {
    shenzhen: '深圳',
    beijing: '北京',
    shanghai: '上海',
    guangzhou: '广州',
    chengdu: '成都',
    chongqing: '重庆',
};

/** 【P2-1 统一常量】城市运营中心全称映射 —— DashboardOverlay 使用 */
export const CITY_CONTROL_CENTER_MAP: Record<string, string> = {
    shenzhen: '深圳南山运营控制中心',
    beijing: '北京核心运营控制中心',
    shanghai: '上海核心运营控制中心',
    guangzhou: '广州核心运营控制中心',
    chengdu: '成都核心运营控制中心',
    chongqing: '重庆主城运营控制中心',
};
