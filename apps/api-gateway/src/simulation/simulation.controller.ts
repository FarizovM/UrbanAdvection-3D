import { Body, Controller, Get, Post } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import type { PostDto } from './dto/posts.dto';

@Controller('simulations')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) { }

  @Post('dispersion')
  calculateDispersion(@Body() payload: Record<string, unknown>) {
    return this.simulationService.calculateDispersion(payload);
  }

  @Post('reverse-trajectory')
  calculateReverseTrajectory(@Body() payload: Record<string, unknown>) {
    return this.simulationService.calculateReverseTrajectory(payload);
  }

  @Get('posts')
  async getPosts(): Promise<{ status: string; data: PostDto[] }> {
    const data: PostDto[] = await this.simulationService.getPosts();
    return { status: "success", data };
  }
}
