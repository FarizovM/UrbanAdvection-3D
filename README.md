# 🌍 UrbanAdvection-3D

**UrbanAdvection-3D** — це комплексна геопросторова система для 3D-моделювання та аналізу стану атмосферного повітря в міському середовищі. Система поєднує математичні моделі адвекції-дифузії забруднюючих речовин із сучасними технологіями 3D-візуалізації.

Проєкт дозволяє розраховувати зони впливу (плюми) від джерел забруднення з урахуванням швидкості та напрямку вітру, а також візуалізувати розповсюдження домішок поверх 3D-рельєфу та будівель (на прикладі Києва).

## 🏗 Архітектура та Стек технологій

Проєкт побудований на мікросервісній архітектурі (Monorepo) і містить наступні компоненти:

*   **Database / Infrastructure:** PostgreSQL + PostGIS для обробки просторових даних. Розгортається через Docker Compose. Містить дані OSM (`kyiv.osm.pbf`).
*   **API Gateway (Backend):** `NestJS`, `Prisma ORM`, `TypeScript`. Відповідає за бізнес-логіку, управління користувачами, роботу з просторовими даними та взаємодію з базою даних.
*   **Simulation Worker (Python):** `FastAPI`, `SQLAlchemy`, `GeoPandas/NumPy`. Математичне ядро, що містить PostGIS-алгоритми розрахунку зон розсіювання (плюмів) та температурних режимів.
*   **Frontend (UI):** `React`, `Vite`, `TypeScript`, `Deck.gl`, `MapLibre`. Відповідає за інтерактивну 3D-візуалізацію карти, будівель, датчиків моніторингу та анімацію поширення забруднень.

---

## 🚀 Інструкція з локального розгортання

### Передумови (Prerequisites)
Перед початком переконайтеся, що у вас встановлені:
*   [Node.js](https://nodejs.org/) (v18 або вище) та `npm` (або `yarn` / `pnpm`)
*   [Python](https://www.python.org/) (v3.10 або вище)
*   [Docker](https://www.docker.com/) та Docker Compose

### Крок 1: Клонування репозиторію
```bash
git clone https://github.com/FarizovM/UrbanAdvection-3D.git
cd UrbanAdvection-3D
```

### Крок 2: Запуск бази даних (PostgreSQL + PostGIS)
Для роботи з просторовими даними потрібен PostGIS. У проєкті налаштований Docker Compose для швидкого старту бази даних.

```bash
cd infrastructure 

docker-compose up -d
```
База даних буде доступна на localhost:5434

### Крок 3: Створення базових таблиць (Prisma Init)
**Важливо:** Спочатку ми ініціалізуємо базові таблиці Prisma на чистій базі даних, щоб уникнути конфліктів зі сторонніми просторовими даними OSM.

1. Перейдіть у папку API Gateway:
```bash
cd apps/api-gateway
bun install
```

2. Створіть файл `.env` та додайте рядок підключення до БД:
```bash
DATABASE_URL="postgresql://admin:secretpassword@localhost:5434/geo_plume_db?schema=public"
```

3. Проведіть базові міграції (це згенерує порожні таблиці `buildings`, `monitoring_posts` тощо):
```bash
bunx prisma migrate dev --name init
```

### Крок 4: Імпорт просторових даних (OSM та DEM)
**Тепер**, коли базові таблиці існують, ми завантажуємо сирі просторові дані. 

1. Перейдіть у теку `infrastructure` та імпортуйте OSM дані `kyiv.osm.pbf`:
```bash
cd ../../infrastructure
docker run --rm -e PGPASSWORD=secretpassword -e DEBIAN_FRONTEND=noninteractive -v "${PWD}:/data" ubuntu bash -c "apt-get update && apt-get install -y osm2pgsql && osm2pgsql -d geo_plume_db -U admin -H host.docker.internal -P 5434 --create --slim --hstore --cache 1000 /data/kyiv.osm.pbf"
```
Ця команда створить просторові таблиці (`planet_osm_polygon`, `planet_osm_line` тощо).

2. Імпорт рельєфу (Digital Elevation Model - DEM):
```bash
docker run --rm -e PGPASSWORD=secretpassword -e DEBIAN_FRONTEND=noninteractive -v "${PWD}:/data" ubuntu bash -c "apt-get update && apt-get install -y postgis postgresql-client && raster2pgsql -I -C -s 4326 /data/kyiv_dem.tif public.kyiv_elevation | psql -U admin -d geo_plume_db -h host.docker.internal -p 5434"
```

### Крок 4.5: Генерація будівель та каньйонів
Оскільки дані OSM та базові таблиці Prisma вже існують, ми можемо перенести геометрію будівель та згенерувати "вуличні каньйони".

Поверніться до `api-gateway` та виконайте просторові SQL-скрипти:
```bash
cd ../apps/api-gateway
bunx prisma db execute --file prisma/spatial_scripts/01_populate_buildings.sql
bunx prisma db execute --file prisma/spatial_scripts/02_create_street_canyons.sql
```

### Крок 5: Наповнення бази даних (Seeding)
Ця команда запустить скрипт `prisma/seed.ts`, який сформує в базі початкові дані (згенерує пости моніторингу).

```bash
bunx prisma db seed
```

5. Запустіть NestJS сервер:

```bash
bun run start:dev
```
API Gateway працюватиме на http://localhost:3000.

### Крок 5: Налаштування та запуск Simulation Worker (Python / FastAPI + Celery)
Цей мікросервіс відповідає за обчислення математичних моделей розсіювання (плюмів) і складається з двох процесів: Web-сервера (FastAPI) та фонового обробника завдань (Celery). Вони обмінюються задачами через RabbitMQ і працюють паралельно з NestJS.

1. Відкрийте новий термінал та перейдіть у папку Python-воркера:
```bash
cd apps/simulation-worker
```

2. Створіть та активуйте віртуальне середовище:
```bash
python -m venv venv

# Для Windows (використовуйте PowerShell):
.\venv\Scripts\Activate.ps1
# Для macOS/Linux:
source venv/bin/activate
```

3. Встановіть залежності:
```bash
pip install -r requirements.txt
```

4. Налаштуйте файл `.env` у цій папці (ідентично до бази даних API Gateway + доступ до RabbitMQ):
```bash
DATABASE_URL=postgresql://admin:secretpassword@127.0.0.1:5434/geo_plume_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
```

5. **Запустіть фоновий воркер Celery** (в цьому ж терміналі з активованим venv):
```bash
# Для Windows:
celery -A celery_worker.celery_app worker --loglevel=info --pool=solo

# Для macOS/Linux:
celery -A celery_worker.celery_app worker --loglevel=info
```

6. **Запустіть FastAPI сервер** (відкрийте ще один новий термінал, перейдіть в `apps/simulation-worker`, активуйте `venv`):
```bash
python main.py
# або
uvicorn main:app --reload --port 8000
```
Web-сервер Python працюватиме на http://localhost:8000

### Крок 6: Налаштування та запуск Frontend (React)
Останній крок — запуск користувацького 3D-інтерфейсу.

1. Відкрийте третій термінал та перейдіть у папку фронтенду:
```bash
cd apps/frontend
```

2. Встановіть залежності:
```bash
npm install
```

3. Запустіть Vite сервер для розробки:
```bash
npm run dev
```
Фронтенд буде доступний за адресою http://localhost:5173 (або іншим портом, який вкаже Vite).

### 🗂 Структура проєкту
Проєкт організовано як monorepo за допомогою папки apps/:

- apps/api-gateway/ — Головний бекенд на NestJS (REST API, Prisma, бізнес-логіка).

- apps/simulation-worker/ — Обчислювальний Python-модуль на FastAPI (генерація плюмів getPlume.py, getTemperaturePlume.py, робота з алгоритмами PostGIS).

- apps/frontend/ — Клієнтська частина на React + Deck.gl (MapComponent.tsx).

- infrastructure/ — Налаштування інфраструктури (Docker, PBF дані OSM, DEM-рельєф).