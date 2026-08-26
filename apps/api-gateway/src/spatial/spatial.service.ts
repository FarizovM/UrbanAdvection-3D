import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpatialService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Отримує 3D-будівлі в межах заданого прямокутника (Bounding Box).
     * Використовує ST_AsGeoJSON для конвертації 3D-призм у формат, 
     * зрозумілий для фронтенду (Deck.gl) та Python-воркера.
     */
    async getBuildingsInBBox(minLng: number, minLat: number, maxLng: number, maxLat: number) {
        const buildings = await this.prisma.$queryRaw`
      SELECT 
        id, 
        name, 
        height, 
        ST_AsGeoJSON(geom_3d)::json AS geom_3d_json
      FROM buildings
      WHERE ST_Intersects(
        footprint, 
        ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
      )
      -- Обмежуємо кількість для безпеки, якщо BBox занадто великий
      LIMIT 5000;
    `;

        return buildings;
    }
}