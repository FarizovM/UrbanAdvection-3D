import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SpatialService } from './spatial.service';


@Controller('spatial')
export class SpatialController {
    constructor(private readonly SpatialService: SpatialService) { }

    @Get('buildings/tiles/:z/:x/:y')
    async getBuildingsTile(
        @Param('z') zValue: string,
        @Param('x') xValue: string,
        @Param('y') yValue: string,
        @Res() response: Response,
    ) {
        const z = Number(zValue);
        const x = Number(xValue);
        const y = Number(yValue);
        const tileCount = Number.isInteger(z) && z >= 0 && z <= 20 ? 2 ** z : 0;

        if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || tileCount === 0 || x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
            throw new BadRequestException('Invalid vector tile coordinates');
        }

        const tile = await this.SpatialService.getBuildingsTile(z, x, y);
        response.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.send(tile);
    }

    @Get('canyons/tiles/:z/:x/:y')
    async getCanyonsTile(
        @Param('z') zValue: string,
        @Param('x') xValue: string,
        @Param('y') yValue: string,
        @Res() response: Response,
    ) {
        const z = Number(zValue);
        const x = Number(xValue);
        const y = Number(yValue);
        const tileCount = Number.isInteger(z) && z >= 0 && z <= 20 ? 2 ** z : 0;

        if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || tileCount === 0 || x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
            throw new BadRequestException('Invalid vector tile coordinates');
        }

        const tile = await this.SpatialService.getCanyonsTile(z, x, y);
        response.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.send(tile);
    }

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
