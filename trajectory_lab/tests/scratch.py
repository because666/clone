import sys
from pathlib import Path

ROOT = Path("d:/develop/demo")
sys.path.insert(0, str(ROOT))

from trajectory_lab.core.poi_loader import load_city_pois
from trajectory_lab.core.planner import plan, _astar_path, _smooth_path
from trajectory_lab.core.geo_utils import interpolate_segment

def main():
    city_pois = load_city_pois("shenzhen", buffer_m=0.0)
    clean = city_pois.demand_clean
    nfz_index = city_pois.nfz_index
    
    import random
    rng = random.Random(42)
    attempts = 0
    while attempts < 100:
        attempts += 1
        a, b = rng.sample(clean, 2)
        res = plan(a.lat, a.lon, b.lat, b.lon, nfz_index=nfz_index)
        if res.nfz_violations > 0:
            print(f"Found violation: a={a.poi_id} ({a.lat}, {a.lon}) to b={b.poi_id} ({b.lat}, {b.lon})")
            
            path1 = _astar_path(a.lat, a.lon, b.lat, b.lon, nfz_index, buffer_m=10.0)
            
            print("1. Checking A* path...")
            for i in range(len(path1) - 1):
                p1, p2 = path1[i], path1[i+1]
                if nfz_index.segment_intersects_any(p1[0], p1[1], p2[0], p2[1], -2.0):
                    print(f"  A* collision segment {i}")
            
            print("2. Checking smoothed path...")
            path2 = _smooth_path(path1, nfz_index, buffer_m=10.0)
            for i in range(len(path2) - 1):
                p1, p2 = path2[i], path2[i+1]
                if nfz_index.segment_intersects_any(p1[0], p1[1], p2[0], p2[1], -2.0):
                    print(f"  Smooth collision segment {i}")
                    
            print("3. Checking interpolated raw path...")
            raw_points = []
            for i in range(len(path2) - 1):
                p1, p2 = path2[i], path2[i+1]
                seg = interpolate_segment(p1[0], p1[1], p2[0], p2[1], min(15.0, 100.0))
                if raw_points and seg:
                    seg = seg[1:]
                raw_points.extend(seg)
            if not raw_points:
                raw_points.append(a)
            raw_points.append(b)
            
            for i in range(len(raw_points) - 1):
                p1 = raw_points[i]
                if type(p1) is not tuple: p1 = (p1.lat, p1.lon)
                p2 = raw_points[i+1]
                if type(p2) is not tuple: p2 = (p2.lat, p2.lon)
                if nfz_index.segment_intersects_any(p1[0], p1[1], p2[0], p2[1], -2.0):
                    print(f"  RAW points collision segment {i} ({p1} to {p2})")
                    for z in nfz_index.zones:
                        if z.intersects_segment(p1[0], p1[1], p2[0], p2[1], -2.0):
                            print(f"    Collides with {z.name} r={z.radius_m}")
            break

if __name__ == "__main__":
    main()
