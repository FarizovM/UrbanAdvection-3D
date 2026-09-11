import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session
import math

def calculate_city_idw(payload: dict, db: Session):
    # Fetch posts with their latest observations
    query = text("""
        SELECT
            p.id,
            ST_X(p.location::geometry) AS lng,
            ST_Y(p.location::geometry) AS lat,
            o.wind_from_deg,
            o.wind_speed_ms,
            o.pm25_ug_m3,
            o.no2_ug_m3,
            o.pm10_ug_m3
        FROM monitoring_posts p
        LEFT JOIN LATERAL (
            SELECT wind_from_deg, wind_speed_ms, pm25_ug_m3, no2_ug_m3, pm10_ug_m3
            FROM monitoring_observations
            WHERE post_id = p.id
            ORDER BY observed_at DESC
            LIMIT 1
        ) o ON true;
    """)
    result = db.execute(query).mappings().all()
    
    if not result:
        return {"voxels": [], "maxValue": 0}
        
    posts = []
    for r in result:
        # Fallback AQI to 10 if missing
        aqi = r["pm25_ug_m3"]
        if aqi is None: aqi = r["no2_ug_m3"]
        if aqi is None: aqi = r["pm10_ug_m3"]
        if aqi is None: aqi = 10.0
        
        posts.append({
            "lng": r["lng"],
            "lat": r["lat"],
            "wind_from_deg": r["wind_from_deg"] or 0.0,
            "wind_speed_ms": r["wind_speed_ms"] or 0.0,
            "aqi": aqi
        })

    # Determine bounds
    min_lng = min(p["lng"] for p in posts) - 0.05
    max_lng = max(p["lng"] for p in posts) + 0.05
    min_lat = min(p["lat"] for p in posts) - 0.05
    max_lat = max(p["lat"] for p in posts) + 0.05
    
    # Approx degrees per meter (very rough, local approximation)
    resolution_lat_deg = 100.0 / 111000.0
    
    # We use min_lat for approximation
    avg_lat = (min_lat + max_lat) / 2.0
    cos_lat = math.cos(math.radians(avg_lat))
    resolution_lng_deg = 100.0 / (111000.0 * cos_lat)
    
    lngs = np.arange(min_lng, max_lng, resolution_lng_deg)
    lats = np.arange(min_lat, max_lat, resolution_lat_deg)
    
    if len(lngs) == 0 or len(lats) == 0:
        return {"voxels": [], "maxValue": 0}

    # Create meshgrid
    LNG, LAT = np.meshgrid(lngs, lats)
    
    num_grid = np.zeros_like(LNG)
    den_grid = np.zeros_like(LNG)
    
    alpha_factor = 2.0
    
    for p in posts:
        dy = LAT - p["lat"]
        dx = (LNG - p["lng"]) * cos_lat
        
        # dist is in degrees
        dist = np.sqrt(dx**2 + dy**2)
        dist[dist < 1e-6] = 1e-6
        
        angle_rad = np.arctan2(dx, dy)
        angle_deg = (np.degrees(angle_rad) + 360) % 360
        
        wind_to_deg = (p["wind_from_deg"] + 180) % 360
        
        theta = np.abs(wind_to_deg - angle_deg)
        theta = np.minimum(theta, 360 - theta)
        
        alpha = p["wind_speed_ms"] * alpha_factor
        theta_rad = np.radians(theta)
        penalty = 1.0 + alpha * (np.sin(theta_rad / 2.0)**2)
        
        penalized_dist = dist * penalty
        weight = 1.0 / (penalized_dist**2)
        
        num_grid += weight * p["aqi"]
        den_grid += weight
        
    mask = den_grid > 0
    idw_values = np.zeros_like(LNG)
    idw_values[mask] = num_grid[mask] / den_grid[mask]
    
    max_val = float(np.max(idw_values)) if idw_values.size > 0 else 0.0
    
    voxels = []
    valid_lngs = LNG[mask]
    valid_lats = LAT[mask]
    valid_vals = idw_values[mask]
    
    for i in range(len(valid_vals)):
        val = float(valid_vals[i])
        voxels.append({
            "position": [float(valid_lngs[i]), float(valid_lats[i]), 0.0],
            "value": val,
            "normalized": val / max_val if max_val > 0 else 0
        })

    return {
        "mode": "city-idw",
        "value_unit": "мкг/м³",
        "max_value": max_val,
        "steps": 1,
        "time_s": 0,
        "terrain": {"min_m": 0, "max_m": 0, "building_count": 0},
        "grid": {"nx": 0, "ny": 0, "nz": 0, "resolution_m": 100, "vertical_resolution_m": 10},
        "wind": {"from_deg": 0, "to_deg": 0, "speed_ms": 0},
        "voxels": voxels,
        "wind_streamlines": []
    }
