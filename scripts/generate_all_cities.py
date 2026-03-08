import subprocess
import os
import sys

# Define the list of cities
CITIES = ["shenzhen", "beijing", "shanghai", "guangzhou", "chengdu", "chongqing"]

# Get the scripts directory
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

def run_script(script_name, city):
    script_path = os.path.join(SCRIPTS_DIR, script_name)
    print(f"\n[{city.upper()}] Running {script_name}...")
    
    # Use the same python executable that is running this script
    python_exe = sys.executable
    
    try:
        subprocess.run([python_exe, script_path, "--city", city], check=True)
        print(f"[{city.upper()}] Successfully finished {script_name}.")
    except subprocess.CalledProcessError as e:
        print(f"[{city.upper()}] Error running {script_name}! Exiting.")
        sys.exit(1)

def main():
    print("Starting full logistics trajectory generation for all cities...")
    
    for city in CITIES:
        print("=" * 60)
        print(f"Processing City: {city}")
        print("=" * 60)
        
        run_script("generate_logistics_trajectories.py", city)
        run_script("energy_model.py", city)
        run_script("prepare_frontend_data.py", city)
        
    print("\n" + "=" * 60)
    print("All cities processed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()
