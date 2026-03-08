import sys
from pathlib import Path

ROOT = Path("d:/develop/demo")
sys.path.insert(0, str(ROOT))

from trajectory_lab.core.poi_loader import load_city_pois
from trajectory_lab.core.planner import _astar_path, _smooth_path

def main():
    city_pois = load_city_pois("shenzhen", buffer_m=0.0)
    nfz_index = city_pois.nfz_index
    
    a = next((p for p in city_pois.demand_clean if p.poi_id == "1445892883"), None)
    b = next((p for p in city_pois.demand_clean if p.poi_id == "543049665"), None)
    
    if not a or not b:
        print("POI not found")
        return
        
    print(f"a: {a.lat}, {a.lon}")
    print(f"b: {b.lat}, {b.lon}")
    
    path1 = _astar_path(a.lat, a.lon, b.lat, b.lon, nfz_index, buffer_m=10.0)
    print(f"A* returned {len(path1)} points")
    
    if len(path1) <= 2:
        print("A* FAILED to find a path!")
        return

if __name__ == "__main__":
    main()
