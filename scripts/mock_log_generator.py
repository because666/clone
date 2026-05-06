import time
import random
import datetime

agents = [f"UAV-{str(i).zfill(4)}" for i in range(1000)]
actions = [
    "[A* Engine] Calculating 3D route for {agent}. Grid spacing: 0.0005. Target: POI-{target}",
    "[CollisionCheck] Checking intersection with NFZ (No-Fly Zone) polygons for {agent}... CLEAR.",
    "[Planner] Bezier smoothing applied to 45 waypoints for {agent}.",
    "[SSE Push] Streaming 450 bytes of position diffs to connected clients (Buffer: 40/100).",
    "[Agent State] {agent} battery level {battery}%. Wind speed 12m/s affecting consumption.",
    "[Dispatcher] Assigning new high-priority package routing to {agent}. Re-evaluating cost matrix.",
    "[SSE Push] Heartbeat sent. Active streams: 12.",
    "[Database] Persisting trajectory snapshot to PgSQL (batch size: 100)... OK.",
    "[A* Engine] Cache hit for static obstacle nodes at (106.502, 29.531, 120m).",
    "[Risk Model] {agent} proximity warning! Distance to nearest UAV: {dist}m. Adjusting altitude by +15m."
]

print("Starting AetherWeave Agent Dispatch Engine...")
print("Initializing 3D Spatial Grid [106.4, 29.5, 0] -> [106.6, 29.7, 500]")
print("Listening for SSE connections on 0.0.0.0:5001")
print("================================================================")
time.sleep(1)

try:
    while True:
        agent = random.choice(agents)
        target = random.randint(100, 999)
        battery = random.randint(15, 100)
        dist = random.randint(5, 50)
        
        msg = random.choice(actions).format(agent=agent, target=target, battery=battery, dist=dist)
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        level = random.choices(["INFO", "DEBUG", "WARNING"], weights=[0.7, 0.2, 0.1])[0]
        
        # Color codes for terminal
        if level == "INFO":
            level_str = "\033[92mINFO\033[0m"
        elif level == "WARNING":
            level_str = "\033[93mWARNING\033[0m"
        else:
            level_str = "\033[94mDEBUG\033[0m"
            
        print(f"{timestamp}  {level_str}  {msg}")
        time.sleep(random.uniform(0.01, 0.15))
except KeyboardInterrupt:
    pass
