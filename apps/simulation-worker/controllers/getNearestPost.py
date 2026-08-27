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
            id, 
            name, 
            ST_X(location::geometry) as lng, 
            ST_Y(location::geometry) as lat,
            ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) as distance_m
        FROM monitoring_posts
        WHERE ST_DWithin(
            location::geography, 
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, 
            :radius
        )
        ORDER BY distance_m ASC;
    """)
    
    # Виконуємо запит із захистом від SQL-ін'єкцій (передача параметрів через словник)
    result = db.execute(query, {"lat": lat, "lng": lng, "radius": radius_m}).mappings().all()
    
    # Повертаємо список словників для зручної конвертації у JSON у FastAPI
    return [dict(row) for row in result]