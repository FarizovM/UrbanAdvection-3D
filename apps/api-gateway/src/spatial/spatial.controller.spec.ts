import { Test, TestingModule } from '@nestjs/testing';
import { SpatialController } from './spatial.controller';
import { SpatialService } from './spatial.service';

describe('SpatialController', () => {
  let controller: SpatialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpatialController],
      providers: [{ provide: SpatialService, useValue: {} }],
    }).compile();

    controller = module.get<SpatialController>(SpatialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
