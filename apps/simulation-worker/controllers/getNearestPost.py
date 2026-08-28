from sqlalchemy.orm import Session
from sqlalchemy import text

def get_nearest_posts(lat: float, lng: float, radius_m: float, db: Session):
    """
    Адаптований алгоритм з дипломної роботи для пошуку найближчих постів.
    Використовує PostGIS функції ST_DWithin та ST_Distance з приведенням до geography
    для точних розрахунків у метрах.
    """
    query = text("""
        SELECT
            p.id,
            p.name,
            ST_X(p.location::geometry) AS lng,
            ST_Y(p.location::geometry) AS lat,
            o.wind_from_deg,
            o.wind_speed_ms,
            o.air_temp_c,
            o.background_temp_c,
            o.pm25_ug_m3,
            o.no2_ug_m3,
            o.pm10_ug_m3,
            o.co2_ppm,
            o.humidity_pct,
            o.observed_at,
            ST_Distance(
                p.location::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) AS distance_m
        FROM monitoring_posts p
        LEFT JOIN LATERAL (
            SELECT wind_from_deg, wind_speed_ms, air_temp_c,
                   background_temp_c, pm25_ug_m3, no2_ug_m3,
                   pm10_ug_m3, co2_ppm, humidity_pct, observed_at
            FROM monitoring_observations
            WHERE post_id = p.id
            ORDER BY observed_at DESC
            LIMIT 1
        ) o ON true
        WHERE ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, 
            :radius
        )
        ORDER BY distance_m ASC;
    """)
    
    # Виконуємо запит із захистом від SQL-ін'єкцій (передача параметрів через словник)
    result = db.execute(query, {"lat": lat, "lng": lng, "radius": radius_m}).mappings().all()
    
    # Повертаємо список словників для зручної конвертації у JSON у FastAPI
    return [dict(row) for row in result]
