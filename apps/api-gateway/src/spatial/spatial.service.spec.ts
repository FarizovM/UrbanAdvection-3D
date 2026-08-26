import { Test, TestingModule } from '@nestjs/testing';
import { SpatialService } from './spatial.service';

describe('SpatialService', () => {
  let service: SpatialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpatialService],
    }).compile();

    service = module.get<SpatialService>(SpatialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
