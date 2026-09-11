WITH cleaned_osm AS (
    -- Використовуємо DISTINCT ON, щоб уникнути дублювання osm_id
    SELECT DISTINCT ON (osm_id)
        osm_id,
        name,
        
        -- Геометрія з трансформацією у 4326
        ST_Transform(
            ST_GeometryN(ST_CollectionExtract(ST_MakeValid(way), 3), 1), 
            4326
        )::geometry(Polygon, 4326) AS footprint_2d,
        
        -- Розумний парсинг висоти
        LEAST(
            COALESCE(
                -- Пріоритет 1: Точна висота (тег height)
                CAST(NULLIF(SUBSTRING(tags->'height' FROM '^[0-9]+(\.[0-9]+)?'), '') AS FLOAT), 
                
                -- Пріоритет 2: Поверхи (тег building:levels) * 3
                CAST(NULLIF(SUBSTRING(tags->'building:levels' FROM '^[0-9]+'), '') AS FLOAT) * 3.0, 
                
                -- Пріоритет 3: Дефолт
                9.0 
            ), 
            400.0 -- Зрізаємо аномалії (понад 400м)
        ) AS calc_height

    FROM planet_osm_polygon
    WHERE building IS NOT NULL
    ORDER BY osm_id
)
INSERT INTO buildings (id, osm_id, name, height, footprint)
SELECT 
    gen_random_uuid(),
    osm_id,
    name,
    calc_height,
    footprint_2d
FROM cleaned_osm
WHERE footprint_2d IS NOT NULL
ON CONFLICT (osm_id) DO NOTHING;