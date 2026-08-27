import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from controllers.getNearestPost import get_nearest_posts

app = FastAPI(title="UrbanAdvection-3D Simulation Engine")

# Дозволяємо CORS для взаємодії з нашим React-фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Моделі даних для вхідних запитів
class SimulationParams(BaseModel):
    lat: float
    lng: float
    wind_dir: float
    wind_speed: float
    air_temp: Optional[float] = None
    bg_temp: Optional[float] = None

@app.post("/api/temperature-plume")
def api_get_temp_plume(params: SimulationParams):
    """
    Генерація температурного плюму.
    Тут будемо діставати 3D-будівлі з PostGIS, формувати матрицю перешкод
    і розв'язувати диференціальні рівняння для поля температур.
    """
    # TODO: Додати підключення до БД, витягування геометрії та математику
    return {"status": "success", "message": "Temperature plume calculated"}

@app.post("/api/plume")
def api_get_plume(params: SimulationParams):
    """
    Генерація плюму забруднення (PM2.5, NO2 тощо).
    """
    # TODO: Логіка дисперсії забруднювачів
    return {"status": "success", "message": "Pollution plume calculated"}

@app.get("/api/posts")
def api_get_all_posts(db: Session = Depends(get_db)):
    """
    Отримання всіх доступних постів моніторингу з бази даних.
    """
    query = text("""
        SELECT 
            id, 
            name, 
            ST_X(location::geometry) as lng, 
            ST_Y(location::geometry) as lat
        FROM monitoring_posts;
    """)
    
    result = db.execute(query).mappings().all()
    return {"status": "success", "data": [dict(row) for row in result]}

@app.get("/api/nearest-post")
def api_get_nearest_post(lat: float, lng: float, radius_km: float = 3.0, db: Session = Depends(get_db)):
    radius_m = radius_km * 1000
    posts = get_nearest_posts(lat, lng, radius_m, db)
    return {"status": "success", "data": posts}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)