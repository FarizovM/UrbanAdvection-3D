import {
  BadGatewayException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { PostDto } from './dto/posts.dto';
import type { DispersionPayloadDto } from './dto/dispersion.dto';

@Injectable()
export class SimulationService {
  constructor(private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) { }

  async calculateDispersion(payload: DispersionPayloadDto) {
    const workerUrl = this.configService.get<string>(
      'SIMULATION_WORKER_URL',
      'http://localhost:8000',
    );

    try {
      const response = await fetch(`${workerUrl}/api/dispersion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      let responseBody: unknown = responseText;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        // Preserve a non-JSON worker error as plain text below.
      }

      if (!response.ok) {
        throw new HttpException(JSON.stringify(responseBody), response.status);
      }
      return responseBody;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException('Simulation worker is unavailable');
    }
  }

  async getDispersionStatus(id: string) {
    const workerUrl = this.configService.get<string>('SIMULATION_WORKER_URL', 'http://localhost:8000');

    const response = await fetch(`${workerUrl}/api/dispersion/${id}`);
    if (!response.ok) throw new HttpException('Not found', response.status);
    return response.json();
  }


  async calculateReverseTrajectory(payload: DispersionPayloadDto) {
    const workerUrl = this.configService.get<string>(
      'SIMULATION_WORKER_URL',
      'http://localhost:8000',
    );

    try {
      const response = await fetch(`${workerUrl}/api/reverse-trajectory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      let responseBody: unknown = responseText;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        // Preserve a non-JSON worker error as plain text below.
      }

      if (!response.ok) {
        throw new HttpException(JSON.stringify(responseBody), response.status);
      }
      return responseBody;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException('Simulation worker is unavailable');
    }
  }

  async getPosts() {
    const posts = await this.prisma.$queryRaw`
    SELECT
            p.id,
            p.name,
            ST_X(p.location::geometry) AS lng,
            ST_Y(p.location::geometry) AS lat,
            o.wind_from_deg,
            o.wind_speed_ms,
            o.air_temp_c,
            o.background_temp_c,
            o.pm25_ug_m3,
            o.no2_ug_m3,
            o.pm10_ug_m3,
            o.co2_ppm,
            o.humidity_pct,
            o.observed_at
        FROM monitoring_posts p
        LEFT JOIN LATERAL (
            SELECT wind_from_deg, wind_speed_ms, air_temp_c,
                   background_temp_c, pm25_ug_m3, no2_ug_m3,
                   pm10_ug_m3, co2_ppm, humidity_pct, observed_at
            FROM monitoring_observations
            WHERE post_id = p.id
            ORDER BY observed_at DESC
            LIMIT 1
        ) o ON true;
    `;

    return posts as PostDto[]
  }
}
