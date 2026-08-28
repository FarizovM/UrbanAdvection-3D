CREATE MATERIALIZED VIEW street_canyons AS
WITH streets AS (
    SELECT 
        osm_id, 
        name,
        highway,
        COALESCE(
            NULLIF(regexp_replace(width, '[^0-9.]', '', 'g'), '')::numeric, 
            CASE highway
                WHEN 'trunk' THEN 20.0
                WHEN 'primary' THEN 15.0
                WHEN 'secondary' THEN 10.0
                WHEN 'tertiary' THEN 8.0
                WHEN 'residential' THEN 6.0
                WHEN 'unclassified' THEN 6.0
                ELSE 5.0
            END
        ) AS width_m,
        way AS geom_3857,
        ST_Transform(way, 32636) AS geom_metric
    FROM planet_osm_line
    WHERE highway IN ('trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian')
),
street_buffers AS (
    SELECT 
        s.osm_id,
        s.name,
        s.width_m,
        s.geom_3857,
        s.geom_metric,
        ST_Buffer(s.geom_metric, s.width_m / 2.0 + 10.0) AS search_buffer
    FROM streets s
),
canyon_stats AS (
    SELECT 
        sb.osm_id,
        sb.name,
        sb.width_m,
        sb.geom_3857,
        AVG(b.height) AS avg_h,
        MAX(b.height) AS max_h
    FROM street_buffers sb
    JOIN buildings b ON ST_Intersects(sb.search_buffer, ST_Transform(b.footprint, 32636))
    GROUP BY sb.osm_id, sb.name, sb.width_m, sb.geom_3857
)
SELECT 
    osm_id,
    name,
    geom_3857,
    ST_Transform(geom_3857, 4326) AS geom_4326,
    avg_h,
    max_h,
    width_m,
    (avg_h / NULLIF(width_m, 0)) AS h_w_ratio
FROM canyon_stats
WHERE (avg_h / NULLIF(width_m, 0)) >= 1.5;

CREATE INDEX street_canyons_geom_3857_idx ON street_canyons USING GIST (geom_3857);
CREATE INDEX street_canyons_geom_4326_idx ON street_canyons USING GIST (geom_4326);
CREATE UNIQUE INDEX street_canyons_osm_id_idx ON street_canyons (osm_id);
