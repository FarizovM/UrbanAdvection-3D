import {
  BadGatewayException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SimulationService {
  constructor(private readonly configService: ConfigService) {}

  async calculateDispersion(payload: Record<string, unknown>) {
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
}
