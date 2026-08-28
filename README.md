# UrbanAdvection-3D

Поточний MVP продовження дипломного проєкту: інтерактивне 3D-моделювання
розсіювання пасивної домішки з урахуванням цифрової моделі рельєфу та висот
будівель у радіусі до 3 км від точки сценарію.

## Що реалізовано

- Python/FastAPI worker читає `kyiv_elevation` і `buildings` з PostGIS.
- Розрахунок виконується на terrain-following voxel grid методом явної
  адвекції-дифузії. Напрямок у запиті — метеорологічний (звідки дме вітер);
  усередині він перетворюється на напрямок переносу.
- Будівлі формують маску перешкод, а висота результату повертається як
  абсолютна відмітка `terrain + height_above_ground`.
- Будівлі Києва віддаються через `GET /spatial/buildings/tiles/{z}/{x}/{y}` у
  MVT-тайлах: фронтенд запитує лише видимі тайли, а не один великий GeoJSON.
- NestJS API Gateway проксуює `POST /simulations/dispersion` до worker.
- React/DeckGL показує terrain, екструдовані будівлі, пости та 3D-вокселі
  результату на карті, а також безперервні 3D-лінії напрямку переносу вітром.
- Worker створює демонстраційне спостереження для кожного поста без даних під
  час запуску та оновлює показники раз на 5 хвилин. Реальні показники можна
  передавати через endpoint спостережень.
- Нові таблиці `monitoring_observations` і `simulation_runs` та додаткові поля
  показників додаються адитивними міграціями. Існуючі OSM, DEM, будівлі, пости
  та джерела не видаляються й не перебудовуються.

Це швидка reduced-order модель пасивного скаляра, а не building-resolving CFD.
Результат у `g/m3` є модельною величиною для заданого `emission_rate_gps`, а не
автоматичною оцінкою фактичної концентрації без калібрування та валідації.

## RabbitMQ у стеку

RabbitMQ залишений у `docker-compose` як підготовлена інфраструктура для
асинхронних розрахунків. Поточний інтерактивний розрахунок займає секунди, тому
gateway викликає worker напряму через HTTP і одразу повертає результат. Для
довгих CFD-розрахунків, черги паралельних задач, повторних спроб та прогресу
доцільно перейти на схему `gateway → RabbitMQ → worker`, а клієнту повертати
`simulation_run_id` і окремий статус виконання.

## Запуск локально

1. Запустіть наявну інфраструктуру:

   ```powershell
   docker compose -f infrastructure/docker-compose.yml up -d
   ```

   У compose використовується volume `pg_data`; команда не очищає завантажені
   дані.

2. Для цієї вже завантаженої БД адитивна міграція вже застосована й
   позначена Prisma як виконана. Для іншої непорожньої БД виконайте SQL з
    `apps/api-gateway/prisma/migrations/202608280001_add_simulation_runtime/migration.sql`
    та
    `apps/api-gateway/prisma/migrations/202608280002_add_simulated_observation_metrics/migration.sql`
    (вони ідемпотентні), а потім один раз позначте обидві міграції:

   ```powershell
    cd apps/api-gateway
    npx prisma migrate resolve --applied 202608280001_add_simulation_runtime
    npx prisma migrate resolve --applied 202608280002_add_simulated_observation_metrics
    npx prisma migrate deploy
   npx prisma generate
   npm run build
   npm run start
   ```

   Перевірте `DATABASE_URL` у `apps/api-gateway/.env`. За замовчуванням це
   `postgresql://admin:secretpassword@localhost:5432/geo_plume_db`.

3. Запустіть worker в іншому PowerShell:

   ```powershell
   cd apps/simulation-worker
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   $env:DATABASE_URL = "postgresql://admin:secretpassword@localhost:5432/geo_plume_db"
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. Запустіть frontend:

   ```powershell
   cd apps/frontend
   npm install
   npm run dev
   ```

   Відкрийте адресу Vite, зазвичай `http://localhost:5173`.

## API сценарію

```http
POST http://localhost:3000/simulations/dispersion
Content-Type: application/json
```

```json
{
  "station_id": "post-1",
  "source": {
    "lng": 30.5234,
    "lat": 50.4501,
    "height_m": 2,
    "emission_rate_gps": 1,
    "duration_s": 300
  },
  "wind_from_deg": 270,
  "wind_speed_ms": 3,
  "radius_m": 3000,
  "resolution_m": 50,
  "vertical_resolution_m": 10,
  "z_max_m": 240,
  "duration_s": 300,
  "mode": "pollution"
}
```

Пости можуть передавати метеоспостереження через
`POST /api/posts/{post_id}/observations`. Якщо `wind_from_deg` і
`wind_speed_ms` не задані в розрахунку, worker використовує останнє
спостереження цього поста.

Основні worker endpoints: `GET /api/posts`, `POST /api/posts/{post_id}/observations`,
`GET /api/nearest-post` та `POST /api/dispersion`. Gateway також має
`GET /spatial/buildings/tiles/{z}/{x}/{y}` для тайлів будівель. Кожен новий
розрахунок записується в `simulation_runs` для відтворюваності сценарію.

## Швидкодія шарів

У поточній БД є 168 773 будівлі та GiST-індекс на `buildings.footprint`.
MVT-запит використовує цей індекс і повертає тільки будівлі видимого тайла;
це масштабується для всього покриття Києва без завантаження всього набору в
браузер. Відображення будівель починається з zoom 12, щоб не створювати один
надто великий тайл при огляді всього міста. `TerrainLayer` також працює з тайловим DEM і завантажує дані за
потребою. Для точнішого профілювання використовуйте `EXPLAIN (ANALYZE,
BUFFERS)` на tile-запиті та перевіряйте кількість запитів у Network DevTools.
