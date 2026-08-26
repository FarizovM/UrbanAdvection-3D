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
}