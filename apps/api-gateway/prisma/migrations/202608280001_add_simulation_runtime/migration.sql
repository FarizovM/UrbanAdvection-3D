-- Additive migration for the 3D simulation runtime.
-- It intentionally does not touch or rebuild existing OSM, DEM, building,
-- monitoring_posts, or simulation_sources rows.

CREATE TABLE IF NOT EXISTS monitoring_observations (
    id                  varchar(36) PRIMARY KEY,
    post_id             varchar NOT NULL REFERENCES monitoring_posts(id) ON DELETE CASCADE,
    observed_at         timestamptz NOT NULL,
    wind_from_deg       double precision,
    wind_speed_ms       double precision,
    air_temp_c          double precision,
    background_temp_c   double precision,
    pm25_ug_m3          double precision,
    no2_ug_m3           double precision,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT monitoring_observations_wind_from_deg_chk
        CHECK (wind_from_deg IS NULL OR (wind_from_deg >= 0 AND wind_from_deg < 360)),
    CONSTRAINT monitoring_observations_wind_speed_chk
        CHECK (wind_speed_ms IS NULL OR wind_speed_ms >= 0)
);

CREATE INDEX IF NOT EXISTS monitoring_observations_post_time_idx
    ON monitoring_observations (post_id, observed_at DESC);

ALTER TABLE simulation_sources
    ADD COLUMN IF NOT EXISTS pollutant varchar(32),
    ADD COLUMN IF NOT EXISTS release_duration_s double precision,
    ADD COLUMN IF NOT EXISTS source_height_m double precision;

CREATE TABLE IF NOT EXISTS simulation_runs (
    id              varchar(36) PRIMARY KEY,
    status          varchar(24) NOT NULL,
    mode            varchar(24) NOT NULL,
    request_payload jsonb NOT NULL,
    result_payload  jsonb,
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    started_at      timestamptz,
    completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS simulation_runs_status_idx
    ON simulation_runs (status, created_at DESC);


CREATE TABLE buildings AS
SELECT 
    osm_id AS id, 
    name, 
    way AS geom, 
    CAST(NULLIF(tags->'building:levels', '') AS INTEGER) * 3 AS height_m -- приблизний розрахунок висоти
FROM planet_osm_polygon
WHERE building IS NOT NULL;

CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);