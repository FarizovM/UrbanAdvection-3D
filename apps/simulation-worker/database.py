from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Рядок підключення до нашої БД (через localhost, оскільки порт прокинуто з Docker)
DATABASE_URL = "postgresql://admin:secretpassword@localhost:5432/geo_plume_db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()