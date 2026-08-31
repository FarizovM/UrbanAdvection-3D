# Використовуємо легкий офіційний образ Python
FROM python:3.10-slim

# Встановлюємо системні бібліотеки (потрібні для PostGIS/psycopg2)
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Спочатку копіюємо requirements для кешування шару Docker
COPY requirements.txt .

# Встановлюємо залежності + gunicorn для продакшну
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Копіюємо весь код
COPY . .

# Відкриваємо порт
EXPOSE 8000

# Запускаємо сервер через Gunicorn на 4 воркери
CMD ["gunicorn", "main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]