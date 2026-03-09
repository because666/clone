import pandas as pd
import numpy as np
import json
import math
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import joblib

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Radius of earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def train_model():
    print("Loading flight detail data...")
    # This might take a bit to load 15MB of CSV
    df = pd.read_csv('../data/processed/airlab_energy/flights_detail.csv')
    
    # We will use airspeed, vertspd, and payload to predict power
    features = ['airspeed', 'vertspd', 'payload']
    target = 'power'
    
    # Clean data just in case
    df = df.dropna(subset=features + [target])
    
    X = df[features]
    y = df[target]
    
    print("Splitting data...")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training RandomForest Regressor...")
    model = RandomForestRegressor(n_estimators=50, max_depth=10, n_jobs=-1, random_state=42)
    model.fit(X_train, y_train)
    
    print("Evaluating model...")
    y_pred = model.predict(X_test)
    rmse = math.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"RMSE: {rmse:.2f} W, R2: {r2:.4f}")
    
    # Save the model for future use
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/energy_rf_model.pkl')
    return model

def predict_energy_for_trajectories(model, city='shenzhen'):
    traj_path = f'../data/processed/trajectories/{city}_uav_trajectories.json'
    out_path = f'../data/processed/{city}_energy_predictions.json'
    
    print(f"Loading trajectories from {traj_path}...")
    with open(traj_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    trajectories = data.get('trajectories', [])
    if not trajectories:
        print("No trajectories found!")
        return
        
    predictions = {}
    
    # Assumption for Battery: Let's assume a typical delivery drone capacity
    # e.g., 100 Wh = 360000 Joules full charge for a compact drone like DJI Mavic 3
    # Or for a slightly larger one maybe 200 Wh (720,000 W*s)
    BATTERY_CAPACITY_WS = 360000.0 
    
    print(f"Generating predictions for {len(trajectories)} flights...")
    for traj in trajectories:
        flight_id = traj['id']
        path = traj['path']
        timestamps = traj['timestamps']
        
        n_points = len(path)
        if n_points < 2:
            continue
            
        # Assign a random payload (0.0 to 3.0 kg)
        payload = round(np.random.uniform(0.0, 3.0), 2)
        
        powers = []
        battery_pct = []
        
        current_battery_ws = BATTERY_CAPACITY_WS
        # Start at 100% (with slight random variation for realism, maybe 95-100)
        start_pct = np.random.uniform(90.0, 100.0)
        current_battery_ws = current_battery_ws * (start_pct / 100.0)
        
        features_list = []
        dt_list = []
        
        for i in range(n_points):
            if i == 0:
                dt = timestamps[1] - timestamps[0]
                lon1, lat1, alt1 = path[0]
                lon2, lat2, alt2 = path[1]
            else:
                dt = timestamps[i] - timestamps[i-1]
                lon1, lat1, alt1 = path[i-1]
                lon2, lat2, alt2 = path[i]
                
            if dt <= 0:
                dt = 1.0 # fallback
                
            distance = haversine_distance(lat1, lon1, lat2, lon2)
            d_alt = alt2 - alt1
            
            # Simplified airspeed (horizontal speed) and vertspd
            airspeed = distance / dt
            vertspd = d_alt / dt
            
            features_list.append([airspeed, vertspd, payload])
            dt_list.append(dt)
            
        # Bulk predict
        X_infer = pd.DataFrame(features_list, columns=['airspeed', 'vertspd', 'payload'])
        pred_powers = model.predict(X_infer)
        
        # Calculate battery drain
        for i in range(n_points):
            pwr = pred_powers[i]
            # Add some noise to make it look realistic and less perfectly smooth
            pwr += np.random.normal(0, pwr * 0.05) 
            # clamp min power (drone still needs power to hover/descend)
            pwr = max(50.0, pwr) 
            powers.append(round(pwr, 2))
            
            # Drain energy
            consumed = pwr * dt_list[i]
            current_battery_ws -= consumed
            
            pct = (current_battery_ws / BATTERY_CAPACITY_WS) * 100.0
            battery_pct.append(round(max(0.0, pct), 2))
            
        predictions[flight_id] = {
            "payload": payload,
            "power": powers,
            "battery": battery_pct
        }
    
    print(f"Saving predictions to {out_path}...")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(predictions, f)
        
    print("Done!")

if __name__ == "__main__":
    model_path = 'models/energy_rf_model.pkl'
    if os.path.exists(model_path):
        print("Loading existing model...")
        model = joblib.load(model_path)
    else:
        model = train_model()
        
    predict_energy_for_trajectories(model, city='shenzhen')
