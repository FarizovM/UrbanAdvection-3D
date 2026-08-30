"""Fast terrain-following 3D passive-scalar dispersion model.

The model is deliberately explicit about its scope. It solves transport of a
passive scalar on a terrain-following voxel grid. The measured station wind is
used as the boundary forcing, while terrain and building footprints define the
ground/obstacle mask. This is an interactive reduced-order model, not a
building-resolving CFD solver.
"""

import json
import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session


METRIC_SRID = 32636
DEFAULT_REFERENCE_HEIGHT_M = 10.0
DEFAULT_ROUGHNESS_M = 1.0


def _project_point(db: Session, lng: float, lat: float) -> Tuple[float, float]:
    row = db.execute(
        text(
            """
            SELECT
                ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :srid)) AS x,
                ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :srid)) AS y
            """
        ),
        {"lng": lng, "lat": lat, "srid": METRIC_SRID},
    ).mappings().one()
    return float(row["x"]), float(row["y"])


def _load_terrain(
    db: Session,
    min_x: float,
    min_y: float,
    nx: int,
    ny: int,
    resolution_m: float,
) -> np.ndarray:
    """Resample the existing PostGIS DEM to the model grid in one operation."""
    query = text(
        """
        WITH reference AS (
            SELECT ST_MakeEmptyRaster(
                :nx,
                :ny,
                :min_x,
                :min_y,
                :resolution_m,
                :resolution_m,
                0,
                0,
                :metric_srid
            ) AS rast
        ), source AS (
            SELECT ST_Transform(rast, :metric_srid) AS rast
            FROM kyiv_elevation
            ORDER BY rid
            LIMIT 1
        ), sampled AS (
            SELECT ST_Resample(
                s.rast,
                :resolution_m,
                :resolution_m,
                :min_x,
                :min_y,
                0,
                0,
                'Bilinear',
                0
            ) AS rast
            FROM source s
        ), clipped AS (
            SELECT ST_Clip(s.rast, 1, ST_Envelope(r.rast), true) AS rast
            FROM sampled s
            CROSS JOIN reference r
        )
        SELECT ST_DumpValues(rast, 1) AS values
        FROM clipped
        """
    )
    row = db.execute(
        query,
        {
            "min_x": min_x,
            "min_y": min_y,
            "nx": nx,
            "ny": ny,
            "resolution_m": resolution_m,
            "metric_srid": METRIC_SRID,
        },
    ).mappings().one()

    values = row["values"]
    terrain = np.asarray(values, dtype=np.float32) if values is not None else np.full((ny, nx), np.nan)
    if terrain.shape != (ny, nx):
        raise ValueError("Terrain raster dimensions do not match the simulation grid")

    finite = terrain[np.isfinite(terrain)]
    fill_value = float(np.nanmedian(finite)) if finite.size else 0.0
    terrain[~np.isfinite(terrain)] = fill_value
    return terrain


def _load_buildings(
    db: Session,
    lng: float,
    lat: float,
    radius_m: float,
) -> List[Dict[str, Any]]:
    query = text(
        """
        WITH area AS (
            SELECT ST_Buffer(
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
            )::geometry AS geom
        )
        SELECT
            b.id,
            b.height,
            ST_Area(ST_Transform(b.footprint, :metric_srid)) AS area,
            ST_AsGeoJSON(ST_Transform(b.footprint, :metric_srid)) AS footprint_json
        FROM buildings b
        CROSS JOIN area
        WHERE b.footprint IS NOT NULL
          AND b.footprint && area.geom
          AND ST_Intersects(b.footprint, area.geom)
        """
    )
    rows = db.execute(
        query,
        {
            "lng": lng,
            "lat": lat,
            "radius_m": radius_m,
            "metric_srid": METRIC_SRID,
        },
    ).mappings()

    buildings: List[Dict[str, Any]] = []
    for row in rows:
        try:
            geometry = row["footprint_json"]
            if isinstance(geometry, str):
                geometry = json.loads(geometry)
            height = float(row["height"] or 0.0)
            area = float(row["area"] or 0.0)
            if not math.isfinite(height):
                continue
            buildings.append({"id": row["id"], "geometry": geometry, "height": max(0.0, min(height, 500.0)), "area": area})
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return buildings


def _load_canyons(
    db: Session,
    lng: float,
    lat: float,
    radius_m: float,
) -> List[Dict[str, Any]]:
    query = text(
        """
        WITH area AS (
            SELECT ST_Buffer(
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
            )::geometry AS geom
        )
        SELECT
            c.osm_id,
            c.width_m,
            c.avg_h,
            ST_AsGeoJSON(ST_Buffer(ST_Transform(c.geom_4326, :metric_srid), c.width_m / 2.0)) AS geom_json
        FROM street_canyons c
        CROSS JOIN area
        WHERE c.geom_4326 && area.geom
          AND ST_Intersects(c.geom_4326, area.geom)
        """
    )
    rows = db.execute(
        query,
        {
            "lng": lng,
            "lat": lat,
            "radius_m": radius_m,
            "metric_srid": METRIC_SRID,
        },
    ).mappings()

    canyons: List[Dict[str, Any]] = []
    for row in rows:
        try:
            geometry = row["geom_json"]
            if isinstance(geometry, str):
                geometry = json.loads(geometry)
            canyons.append({
                "geometry": geometry,
                "osm_id": row["osm_id"],
                "width_m": float(row["width_m"]),
                "avg_h": float(row["avg_h"])
            })
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return canyons



def _load_building_height_grid(
    db: Session,
    lng: float,
    lat: float,
    radius_m: float,
    min_x: float,
    min_y: float,
    nx: int,
    ny: int,
    resolution_m: float,
) -> Tuple[np.ndarray, int]:
    """Rasterise building heights in PostGIS without transferring all polygons.

    The frontend receives building polygons through vector tiles, but the
    numerical solver only needs the maximum building height per cell. Doing
    this indexed point-in-polygon lookup in PostGIS is substantially cheaper
    than serialising thousands of GeoJSON polygons into Python for every run.
    """
    query = text(
        """
        WITH area AS (
            SELECT ST_Buffer(
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
            )::geometry AS geom
        ), reference AS (
            SELECT ST_AddBand(
                ST_MakeEmptyRaster(
                    :nx,
                    :ny,
                    :min_x,
                    :min_y,
                    :resolution_m,
                    :resolution_m,
                    0,
                    0,
                    :metric_srid
                ),
                '32BF'::text,
                0,
                -9999
            ) AS rast
        ), selected AS (
            SELECT ST_Transform(b.footprint, :metric_srid) AS geom,
                   LEAST(GREATEST(b.height, 0.0), 500.0) AS height
            FROM buildings b
            CROSS JOIN area
            WHERE b.footprint IS NOT NULL
              AND b.footprint && area.geom
              AND ST_Intersects(b.footprint, area.geom)
        ), rasters AS (
            SELECT rast FROM reference
            UNION ALL
            SELECT ST_AsRaster(s.geom, r.rast, '32BF', s.height, -9999, true)
            FROM selected s
            CROSS JOIN reference r
        ), merged AS (
            SELECT ST_Union(rast, 'MAX') AS rast
            FROM rasters
        ), clipped AS (
            SELECT ST_Clip(m.rast, 1, ST_Envelope(r.rast), true) AS rast
            FROM merged m
            CROSS JOIN reference r
        )
        SELECT ST_DumpValues(rast, 1) AS values
        FROM clipped
        """
    )
    row = db.execute(
        query,
        {
            "lng": lng,
            "lat": lat,
            "radius_m": radius_m,
            "min_x": min_x,
            "min_y": min_y,
            "nx": nx,
            "ny": ny,
            "resolution_m": resolution_m,
            "metric_srid": METRIC_SRID,
        },
    ).mappings().one()

    height_grid = np.zeros((ny, nx), dtype=np.float32)
    raster_values = row["values"]
    if raster_values is not None:
        height_grid = np.nan_to_num(
            np.asarray(raster_values, dtype=np.float32),
            nan=0.0,
            posinf=500.0,
            neginf=0.0,
        )
        height_grid = np.maximum(height_grid, 0.0)
        if height_grid.shape != (ny, nx):
            raise ValueError("Building raster dimensions do not match the simulation grid")

    building_count = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM buildings b
                WHERE b.footprint IS NOT NULL
                  AND b.footprint && ST_Buffer(
                      ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                      :radius_m
                  )::geometry
                  AND ST_Intersects(
                      b.footprint,
                      ST_Buffer(
                          ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                          :radius_m
                      )::geometry
                  )
                """
            ),
            {"lng": lng, "lat": lat, "radius_m": radius_m},
        ).scalar_one()
    )
    return height_grid, building_count


def _point_in_ring(x: np.ndarray, y: np.ndarray, ring: Sequence[Sequence[float]]) -> np.ndarray:
    """Vectorised ray-casting point-in-polygon test for one linear ring."""
    points = np.asarray(ring, dtype=np.float64)
    if points.ndim != 2 or points.shape[0] < 3:
        return np.zeros_like(x, dtype=bool)
    points = points[:, :2]
    if np.allclose(points[0], points[-1]):
        points = points[:-1]

    inside = np.zeros_like(x, dtype=bool)
    previous = len(points) - 1
    for current in range(len(points)):
        x0, y0 = points[previous]
        x1, y1 = points[current]
        crosses = (y0 > y) != (y1 > y)
        x_intersection = (x1 - x0) * (y - y0) / (y1 - y0 + 1e-12) + x0
        inside ^= crosses & (x < x_intersection)
        previous = current
    return inside


def _iter_polygons(geometry: Dict[str, Any]) -> Iterable[Sequence[Sequence[Sequence[float]]]]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if geometry_type == "Polygon":
        yield coordinates
    elif geometry_type == "MultiPolygon":
        yield from coordinates


def _rasterize_buildings(
    buildings: Iterable[Dict[str, Any]],
    min_x: float,
    min_y: float,
    nx: int,
    ny: int,
    resolution_m: float,
) -> np.ndarray:
    """Return maximum building height in each horizontal cell."""
    x_values = min_x + (np.arange(nx, dtype=np.float64) + 0.5) * resolution_m
    y_values = min_y + (np.arange(ny, dtype=np.float64) + 0.5) * resolution_m
    x_grid, y_grid = np.meshgrid(x_values, y_values)
    height_grid = np.zeros((ny, nx), dtype=np.float32)

    for building in buildings:
        geometry = building.get("geometry") or {}
        height = float(building.get("height") or 0.0)
        for polygon in _iter_polygons(geometry):
            if not polygon:
                continue
            outer = np.asarray(polygon[0], dtype=np.float64)
            if outer.ndim != 2 or outer.shape[0] < 3:
                continue
            outer = outer[:, :2]
            low_x, high_x = float(np.min(outer[:, 0])), float(np.max(outer[:, 0]))
            low_y, high_y = float(np.min(outer[:, 1])), float(np.max(outer[:, 1]))
            x_start = max(0, int(math.floor((low_x - min_x) / resolution_m)) - 1)
            x_end = min(nx, int(math.ceil((high_x - min_x) / resolution_m)) + 1)
            y_start = max(0, int(math.floor((low_y - min_y) / resolution_m)) - 1)
            y_end = min(ny, int(math.ceil((high_y - min_y) / resolution_m)) + 1)
            if x_start >= x_end or y_start >= y_end:
                continue

            local_x = x_grid[y_start:y_end, x_start:x_end]
            local_y = y_grid[y_start:y_end, x_start:x_end]
            covered = _point_in_ring(local_x, local_y, outer)
            for hole in polygon[1:]:
                covered &= ~_point_in_ring(local_x, local_y, hole)
            local_heights = height_grid[y_start:y_end, x_start:x_end]
            local_heights[covered] = np.maximum(local_heights[covered], height)

    return height_grid


def _rasterize_buildings_with_id(
    buildings: Iterable[Dict[str, Any]],
    min_x: float,
    min_y: float,
    nx: int,
    ny: int,
    resolution_m: float,
) -> Tuple[np.ndarray, Dict[int, Dict[str, Any]]]:
    x_values = min_x + (np.arange(nx, dtype=np.float64) + 0.5) * resolution_m
    y_values = min_y + (np.arange(ny, dtype=np.float64) + 0.5) * resolution_m
    x_grid, y_grid = np.meshgrid(x_values, y_values)
    building_grid = np.zeros((ny, nx), dtype=np.int32)
    building_dict = {}
    current_idx = 1

    for building in buildings:
        geometry = building.get("geometry") or {}
        height = float(building.get("height") or 0.0)
        area = float(building.get("area") or 0.0)
        b_id = building.get("id")
        if not b_id:
            continue
            
        added = False
        for polygon in _iter_polygons(geometry):
            if not polygon:
                continue
            outer = np.asarray(polygon[0], dtype=np.float64)
            if outer.ndim != 2 or outer.shape[0] < 3:
                continue
            outer = outer[:, :2]
            low_x, high_x = float(np.min(outer[:, 0])), float(np.max(outer[:, 0]))
            low_y, high_y = float(np.min(outer[:, 1])), float(np.max(outer[:, 1]))
            x_start = max(0, int(math.floor((low_x - min_x) / resolution_m)) - 1)
            x_end = min(nx, int(math.ceil((high_x - min_x) / resolution_m)) + 1)
            y_start = max(0, int(math.floor((low_y - min_y) / resolution_m)) - 1)
            y_end = min(ny, int(math.ceil((high_y - min_y) / resolution_m)) + 1)
            if x_start >= x_end or y_start >= y_end:
                continue

            local_x = x_grid[y_start:y_end, x_start:x_end]
            local_y = y_grid[y_start:y_end, x_start:x_end]
            covered = _point_in_ring(local_x, local_y, outer)
            for hole in polygon[1:]:
                covered &= ~_point_in_ring(local_x, local_y, hole)
            
            local_grid = building_grid[y_start:y_end, x_start:x_end]
            local_grid[covered] = current_idx
            added = True
            
        if added:
            building_dict[current_idx] = {"id": b_id, "height": height, "area": area}
            current_idx += 1

    return building_grid, building_dict


def _rasterize_canyons(
    canyons: Iterable[Dict[str, Any]],
    min_x: float,
    min_y: float,
    nx: int,
    ny: int,
    resolution_m: float,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    x_values = min_x + (np.arange(nx, dtype=np.float64) + 0.5) * resolution_m
    y_values = min_y + (np.arange(ny, dtype=np.float64) + 0.5) * resolution_m
    x_grid, y_grid = np.meshgrid(x_values, y_values)
    canyon_grid = np.zeros((ny, nx), dtype=np.int64)
    canyon_h = np.zeros((ny, nx), dtype=np.float32)
    canyon_w = np.zeros((ny, nx), dtype=np.float32)

    for canyon in canyons:
        geometry = canyon.get("geometry") or {}
        osm_id = canyon.get("osm_id") or 0
        h = float(canyon.get("avg_h") or 0.0)
        w = float(canyon.get("width_m") or 0.0)
        
        for polygon in _iter_polygons(geometry):
            if not polygon:
                continue
            outer = np.asarray(polygon[0], dtype=np.float64)
            if outer.ndim != 2 or outer.shape[0] < 3:
                continue
            outer = outer[:, :2]
            low_x, high_x = float(np.min(outer[:, 0])), float(np.max(outer[:, 0]))
            low_y, high_y = float(np.min(outer[:, 1])), float(np.max(outer[:, 1]))
            x_start = max(0, int(math.floor((low_x - min_x) / resolution_m)) - 1)
            x_end = min(nx, int(math.ceil((high_x - min_x) / resolution_m)) + 1)
            y_start = max(0, int(math.floor((low_y - min_y) / resolution_m)) - 1)
            y_end = min(ny, int(math.ceil((high_y - min_y) / resolution_m)) + 1)
            if x_start >= x_end or y_start >= y_end:
                continue

            local_x = x_grid[y_start:y_end, x_start:x_end]
            local_y = y_grid[y_start:y_end, x_start:x_end]
            covered = _point_in_ring(local_x, local_y, outer)
            for hole in polygon[1:]:
                covered &= ~_point_in_ring(local_x, local_y, hole)
            
            c_g = canyon_grid[y_start:y_end, x_start:x_end]
            c_h = canyon_h[y_start:y_end, x_start:x_end]
            c_w = canyon_w[y_start:y_end, x_start:x_end]
            c_g[covered] = osm_id
            c_h[covered] = h
            c_w[covered] = w

    return canyon_grid, canyon_h, canyon_w



def _local_to_lon_lat(
    center_lng: float,
    center_lat: float,
    center_x: float,
    center_y: float,
    x: np.ndarray,
    y: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    # The 3 km domain is small enough for a local tangent-plane conversion.
    lat = center_lat + (y - center_y) / 111320.0
    lng = center_lng + (x - center_x) / (111320.0 * math.cos(math.radians(center_lat)))
    return lng, lat


def _build_wind_streamlines(
    center_lng: float,
    center_lat: float,
    center_x: float,
    center_y: float,
    min_x: float,
    min_y: float,
    radius_m: float,
    resolution_m: float,
    terrain: np.ndarray,
    building_heights: np.ndarray,
    wind_to_deg: float,
    stream_height_m: float = 10.0,
) -> List[Dict[str, Any]]:
    """Create continuous map paths showing the modeled boundary wind direction.

    The scalar solver uses a uniform boundary wind and a building mask. These
    paths are therefore a useful visual flow guide, with a small deterministic
    lateral detour when a line reaches a building at the display height. They
    are not a substitute for building-resolving CFD streamlines.
    """
    nx = building_heights.shape[1]
    ny = building_heights.shape[0]
    angle = math.radians(wind_to_deg)
    direction = np.asarray([math.sin(angle), math.cos(angle)], dtype=np.float64)
    perpendicular = np.asarray([-direction[1], direction[0]], dtype=np.float64)
    display_height = max(2.0, float(stream_height_m))
    line_count = 17
    offsets = np.linspace(-0.82 * radius_m, 0.82 * radius_m, line_count)
    max_steps = int(math.ceil(2.1 * radius_m / resolution_m)) + 2
    streamlines: List[Dict[str, Any]] = []

    def cell_for(point_x: float, point_y: float) -> Optional[Tuple[int, int]]:
        i = int(math.floor((point_x - min_x) / resolution_m))
        j = int(math.floor((point_y - min_y) / resolution_m))
        if i < 0 or i >= nx or j < 0 or j >= ny:
            return None
        if (point_x - center_x) ** 2 + (point_y - center_y) ** 2 > radius_m**2:
            return None
        return i, j

    for offset in offsets:
        point = np.asarray([center_x, center_y], dtype=np.float64)
        axial_distance = math.sqrt(max(radius_m**2 - float(offset) ** 2, 0.0)) * 0.98
        point -= direction * axial_distance
        point += perpendicular * float(offset)

        # Start the visible segment after an obstacle on the upwind edge. This
        # avoids losing an entire streamline just because its seed falls in a
        # building footprint at the coarse display height.
        for _ in range(int(math.ceil(2.0 * radius_m / resolution_m))):
            cell = cell_for(float(point[0]), float(point[1]))
            if cell is None:
                point += direction * resolution_m
                continue
            if building_heights[cell[1], cell[0]] < display_height:
                break
            point += direction * resolution_m

        path: List[List[float]] = []
        for _ in range(max_steps):
            cell = cell_for(float(point[0]), float(point[1]))
            if cell is None:
                break
            i, j = cell
            if building_heights[j, i] >= display_height:
                break

            lng, lat = _local_to_lon_lat(
                center_lng,
                center_lat,
                center_x,
                center_y,
                np.asarray(point[0]),
                np.asarray(point[1]),
            )
            path.append([
                float(lng),
                float(lat),
                float(terrain[j, i] + display_height),
            ])

            next_point = point + direction * resolution_m
            next_cell = cell_for(float(next_point[0]), float(next_point[1]))
            if next_cell is not None and building_heights[next_cell[1], next_cell[0]] >= display_height:
                # Try the closest free lateral cell to keep the visual guide
                # continuous around coarse building obstacles.
                for lateral_cells in (1, -1, 2, -2, 3, -3):
                    candidate = next_point + perpendicular * (lateral_cells * resolution_m)
                    candidate_cell = cell_for(float(candidate[0]), float(candidate[1]))
                    if candidate_cell is not None and building_heights[candidate_cell[1], candidate_cell[0]] < display_height:
                        next_point = candidate
                        break
                else:
                    break
            point = next_point

        if len(path) >= 2:
            streamlines.append({"path": path, "offset_m": float(offset)})

    return streamlines


def _horizontal_neighbor(array: np.ndarray, axis: int, direction: int) -> np.ndarray:
    """Neighbour values with zero-inflow/open-outflow boundary handling."""
    result = np.zeros_like(array)
    if axis == 2:
        if direction > 0:
            result[:, :, 1:] = array[:, :, :-1]
        else:
            result[:, :, :-1] = array[:, :, 1:]
    else:
        if direction > 0:
            result[:, 1:, :] = array[:, :-1, :]
        else:
            result[:, :-1, :] = array[:, 1:, :]
    return result


def _neumann_neighbor(array: np.ndarray, axis: int, direction: int) -> np.ndarray:
    result = np.empty_like(array)
    if axis == 0:
        if direction > 0:
            result[0, :, :] = array[0, :, :]
            result[1:, :, :] = array[:-1, :, :]
        else:
            result[-1, :, :] = array[-1, :, :]
            result[:-1, :, :] = array[1:, :, :]
    elif axis == 2:
        if direction > 0:
            result[:, :, 0] = array[:, :, 0]
            result[:, :, 1:] = array[:, :, :-1]
        else:
            result[:, :, -1] = array[:, :, -1]
            result[:, :, :-1] = array[:, :, 1:]
    else:
        if direction > 0:
            result[:, 0, :] = array[:, 0, :]
            result[:, 1:, :] = array[:, :-1, :]
        else:
            result[:, -1, :] = array[:, -1, :]
            result[:, :-1, :] = array[:, 1:, :]
    return result


def calculate_dispersion(params: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Calculate a bounded 3D passive-scalar field for one scenario."""
    station_id = params.get("station_id")
    station: Optional[Dict[str, Any]] = None
    if station_id:
        station_row = db.execute(
            text(
                """
                SELECT
                    p.id,
                    p.name,
                    ST_X(p.location::geometry) AS lng,
                    ST_Y(p.location::geometry) AS lat,
                    o.wind_from_deg,
                    o.wind_speed_ms,
                    o.air_temp_c,
                    o.background_temp_c,
                    o.observed_at
                FROM monitoring_posts p
                LEFT JOIN LATERAL (
                    SELECT *
                    FROM monitoring_observations
                    WHERE post_id = p.id
                    ORDER BY observed_at DESC
                    LIMIT 1
                ) o ON true
                WHERE p.id = :station_id
                """
            ),
            {"station_id": station_id},
        ).mappings().first()
        if not station_row:
            raise ValueError("Monitoring post was not found")
        station = dict(station_row)

    source = params.get("source") or {}
    if source.get("lng") is not None:
        center_lng = float(source["lng"])
    elif station:
        center_lng = float(station["lng"])
    else:
        if params.get("lng") is None or params.get("lat") is None:
            raise ValueError("A station_id or source coordinates are required")
        center_lng = float(params["lng"])
    if source.get("lat") is not None:
        center_lat = float(source["lat"])
    elif station:
        center_lat = float(station["lat"])
    else:
        center_lat = float(params["lat"])

    wind_from_deg = params.get("wind_from_deg")
    if wind_from_deg is None and station:
        wind_from_deg = station.get("wind_from_deg")
    wind_speed_ms = params.get("wind_speed_ms")
    if wind_speed_ms is None and station:
        wind_speed_ms = station.get("wind_speed_ms")
    if wind_from_deg is None or wind_speed_ms is None:
        raise ValueError("Wind direction and speed are required, either from the post or as an override")

    wind_from_deg = float(wind_from_deg) % 360.0
    wind_speed_ms = float(wind_speed_ms)
    if wind_speed_ms < 0 or not math.isfinite(wind_speed_ms):
        raise ValueError("wind_speed_ms must be a non-negative finite number")

    radius_m = float(params.get("radius_m", 3000.0))
    resolution_m = float(params.get("resolution_m", 50.0))
    vertical_resolution_m = float(params.get("vertical_resolution_m", 10.0))
    z_max_m = float(params.get("z_max_m", 240.0))
    duration_s = float(params.get("duration_s", 300.0))
    if not 100.0 <= radius_m <= 5000.0:
        raise ValueError("radius_m must be between 100 and 5000 metres")
    if not 10.0 <= resolution_m <= 100.0:
        raise ValueError("resolution_m must be between 10 and 100 metres")
    if not 2.0 <= vertical_resolution_m <= 25.0:
        raise ValueError("vertical_resolution_m must be between 2 and 25 metres")
    if not 30.0 <= z_max_m <= 1000.0:
        raise ValueError("z_max_m must be between 30 and 1000 metres")
    if not 1.0 <= duration_s <= 1800.0:
        raise ValueError("duration_s must be between 1 and 1800 seconds")

    center_x, center_y = _project_point(db, center_lng, center_lat)
    nx = int(math.ceil(2.0 * radius_m / resolution_m))
    ny = nx
    min_x = center_x - radius_m
    min_y = center_y - radius_m
    terrain = _load_terrain(db, min_x, min_y, nx, ny, resolution_m)
    
    buildings_data = _load_buildings(db, center_lng, center_lat, radius_m)
    building_heights = _rasterize_buildings(buildings_data, min_x, min_y, nx, ny, resolution_m)
    building_grid, building_dict = _rasterize_buildings_with_id(buildings_data, min_x, min_y, nx, ny, resolution_m)
    building_count = len(buildings_data)
    
    canyon_polygons = _load_canyons(db, center_lng, center_lat, radius_m)
    canyon_grid, canyon_h, canyon_w = _rasterize_canyons(canyon_polygons, min_x, min_y, nx, ny, resolution_m)

    x_values = min_x + (np.arange(nx, dtype=np.float64) + 0.5) * resolution_m
    y_values = min_y + (np.arange(ny, dtype=np.float64) + 0.5) * resolution_m
    x_grid, y_grid = np.meshgrid(x_values, y_values)
    domain_mask_2d = ((x_grid - center_x) ** 2 + (y_grid - center_y) ** 2) <= radius_m**2

    nz = int(math.ceil(z_max_m / vertical_resolution_m))
    scalar = np.zeros((nz, ny, nx), dtype=np.float32)
    blocked = np.zeros_like(scalar, dtype=bool)
    z_levels = (np.arange(nz, dtype=np.float32) + 0.5) * vertical_resolution_m
    blocked[:, :, :] = z_levels[:, None, None] <= building_heights[None, :, :]
    scalar[blocked] = 0.0

    wind_to_deg = (wind_from_deg + 180.0) % 360.0
    wind_angle = math.radians(wind_to_deg)
    base_u = wind_speed_ms * math.sin(wind_angle)
    base_v = wind_speed_ms * math.cos(wind_angle)
    reference_height_m = float(params.get("wind_reference_height_m", DEFAULT_REFERENCE_HEIGHT_M))
    roughness_m = max(0.05, min(float(params.get("roughness_m", DEFAULT_ROUGHNESS_M)), 20.0))

    denominator = math.log((reference_height_m + roughness_m) / roughness_m)
    speed_profile = np.asarray(
        [
            max(0.0, math.log((float(z) + roughness_m) / roughness_m) / max(denominator, 1e-9))
            for z in z_levels
        ],
        dtype=np.float32,
    )
    u_profile = base_u * speed_profile
    v_profile = base_v * speed_profile
    requested_streamline_height = params.get("wind_streamline_height_m")
    if requested_streamline_height is None:
        # Put the guide above the local roof canopy so it remains visible over
        # dense urban blocks. The plume itself still uses the full building
        # mask in the voxel grid below.
        streamline_height_m = min(120.0, max(10.0, float(np.max(building_heights)) + 5.0))
    else:
        streamline_height_m = max(2.0, min(float(requested_streamline_height), 120.0))
    wind_streamlines = _build_wind_streamlines(
        center_lng,
        center_lat,
        center_x,
        center_y,
        min_x,
        min_y,
        radius_m,
        resolution_m,
        terrain,
        building_heights,
        wind_to_deg,
        streamline_height_m,
    )

    max_horizontal_speed = max(float(np.max(np.abs(u_profile))), float(np.max(np.abs(v_profile))), 0.2)
    dt = min(0.35 * resolution_m / max_horizontal_speed, 10.0)
    steps = max(1, min(int(math.ceil(duration_s / dt)), 300))
    dt = duration_s / steps
    diffusion_h = max(0.0, min(float(params.get("horizontal_diffusivity_m2_s", 10.0)), 500.0))
    diffusion_v = max(0.0, min(float(params.get("vertical_diffusivity_m2_s", 2.0)), 100.0))

    source_lng = float(source.get("lng", center_lng))
    source_lat = float(source.get("lat", center_lat))
    source_height_m = float(source.get("height_m", 2.0))
    source_rate = float(source.get("emission_rate_gps", 1.0))
    source_duration_s = float(source.get("duration_s", duration_s))
    if not math.isfinite(source_height_m) or source_height_m < 0.5:
        raise ValueError("source.height_m must be at least 0.5 metres")
    if not math.isfinite(source_rate) or source_rate < 0.0:
        raise ValueError("source.emission_rate_gps must be a non-negative finite number")
    if not math.isfinite(source_duration_s) or source_duration_s < 0.0:
        raise ValueError("source.duration_s must be a non-negative finite number")
    source_duration_s = min(source_duration_s, duration_s)
    source_x, source_y = _project_point(db, source_lng, source_lat)
    source_i = int(np.clip(math.floor((source_x - min_x) / resolution_m), 0, nx - 1))
    source_j = int(np.clip(math.floor((source_y - min_y) / resolution_m), 0, ny - 1))
    source_k = int(np.clip(math.floor(source_height_m / vertical_resolution_m), 0, nz - 1))
    if blocked[source_k, source_j, source_i]:
        available_levels = np.flatnonzero(~blocked[:, source_j, source_i])
        if available_levels.size:
            source_k = int(available_levels[0])
        else:
            # A coarse cell can overlap a building even when the exact source
            # point is on a street. Move to the nearest open cell so a valid
            # station/source does not silently produce an all-zero field.
            available_cells = np.argwhere(~blocked)
            if available_cells.size:
                distances = (
                    (available_cells[:, 1] - source_j) ** 2
                    + (available_cells[:, 2] - source_i) ** 2
                    + 0.25 * (available_cells[:, 0] - source_k) ** 2
                )
                source_k, source_j, source_i = map(
                    int,
                    available_cells[int(np.argmin(distances))],
                )
            else:
                source_rate = 0.0
    source_volume = resolution_m * resolution_m * vertical_resolution_m

    for step in range(steps):
        old = scalar
        advective = np.zeros_like(old)
        for k in range(nz):
            layer = old[k : k + 1]
            if u_profile[k] >= 0:
                du = (layer - _horizontal_neighbor(layer, 2, 1)) / resolution_m
            else:
                du = (_horizontal_neighbor(layer, 2, -1) - layer) / resolution_m
            if v_profile[k] >= 0:
                dv = (layer - _horizontal_neighbor(layer, 1, 1)) / resolution_m
            else:
                dv = (_horizontal_neighbor(layer, 1, -1) - layer) / resolution_m
            advective[k : k + 1] = u_profile[k] * du + v_profile[k] * dv

        left = _neumann_neighbor(old, 2, 1)
        right = _neumann_neighbor(old, 2, -1)
        down = _neumann_neighbor(old, 1, 1)
        up = _neumann_neighbor(old, 1, -1)
        vertical_down = _neumann_neighbor(old, 0, 1)
        vertical_up = _neumann_neighbor(old, 0, -1)
        laplacian_h = (left + right + down + up - 4.0 * old) / (resolution_m**2)
        laplacian_v = (vertical_down + vertical_up - 2.0 * old) / (vertical_resolution_m**2)
        scalar = old + dt * (-advective + diffusion_h * laplacian_h + diffusion_v * laplacian_v)
        scalar = np.maximum(scalar, 0.0)
        scalar[blocked] = 0.0
        scalar[:, ~domain_mask_2d] = 0.0

        injection_duration = max(0.0, min(dt, source_duration_s - step * dt))
        if source_rate > 0.0 and injection_duration > 0.0:
            scalar[source_k, source_j, source_i] += source_rate * injection_duration / source_volume

    canyon_concentrations = {}
    if source_rate > 0.0:
        source_canyon_id = canyon_grid[source_j, source_i]
        for y_idx in range(ny):
            for x_idx in range(nx):
                osm_id = canyon_grid[y_idx, x_idx]
                if osm_id > 0:
                    h = canyon_h[y_idx, x_idx]
                    w = canyon_w[y_idx, x_idx]
                    if h <= 0 or w <= 0: continue
                    k_roof = int(np.clip(math.floor(h / vertical_resolution_m), 0, nz - 1))
                    u_h = math.sqrt(u_profile[k_roof]**2 + v_profile[k_roof]**2)
                    u_h = max(u_h, 0.1)
                    max_c = 0.0
                    for k_idx in range(k_roof + 1):
                        z_val = z_levels[k_idx]
                        c_bg = float(scalar[k_idx, y_idx, x_idx])
                        
                        if osm_id == source_canyon_id:
                            c_canyon = c_bg + (source_rate / (u_h * w)) * math.exp(-z_val / h)
                            scalar[k_idx, y_idx, x_idx] = c_canyon
                        else:
                            c_canyon = c_bg
                            
                        if c_canyon > max_c:
                            max_c = c_canyon
                    if max_c > 0:
                        current_max = canyon_concentrations.get(str(osm_id), 0.0)
                        if max_c > current_max:
                            canyon_concentrations[str(osm_id)] = float(max_c)

    building_risks = {}
    if source_rate > 0.0:
        left = _horizontal_neighbor(scalar, 2, 1)
        right = _horizontal_neighbor(scalar, 2, -1)
        down = _horizontal_neighbor(scalar, 1, 1)
        up = _horizontal_neighbor(scalar, 1, -1)
        above = _neumann_neighbor(scalar, 0, -1)
        exposure = np.maximum.reduce([scalar, left, right, down, up, above])

        b_exposure_sum = {}
        b_cells_count = {}

        for y_idx in range(ny):
            for x_idx in range(nx):
                b_idx = building_grid[y_idx, x_idx]
                if b_idx > 0 and b_idx in building_dict:
                    b_info = building_dict[b_idx]
                    h = b_info["height"]
                    k_max = int(np.clip(math.floor(h / vertical_resolution_m), 0, nz - 1))
                    
                    sum_c = 0.0
                    for k_idx in range(k_max + 1):
                        sum_c += float(exposure[k_idx, y_idx, x_idx]) * vertical_resolution_m
                        
                    b_id = b_info["id"]
                    b_exposure_sum[b_id] = b_exposure_sum.get(b_id, 0.0) + sum_c
                    b_cells_count[b_id] = b_cells_count.get(b_id, 0) + 1

        for b_idx, b_info in building_dict.items():
            b_id = b_info["id"]
            if b_id in b_exposure_sum and b_cells_count[b_id] > 0:
                avg_exposure = b_exposure_sum[b_id] / b_cells_count[b_id]
                if avg_exposure > 0:
                    h = b_info["height"]
                    population = (b_info["area"] * h) / 75.0
                    building_risks[b_id] = float(avg_exposure * population)

    max_value = float(np.max(scalar))
    ground_k = int(np.clip(math.floor(2.0 / vertical_resolution_m), 0, nz - 1))
    ground_field = scalar[ground_k]
    lon_grid, lat_grid = _local_to_lon_lat(center_lng, center_lat, center_x, center_y, x_grid, y_grid)
    ground_values = np.where(domain_mask_2d, ground_field, 0.0).astype(np.float32)

    threshold = max_value * 0.03 if max_value > 0 else 0.0
    voxel_indices = np.argwhere((scalar >= threshold) & ~blocked) if threshold > 0 else np.empty((0, 3), dtype=int)
    if voxel_indices.shape[0] > 20000:
        values = scalar[tuple(voxel_indices.T)]
        voxel_indices = voxel_indices[np.argsort(values)[-20000:]]

    voxels: List[Dict[str, Any]] = []
    for k, j, i in voxel_indices:
        x = min_x + (int(i) + 0.5) * resolution_m
        y = min_y + (int(j) + 0.5) * resolution_m
        voxel_lng, voxel_lat = _local_to_lon_lat(
            center_lng,
            center_lat,
            center_x,
            center_y,
            np.asarray(x),
            np.asarray(y),
        )
        value = float(scalar[k, j, i])
        voxels.append(
            {
                "position": [float(voxel_lng), float(voxel_lat), float(terrain[j, i] + z_levels[k])],
                "value": value,
                "normalized": value / max_value if max_value else 0.0,
            }
        )

    unit = "g/m3" if params.get("mode", "pollution") == "pollution" else "K (passive scalar)"
    return {
        "mode": params.get("mode", "pollution"),
        "value_unit": unit,
        "center": {"lng": center_lng, "lat": center_lat},
        "radius_m": radius_m,
        "wind": {
            "from_deg": wind_from_deg,
            "to_deg": wind_to_deg,
            "speed_ms": wind_speed_ms,
            "reference_height_m": reference_height_m,
            "streamline_height_m": streamline_height_m,
        },
        "grid": {
            "nx": nx,
            "ny": ny,
            "nz": nz,
            "resolution_m": resolution_m,
            "vertical_resolution_m": vertical_resolution_m,
            "z_max_m": z_max_m,
        },
        "terrain": {
            "min_m": float(np.min(terrain)),
            "max_m": float(np.max(terrain)),
            "building_count": building_count,
        },
        "source": {
            "lng": source_lng,
            "lat": source_lat,
            "height_m": source_height_m,
            "emission_rate_gps": source_rate,
            "duration_s": source_duration_s,
        },
        "ground_field": {
            "origin": [float(lon_grid[0, 0]), float(lat_grid[0, 0])],
            "nx": nx,
            "ny": ny,
            "values": ground_values.ravel().astype(float).tolist(),
        },
        "canyon_concentrations": canyon_concentrations,
        "building_risks": building_risks,
        "voxels": voxels,
        "wind_streamlines": wind_streamlines,
        "max_value": max_value,
        "steps": steps,
        "time_s": duration_s,
        "model": "terrain-following explicit advection-diffusion with building mask and boundary-wind streamlines",
    }
