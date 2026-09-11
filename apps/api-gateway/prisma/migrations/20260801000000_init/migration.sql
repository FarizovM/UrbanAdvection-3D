-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "hstore";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_raster";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_topology";

-- Dummy tables for Shadow Database (osm2pgsql creates these in the real DB)
CREATE TABLE IF NOT EXISTS planet_osm_polygon (
    osm_id BIGINT,
    name TEXT,
    way geometry(Geometry, 3857),
    tags hstore,
    building TEXT
);

CREATE TABLE IF NOT EXISTS planet_osm_line (
    osm_id BIGINT,
    name TEXT,
    way geometry(Geometry, 3857),
    tags hstore,
    highway TEXT,
    width TEXT
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "osm_id" BIGINT,
    "name" TEXT,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 9.0,
    "footprint" geometry(Polygon, 4326),

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pollutant" TEXT,
    "temperature" DOUBLE PRECISION,
    "emission_rate" DOUBLE PRECISION,
    "release_duration_s" DOUBLE PRECISION,
    "source_height_m" DOUBLE PRECISION,
    "location" geometry(PointZ, 4326),

    CONSTRAINT "simulation_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_posts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" geometry(Point, 4326),

    CONSTRAINT "monitoring_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_observations" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "wind_from_deg" DOUBLE PRECISION,
    "wind_speed_ms" DOUBLE PRECISION,
    "air_temp_c" DOUBLE PRECISION,
    "background_temp_c" DOUBLE PRECISION,
    "pm25_ug_m3" DOUBLE PRECISION,
    "no2_ug_m3" DOUBLE PRECISION,
    "pm10_ug_m3" DOUBLE PRECISION,
    "co2_ppm" DOUBLE PRECISION,
    "humidity_pct" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "result_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buildings_osm_id_key" ON "buildings"("osm_id");

-- CreateIndex
CREATE INDEX "building_footprint_idx" ON "buildings" USING GIST ("footprint");

-- CreateIndex
CREATE INDEX "monitoring_posts_location_idx" ON "monitoring_posts" USING GIST ("location");

-- CreateIndex
CREATE INDEX "monitoring_observations_post_time_idx" ON "monitoring_observations"("post_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "simulation_runs_status_idx" ON "simulation_runs"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "monitoring_observations" ADD CONSTRAINT "monitoring_observations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "monitoring_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
