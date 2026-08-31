import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import type { PostDto } from './dto/posts.dto';
import type { DispersionPayloadDto } from './dto/dispersion.dto';

@Controller('simulations')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) { }

  @Post('dispersion')
  calculateDispersion(@Body() payload: DispersionPayloadDto) {
    return this.simulationService.calculateDispersion(payload);
  }

  @Get('dispersion/:id')
  getDispersionStatus(@Param('id') id: string) {
    return this.simulationService.getDispersionStatus(id);
  }

  @Post('reverse-trajectory')
  calculateReverseTrajectory(@Body() payload: DispersionPayloadDto) {
    return this.simulationService.calculateReverseTrajectory(payload);
  }

  @Get('posts')
  async getPosts(): Promise<{ status: string; data: PostDto[] }> {
    const data: PostDto[] = await this.simulationService.getPosts();
    return { status: "success", data };
  }
}
