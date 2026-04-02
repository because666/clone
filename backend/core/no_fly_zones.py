"""
no_fly_zones.py — 禁飞区数据结构与查询

将 sensitive POI 转换为 (lat, lon, radius_m) 的禁飞圆列表，
提供点/线段与禁飞区的碰撞检测接口。
"""
import math
from pathlib import Path
from .geo_utils import haversine_m

# 禁飞半径配置（统一调整为 125m 释放起降点）
NO_FLY_RADIUS_M: dict[str, float] = {
    "hospital":     125.0,
    "clinic":       125.0,
    "school":       125.0,
    "kindergarten": 125.0,
    "college":      125.0,
    "university":   125.0,
    "police":       125.0,
}
DEFAULT_RADIUS_M = 125.0


def get_radius(category: str) -> float:
    """根据 sensitive POI 类别返回禁飞半径（米）"""
    return NO_FLY_RADIUS_M.get(category, DEFAULT_RADIUS_M)


class NoFlyZone:
    """单个禁飞圆"""
    __slots__ = ("lat", "lon", "radius_m", "category", "name")

    def __init__(self, lat: float, lon: float, category: str, name: str = ""):
        self.lat = lat
        self.lon = lon
        self.radius_m = get_radius(category)
        self.category = category
        self.name = name

    def contains_point(self, lat: float, lon: float, buffer_m: float = 0.0) -> bool:
        """判断点 (lat, lon) 是否在本禁飞圆内（含可选 buffer）"""
        return haversine_m(lat, lon, self.lat, self.lon) < self.radius_m + buffer_m

    def intersects_segment(self, p1_lat, p1_lon, p2_lat, p2_lon, buffer_m: float = 0.0) -> bool:
        """
        判断线段 p1→p2 是否穿越本禁飞圆（含可选 buffer）。
        使用点到线段的最短距离进行判断。
        """
        r = self.radius_m + buffer_m
        # 先做包围盒粗筛 (注意：原代码基于中点判断且未加上线段半长，对长线段致命错误)
        # 改为直接验证禁飞区中心是否超出了线段的经纬度极值包围盒
        box_half_deg = r / 111320.0 + 0.001
        
        min_lat = min(p1_lat, p2_lat) - box_half_deg
        max_lat = max(p1_lat, p2_lat) + box_half_deg
        if self.lat < min_lat or self.lat > max_lat:
            return False
            
        min_lon = min(p1_lon, p2_lon) - box_half_deg
        max_lon = max(p1_lon, p2_lon) + box_half_deg
        if self.lon < min_lon or self.lon > max_lon:
            return False

        # 精确：点到线段最短距离
        d = _point_to_segment_dist(
            self.lat, self.lon,
            p1_lat, p1_lon, p2_lat, p2_lon
        )
        return d < r


def _point_to_segment_dist(c_lat, c_lon, p1_lat, p1_lon, p2_lat, p2_lon) -> float:
    """
    计算点 C 到线段 P1→P2 的最短距离（米）。
    通过局部等距投影转换为平面米坐标系，再做严格的几何定点到线段测距，避免球面形变造成的漏判。
    """
    METERS_PER_DEG_LAT = 111320.0
    cos_c = math.cos(math.radians(c_lat))
    METERS_PER_DEG_LON = METERS_PER_DEG_LAT * cos_c
    
    dx1 = (p1_lon - c_lon) * METERS_PER_DEG_LON
    dy1 = (p1_lat - c_lat) * METERS_PER_DEG_LAT
    
    dx2 = (p2_lon - c_lon) * METERS_PER_DEG_LON
    dy2 = (p2_lat - c_lat) * METERS_PER_DEG_LAT
    
    vx = dx2 - dx1
    vy = dy2 - dy1
    seg_len_sq = vx*vx + vy*vy
    
    if seg_len_sq < 1e-6:
        return math.hypot(dx1, dy1)
        
    t = (-dx1 * vx - dy1 * vy) / seg_len_sq
    t = max(0.0, min(1.0, t))
    
    proj_x = dx1 + t * vx
    proj_y = dy1 + t * vy
    
    return math.hypot(proj_x, proj_y)


class NoFlyZoneIndex:
    """
    禁飞区集合，提供批量查询接口。
    内部按经纬度格网（0.01° ≈ 1km）分桶，实现快速空间筛选。
    """

    def __init__(self, zones: list[NoFlyZone]):
        self.zones = zones
        # 格网桶：key = (lat_bucket, lon_bucket)
        self._grid: dict[tuple, list[NoFlyZone]] = {}
        GRID = 0.01
        self.max_radius_m = max((z.radius_m for z in zones), default=0) if zones else 0.0
        for z in zones:
            bk = (int(z.lat / GRID), int(z.lon / GRID))
            self._grid.setdefault(bk, []).append(z)
        self._GRID = GRID

    def _nearby_zones(self, lat: float, lon: float, max_radius_m: float) -> list[NoFlyZone]:
        """返回可能与给定点/范围相交的禁飞区列表（粗筛）"""
        GRID = self._GRID
        # 经度跨距会按余弦衰减，使用保守换算比例（考虑地球最高可能纬度或者局部）
        cos_lat = math.cos(math.radians(lat))
        meters_per_deg_lon = 111320.0 * cos_lat
        if meters_per_deg_lon < 10000:  # 极地保护
            meters_per_deg_lon = 10000
            
        deg_span = max(max_radius_m / meters_per_deg_lon, GRID) + GRID * 2
        
        lat0 = int((lat - deg_span) / GRID)
        lat1 = int((lat + deg_span) / GRID) + 1
        lon0 = int((lon - deg_span) / GRID)
        lon1 = int((lon + deg_span) / GRID) + 1
        result = []
        for blat in range(lat0, lat1 + 1):
            for blon in range(lon0, lon1 + 1):
                result.extend(self._grid.get((blat, blon), []))
        return result

    def point_in_any(self, lat: float, lon: float, buffer_m: float = 0.0) -> bool:
        """判断点是否在任意禁飞区内"""
        max_r = self.max_radius_m + buffer_m
        for z in self._nearby_zones(lat, lon, max_r):
            if z.contains_point(lat, lon, buffer_m):
                return True
        return False

    def which_zones_contain_point(self, lat: float, lon: float, buffer_m: float = 0.0) -> list[NoFlyZone]:
        """返回包含该点的所有禁飞区"""
        max_r = self.max_radius_m + buffer_m
        return [z for z in self._nearby_zones(lat, lon, max_r)
                if z.contains_point(lat, lon, buffer_m)]

    def segment_intersects_any(self, p1_lat, p1_lon, p2_lat, p2_lon, buffer_m: float = 0.0, segment_half_len: float = -1.0) -> bool:
        """判断线段是否与任意禁飞区相交
        
        Args:
            segment_half_len: 【性能优化 P2-10】可选预计算半长（米），避免在热路径中重复调用 haversine_m
        """
        mid_lat = (p1_lat + p2_lat) / 2
        mid_lon = (p1_lon + p2_lon) / 2
        half_len = segment_half_len if segment_half_len >= 0 else haversine_m(p1_lat, p1_lon, p2_lat, p2_lon) / 2
        max_r = self.max_radius_m + buffer_m
        for z in self._nearby_zones(mid_lat, mid_lon, max_r + half_len):
            if z.intersects_segment(p1_lat, p1_lon, p2_lat, p2_lon, buffer_m):
                return True
        return False

    def __len__(self):
        return len(self.zones)
