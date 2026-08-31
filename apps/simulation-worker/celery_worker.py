import os
import json
from celery import Celery
from sqlalchemy import text
from database import SessionLocal
from services.dispersion import calculate_dispersion

# Підключаємось до RabbitMQ
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

celery_app = Celery("simulation_tasks", broker=RABBITMQ_URL)

@celery_app.task(name="run_dispersion")
def run_dispersion_task(run_id: str, payload: dict):
    db = SessionLocal()
    try:
        # 1. Оновлюємо статус на RUNNING
        db.execute(
            text("UPDATE simulation_runs SET status = 'RUNNING' WHERE id = :id"), 
            {"id": run_id}
        )
        db.commit()

        # Виконуємо важкий розрахунок
        result = calculate_dispersion(payload, db)

        # Зберігаємо результат
        db.execute(
            text("""
                UPDATE simulation_runs
                SET status = 'COMPLETED', result_payload = CAST(:result_payload AS jsonb),
                    completed_at = now()
                WHERE id = :id
            """),
            {"id": run_id, "result_payload": json.dumps(result, default=str)},
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        db.execute(
            "UPDATE simulation_runs SET status = 'FAILED', error_message = :err, completed_at = now() WHERE id = :id",
            {"id": run_id, "err": str(exc)},
        )
        db.commit()
    finally:
        db.close()