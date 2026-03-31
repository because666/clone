"""
geo_utils.py — 地理工具函数

提供 haversine 距离、经纬度↔平面米坐标转换等基础工具。
"""
import math

EARTH_R = 6371000.0          # 地球半径（米）
METERS_PER_DEG_LAT = 111320.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """计算两点之间的 Haversine 距离（米）"""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def cos_lat(lat: float) -> float:
    """返回给定纬度的余弦值（用于经度→米转换）"""
    return math.cos(math.radians(lat))


def latlon_to_meters(lat: float, lon: float, ref_lat: float, ref_lon: float, cos_ref: float):
    """
    将经纬度转为以 (ref_lat, ref_lon) 为原点的平面米坐标。
    返回 (mx, my)，单位：米。
    """
    mx = (lon - ref_lon) * METERS_PER_DEG_LAT * cos_ref
    my = (lat - ref_lat) * METERS_PER_DEG_LAT
    return mx, my


def meters_to_latlon(mx: float, my: float, ref_lat: float, ref_lon: float, cos_ref: float):
    """
    将平面米坐标转回经纬度。
    返回 (lat, lon)。
    """
    lat = ref_lat + my / METERS_PER_DEG_LAT
    lon = ref_lon + mx / (METERS_PER_DEG_LAT * cos_ref)
    return lat, lon


def interpolate_segment(lat1: float, lon1: float, lat2: float, lon2: float, step_m: float = 3.0) -> list:
    """
    在两点之间按固定步长线性插值。
    返回 [(lat, lon), ...] 列表，包含起点，不重复包含终点（便于拼接）。
    """
    dist = haversine_m(lat1, lon1, lat2, lon2)
    if dist < step_m:
        return [(lat1, lon1)]
    n = max(1, int(dist / step_m))
    points = []
    for i in range(n):
        t = i / n
        points.append((lat1 + t * (lat2 - lat1), lon1 + t * (lon2 - lon1)))
    return points


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """计算从点1到点2的方位角（度，正北为0，顺时针）"""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(math.radians(lat2))
    y = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360
