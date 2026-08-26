import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SpatialService } from './spatial.service';


@Controller('spatial')
export class SpatialController {
    constructor(private readonly SpatialService: SpatialService) { }

    @Get('buildings')
    async getBuildings(
        @Query('minLng') minLng: string,
        @Query('minLat') minLat: string,
        @Query('maxLng') maxLng: string,
        @Query('maxLat') maxLat: string,
    ) {
        if (!minLng || !minLat || !maxLng || !maxLat) {
            throw new BadRequestException('BBox parameters are required');
        }

        return this.SpatialService.getBuildingsInBBox(
            parseFloat(minLng),
            parseFloat(minLat),
            parseFloat(maxLng),
            parseFloat(maxLat)
        );
    }
}
