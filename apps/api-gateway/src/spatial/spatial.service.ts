import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpatialService {
  constructor(private readonly prisma: PrismaService) { }

  async getBuildingsInBBox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
    const buildings = await this.prisma.$queryRaw`
      SELECT 
        id, 
        name, 
        height,
        ST_AsGeoJSON(footprint)::json AS footprint_json
      FROM buildings
      WHERE ST_Intersects(
        footprint, 
        ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
      )
      LIMIT 15000;
    `;

    return buildings;
  }

  async getBuildingsTile(z: number, x: number, y: number): Promise<Buffer> {
    const rows = await this.prisma.$queryRaw<Array<{ tile: Buffer | Uint8Array | null }>>`
      WITH tile AS (
        SELECT
          ST_TileEnvelope(${z}, ${x}, ${y}) AS geom,
          ST_TileEnvelope(${z}, ${x}, ${y}, margin => (64.0 / 4096.0)) AS query_geom
      ), mvtgeom AS (
        SELECT
          b.id::text AS id,
          b.name,
          b.height,
          ST_AsMVTGeom(
            ST_Transform(b.footprint, 3857),
            tile.geom,
            4096,
            64,
            true
          ) AS geom
        FROM buildings b
        CROSS JOIN tile
        WHERE b.footprint IS NOT NULL
          AND b.footprint && ST_Transform(tile.query_geom, 4326)
          AND ST_Intersects(b.footprint, ST_Transform(tile.query_geom, 4326))
      )
      SELECT COALESCE(ST_AsMVT(mvtgeom, 'buildings', 4096, 'geom'), ''::bytea) AS tile
      FROM mvtgeom;
    `;

    return Buffer.from(rows[0]?.tile ?? []);
  }
}
