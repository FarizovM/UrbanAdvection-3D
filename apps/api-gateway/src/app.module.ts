import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SpatialModule } from './spatial/spatial.module';

@Module({
  imports: [PrismaModule, SpatialModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
