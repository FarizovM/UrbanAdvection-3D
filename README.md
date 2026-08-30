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
База даних буде доступна на localhost:5432

### Крок 3: Імпорт просторових даних (OSM та DEM)
**Важливо:** Оскільки міграції бази даних містять SQL-скрипти, які спираються на сирі дані OpenStreetMap (для генерації таблиць `buildings` та `street_canyons`), геодані необхідно завантажити **перед** запуском міграцій Prisma.

1. У теці `infrastructure` знаходиться файл `kyiv.osm.pbf`. Для його імпорту в базу даних скористаємося стандартною утилітою `osm2pgsql` через Docker (це не потребує встановлення утиліти локально).
Виконайте команди з кореня проєкту:

```bash
cd infrastructure

docker run --rm -e PGPASSWORD=secretpassword -e DEBIAN_FRONTEND=noninteractive -v "${PWD}:/data" ubuntu bash -c "apt-get update && apt-get install -y osm2pgsql && osm2pgsql -d geo_plume_db -U admin -H host.docker.internal -P 5432 --create --slim --hstore --cache 1000 /data/kyiv.osm.pbf"
```
Ця команда створить просторові таблиці (`planet_osm_polygon`, `planet_osm_line` тощо) з геометрією будівель та доріг.

2. Імпорт рельєфу (Digital Elevation Model - DEM):
Файл висот `kyiv_dem.tif` знаходиться у папці `infrastructure`. Виконайте його імпорт за допомогою `raster2pgsql` всередині тимчасового контейнера з БД:

```bash
docker run --rm -e PGPASSWORD=secretpassword -e DEBIAN_FRONTEND=noninteractive -v "${PWD}:/data" ubuntu bash -c "apt-get update && apt-get install -y postgis postgresql-client && raster2pgsql -I -C -s 4326 /data/kyiv_dem.tif public.kyiv_elevation | psql -U admin -d geo_plume_db -h host.docker.internal -p 5432"
```

### Крок 4: Налаштування API Gateway (Міграції та Сідінг)
На цьому кроці ми встановимо залежності NestJS, створимо таблиці в БД та наповнимо їх початковими даними.

1. Поверніться в корінь проєкту та перейдіть у папку API Gateway:
```bash
cd ../apps/api-gateway

npm install
```

2. Створіть файл `.env` та додайте рядок підключення до БД:
```bash
# Приклад підключення до локальної БД з Docker
DATABASE_URL="postgresql://admin:secretpassword@localhost:5432/geo_plume_db?schema=public"
```

3. Проведення міграцій: Ця команда зчитає файл `prisma/schema.prisma`, створить таблиці та запустить SQL-міграції (які перенесуть дані з таблиць OSM у `buildings` та згенерують `street_canyons`).
```bash
bunx prisma migrate dev
```

4. Наповнення бази даних (Seeding): Ця команда запустить скрипт `prisma/seed.ts`, який сформує в базі початкові дані (згенерує пости моніторингу).

```bash
bunx prisma db seed
```

5. Запустіть NestJS сервер:

```bash
bun run start:dev
```
API Gateway працюватиме на http://localhost:3000.

### Крок 5: Налаштування та запуск Simulation Worker (Python)
Цей мікросервіс відповідає за обчислення математичних моделей розсіювання (плюмів) і працює паралельно з NestJS.

1. Відкрийте новий термінал та перейдіть у папку Python-воркера:
```bash
cd apps/simulation-worker
```

2. Створіть та активуйте віртуальне середовище:
```bash
python -m venv venv

# Для Windows:
venv\Scripts\activate
# Для macOS/Linux:
source venv/bin/activate
```

3. Встановіть залежності:
```bash
pip install -r requirements.txt
```

4. Налаштуйте файл .env у цій папці (ідентично до бази даних API Gateway):
```bash
DATABASE_URL=postgresql://admin:secretpassword@127.0.0.1:5432/geo_plume_db
```

5. Запустіть FastAPI сервер:
```bash
uvicorn main:app --reload --port 8000
```
Python-воркер працюватиме на http://localhost:8000

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