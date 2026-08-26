import { Test, TestingModule } from '@nestjs/testing';
import { SpatialController } from './spatial.controller';

describe('SpatialController', () => {
  let controller: SpatialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpatialController],
    }).compile();

    controller = module.get<SpatialController>(SpatialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
