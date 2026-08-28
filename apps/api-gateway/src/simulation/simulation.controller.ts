import { Body, Controller, Post } from '@nestjs/common';
import { SimulationService } from './simulation.service';

@Controller('simulations')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post('dispersion')
  calculateDispersion(@Body() payload: Record<string, unknown>) {
    return this.simulationService.calculateDispersion(payload);
  }
}
