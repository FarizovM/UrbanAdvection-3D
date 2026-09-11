import { Test, TestingModule } from '@nestjs/testing';
import { SpatialService } from './spatial.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SpatialService', () => {
  let service: SpatialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpatialService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<SpatialService>(SpatialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
