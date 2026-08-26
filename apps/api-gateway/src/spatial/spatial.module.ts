import { Module } from '@nestjs/common';
import { SpatialService } from './spatial.service';
import { SpatialController } from './spatial.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SpatialService],
  controllers: [SpatialController],
})
export class SpatialModule {}
