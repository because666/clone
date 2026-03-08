import sys
from pathlib import Path
import math

ROOT = Path("d:/develop/demo")
sys.path.insert(0, str(ROOT))

from trajectory_lab.core.poi_loader import load_city_pois
from trajectory_lab.core.geo_utils import haversine_m

city_pois = load_city_pois("shenzhen")
blocked = city_pois.demand_blocked

print(f"Total demand: {len(city_pois.demand_all)}")
print(f"Blocked: {len(blocked)}")

# 查看前5个 blocked 的原因
for point in blocked[:5]:
    closest_dist = float('inf')
    closest_zone = None
    for zone in city_pois.nfz_index.zones:
        d = haversine_m(point.lat, point.lon, zone.lat, zone.lon)
        if d < closest_dist:
            closest_dist = d
            closest_zone = zone
    print(f"Point {point.poi_id} ({point.lat:.5f}, {point.lon:.5f}) is blocked.")
    if closest_zone:
        print(f"  Closest zone: {closest_zone.name} ({closest_zone.lat:.5f}, {closest_zone.lon:.5f}) - category: {closest_zone.category}, radius: {closest_zone.radius_m}")
        print(f"  Distance: {closest_dist:.2f}m")
    
    # 检查 haversine_m 的具体数值
    print(f"  Verify Distance:")
    lat1, lon1 = point.lat, point.lon
    lat2, lon2 = closest_zone.lat, closest_zone.lon
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    d_verified = 2 * 6371000.0 * math.asin(math.sqrt(a))
    print(f"  Verified H-dist: {d_verified:.2f}m")
    
    # 简单的欧拉距离近似 (度转米)
    dx = (lon2 - lon1) * 111320.0 * math.cos(math.radians(lat1))
    dy = (lat2 - lat1) * 111320.0
    approx_dist = math.hypot(dx, dy)
    print(f"  Approx Flat Dist: {approx_dist:.2f}m\n")
