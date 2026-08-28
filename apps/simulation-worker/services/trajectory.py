import math
import random
import numpy as np
from typing import Dict, Any
from sqlalchemy.orm import Session
from .dispersion import _load_building_height_grid

def calculate_reverse_trajectory(payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
    lng = float(payload.get("lng", 0.0))
    lat = float(payload.get("lat", 0.0))
    wind_from_deg = float(payload.get("wind_from_deg", 270.0))
    wind_speed_ms = float(payload.get("wind_speed_ms", 3.0))
    duration_s = float(payload.get("duration_s", 600.0))
    
    num_particles = 150
    dt = 5.0
    steps = int(duration_s / dt)
    
    wind_to_deg = (wind_from_deg + 180) % 360
    wind_to_rad = math.radians(wind_to_deg)
    u_wind = wind_speed_ms * math.sin(wind_to_rad)
    v_wind = wind_speed_ms * math.cos(wind_to_rad)
    
    # Reverse velocity
    u_rev = -u_wind
    v_rev = -v_wind
    
    lat_m = 111320.0
    lng_m = 111320.0 * math.cos(math.radians(lat))
    
    particles = [{"path": [[lng, lat, 0.0]]} for _ in range(num_particles)]
    
    radius_m = min(max(wind_speed_ms * duration_s * 1.5, 1000), 4000)
    resolution_m = 20.0
    min_x = -radius_m
    min_y = -radius_m
    nx = int(2 * radius_m / resolution_m)
    ny = int(2 * radius_m / resolution_m)
    
    try:
        height_grid, _ = _load_building_height_grid(
            db, lng, lat, radius_m, min_x, min_y, nx, ny, resolution_m
        )
    except Exception:
        height_grid = np.zeros((ny, nx), dtype=np.float32)
    
    for p in particles:
        px = 0.0
        py = 0.0
        for step in range(1, steps + 1):
            # random walk (turbulent dispersion)
            dx = (u_rev + random.gauss(0, 1.5)) * dt
            dy = (v_rev + random.gauss(0, 1.5)) * dt
            
            new_px = px + dx
            new_py = py + dy
            
            grid_x = int((new_px - min_x) / resolution_m)
            grid_y = int((new_py - min_y) / resolution_m)
            
            hit_building = False
            if 0 <= grid_x < nx and 0 <= grid_y < ny:
                if height_grid[grid_y, grid_x] > 5.0:
                    hit_building = True
            
            if hit_building:
                grid_x_only = int((new_px - min_x) / resolution_m)
                grid_y_old = int((py - min_y) / resolution_m)
                if 0 <= grid_x_only < nx and 0 <= grid_y_old < ny and height_grid[grid_y_old, grid_x_only] <= 5.0:
                    new_py = py 
                else:
                    grid_x_old = int((px - min_x) / resolution_m)
                    grid_y_only = int((new_py - min_y) / resolution_m)
                    if 0 <= grid_x_old < nx and 0 <= grid_y_only < ny and height_grid[grid_y_only, grid_x_old] <= 5.0:
                        new_px = px 
                    else:
                        new_px = px
                        new_py = py
            
            px = new_px
            py = new_py
            
            current_lng = lng + px / lng_m
            current_lat = lat + py / lat_m
            timestamp = step * dt
            p["path"].append([current_lng, current_lat, timestamp])
            
    return {"particles": particles}
