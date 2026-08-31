import asyncio
import json
import random
import uvicorn
from contextlib import suppress
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Literal, Optional
from celery_worker import run_dispersion_task

from database import SessionLocal, get_db
from controllers.getNearestPost import get_nearest_posts
from services.dispersion import calculate_dispersion
from services.trajectory import calculate_reverse_trajectory

POST_GENERATOR_INTERVAL_SECONDS = 300
app = FastAPI(title="UrbanAdvection-3D Simulation Engine")

# Дозволяємо CORS для взаємодії з нашим React-фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Моделі даних для вхідних запитів
class SimulationParams(BaseModel):
    station_id: Optional[str] = None
    source: Optional[dict] = None
    lng: Optional[float] = None
    lat: Optional[float] = None
    wind_from_deg: Optional[float] = Field(default=None, ge=0, lt=360)
    wind_speed_ms: Optional[float] = Field(default=None, ge=0)
    radius_m: float = Field(default=3000, ge=100, le=5000)
    resolution_m: float = Field(default=50, ge=10, le=100)
    vertical_resolution_m: float = Field(default=10, ge=2, le=25)
    z_max_m: float = Field(default=240, ge=30, le=1000)
    duration_s: float = Field(default=300, ge=1, le=1800)
    wind_reference_height_m: float = Field(default=10, ge=2, le=100)
    roughness_m: float = Field(default=1, ge=0.05, le=20)
    horizontal_diffusivity_m2_s: float = Field(default=10, ge=0, le=500)
    vertical_diffusivity_m2_s: float = Field(default=2, ge=0, le=100)
    mode: Literal["pollution", "heat"] = "pollution"


class ObservationParams(BaseModel):
    observed_at: Optional[datetime] = None
    wind_from_deg: float = Field(ge=0, lt=360)
    wind_speed_ms: float = Field(ge=0)
    air_temp_c: Optional[float] = None
    background_temp_c: Optional[float] = None
    pm25_ug_m3: Optional[float] = None
    no2_ug_m3: Optional[float] = None
    pm10_ug_m3: Optional[float] = None
    co2_ppm: Optional[float] = None
    humidity_pct: Optional[float] = None


def _random_measurement(minimum: float, maximum: float) -> float:
    return round(random.uniform(minimum, maximum), 2)


def generate_monitoring_observations(db: Session, post_ids: Optional[list[str]] = None) -> int:
    """Generate one realistic-looking reading for every configured post."""
    ids = post_ids if post_ids is not None else db.execute(
        text("SELECT id FROM monitoring_posts ORDER BY id")
    ).scalars().all()
    if not ids:
        return 0

    observed_at = datetime.now(timezone.utc)
    rows = []
    for post_id in ids:
        air_temp = _random_measurement(15, 40)
        rows.append(
            {
                "id": uuid4().hex,
                "post_id": post_id,
                "observed_at": observed_at,
                "wind_from_deg": _random_measurement(0, 359.99),
                "wind_speed_ms": _random_measurement(0.3, 8),
                "air_temp_c": air_temp,
                "background_temp_c": round(air_temp + random.uniform(-1, 1), 2),
                "pm25_ug_m3": _random_measurement(5, 30),
                "no2_ug_m3": _random_measurement(5, 60),
                "pm10_ug_m3": _random_measurement(10, 80),
                "co2_ppm": _random_measurement(400, 600),
                "humidity_pct": _random_measurement(40, 70),
            }
        )

    db.execute(
        text(
            """
            INSERT INTO monitoring_observations (
                id, post_id, observed_at, wind_from_deg, wind_speed_ms,
                air_temp_c, background_temp_c, pm25_ug_m3, no2_ug_m3,
                pm10_ug_m3, co2_ppm, humidity_pct
            ) VALUES (
                :id, :post_id, :observed_at, :wind_from_deg, :wind_speed_ms,
                :air_temp_c, :background_temp_c, :pm25_ug_m3, :no2_ug_m3,
                :pm10_ug_m3, :co2_ppm, :humidity_pct
            )
            """
        ),
        rows,
    )
    db.commit()
    return len(rows)


async def _post_generator_loop() -> None:
    while True:
        await asyncio.sleep(POST_GENERATOR_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            asyncio.to_thread(generate_monitoring_observations, db)
        except Exception:
            db.rollback()
        finally:
            db.close()


@app.on_event("startup")
async def start_post_generator() -> None:
    db = SessionLocal()
    try:
        missing_post_ids = db.execute(
            text(
                """
                SELECT p.id
                FROM monitoring_posts p
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM monitoring_observations o
                    WHERE o.post_id = p.id
                )
                ORDER BY p.id
                """
            )
        ).scalars().all()
        if missing_post_ids:
            asyncio.to_thread(generate_monitoring_observations, db, missing_post_ids)
    except Exception:
        db.rollback()
    finally:
        db.close()
    app.state.post_generator_task = asyncio.create_task(_post_generator_loop())


@app.on_event("shutdown")
async def stop_post_generator() -> None:
    task = getattr(app.state, "post_generator_task", None)
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


@app.post("/api/temperature-plume")
def api_get_temp_plume(params: SimulationParams, db: Session = Depends(get_db)):
    """
    Генерація температурного плюму.
    Тут будемо діставати 3D-будівлі з PostGIS, формувати матрицю перешкод
    і розв'язувати диференціальні рівняння для поля температур.
    """
    payload = params.model_dump() if hasattr(params, "model_dump") else params.dict()
    payload["mode"] = "heat"
    try:
        return {"status": "success", "result": calculate_dispersion(payload, db)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/plume")
def api_get_plume(params: SimulationParams, db: Session = Depends(get_db)):
    """
    Генерація плюму забруднення (PM2.5, NO2 тощо).
    """
    payload = params.model_dump() if hasattr(params, "model_dump") else params.dict()
    payload["mode"] = "pollution"
    try:
        return {"status": "success", "result": calculate_dispersion(payload, db)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/reverse-trajectory")
def api_reverse_trajectory(params: SimulationParams, db: Session = Depends(get_db)):
    """
    Зворотне трасування для знаходження джерела забруднення.
    """
    payload = params.model_dump() if hasattr(params, "model_dump") else params.dict()
    try:
        return {"status": "success", "result": calculate_reverse_trajectory(payload, db)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/dispersion", status_code=202)
def api_get_dispersion(params: SimulationParams, db: Session = Depends(get_db)):
    """Run the interactive 3D terrain/building-aware calculation."""
    payload = params.model_dump() if hasattr(params, "model_dump") else params.dict()
    run_id = uuid4().hex
    db.execute(
        text(
            """
            INSERT INTO simulation_runs (id, status, mode, request_payload, started_at)
            VALUES (:id, 'PENDING', :mode, CAST(:request_payload AS jsonb), now())
            """
        ),
        {
            "id": run_id,
            "mode": payload.get("mode", "pollution"),
            "request_payload": json.dumps(payload, default=str),
        },
    )
    db.commit()
    # ВІДПРАВЛЯЄМО ЗАДАЧУ В ЧЕРГУ (не чекаючи результату)
    run_dispersion_task.delay(run_id, payload)
    
    return {"status": "pending", "run_id": run_id}


@app.get("/api/dispersion/{run_id}")
def api_get_dispersion_status(run_id: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT status, result_payload, error_message FROM simulation_runs WHERE id = :id"), 
        {"id": run_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    return {
        "status": row["status"],
        "result": row["result_payload"],
        "error": row["error_message"]
    }


'''
@app.get("/api/posts")
def api_get_all_posts(db: Session = Depends(get_db)):
    """
    Отримання всіх доступних постів моніторингу з бази даних.
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
            o.observed_at
        FROM monitoring_posts p
        LEFT JOIN LATERAL (
            SELECT wind_from_deg, wind_speed_ms, air_temp_c,
                   background_temp_c, pm25_ug_m3, no2_ug_m3,
                   pm10_ug_m3, co2_ppm, humidity_pct, observed_at
            FROM monitoring_observations
            WHERE post_id = p.id
            ORDER BY observed_at DESC
            LIMIT 1
        ) o ON true;
    """)
    
    result = db.execute(query).mappings().all()
    return {"status": "success", "data": [dict(row) for row in result]}
'''

@app.post("/api/posts/{post_id}/observations")
def api_add_observation(post_id: str, params: ObservationParams, db: Session = Depends(get_db)):
    """Ingest one observation from a station or a connected sensor."""
    observed_at = params.observed_at or datetime.now(timezone.utc)
    row = db.execute(
        text(
            """
            INSERT INTO monitoring_observations (
                id, post_id, observed_at, wind_from_deg, wind_speed_ms,
                air_temp_c, background_temp_c, pm25_ug_m3, no2_ug_m3,
                pm10_ug_m3, co2_ppm, humidity_pct
            ) VALUES (
                :id, :post_id, :observed_at, :wind_from_deg, :wind_speed_ms,
                :air_temp_c, :background_temp_c, :pm25_ug_m3, :no2_ug_m3,
                :pm10_ug_m3, :co2_ppm, :humidity_pct
            )
            RETURNING id, post_id, observed_at, wind_from_deg, wind_speed_ms,
                      air_temp_c, background_temp_c, pm25_ug_m3, no2_ug_m3,
                      pm10_ug_m3, co2_ppm, humidity_pct
            """
        ),
        {
            "id": uuid4().hex,
            "post_id": post_id,
            "observed_at": observed_at,
            "wind_from_deg": params.wind_from_deg,
            "wind_speed_ms": params.wind_speed_ms,
            "air_temp_c": params.air_temp_c,
            "background_temp_c": params.background_temp_c,
            "pm25_ug_m3": params.pm25_ug_m3,
            "no2_ug_m3": params.no2_ug_m3,
            "pm10_ug_m3": params.pm10_ug_m3,
            "co2_ppm": params.co2_ppm,
            "humidity_pct": params.humidity_pct,
        },
    ).mappings().one()
    db.commit()
    return {"status": "success", "data": dict(row)}


@app.get("/api/nearest-post")
def api_get_nearest_post(lat: float, lng: float, radius_km: float = 3.0, db: Session = Depends(get_db)):
    radius_m = radius_km * 1000
    posts = get_nearest_posts(lat, lng, radius_m, db)
    return {"status": "success", "data": posts}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
