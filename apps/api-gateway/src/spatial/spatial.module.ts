import { Module } from '@nestjs/common';
import { SpatialService } from './spatial.service';
import { SpatialController } from './spatial.controller';

@Module({
  providers: [SpatialService],
  controllers: [SpatialController]
})
export class SpatialModule {}
