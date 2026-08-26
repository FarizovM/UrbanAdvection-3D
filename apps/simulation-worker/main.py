import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

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

@app.get("/api/nearest-post")
def api_get_nearest_post(lat: float, lng: float, radius_km: float = 3.0):
    """
    Пошук постів моніторингу в радіусі 3 км та отримання їхніх даних.
    """
    # TODO: Запит через ST_DWithin до PostGIS
    return {"status": "success", "data": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)