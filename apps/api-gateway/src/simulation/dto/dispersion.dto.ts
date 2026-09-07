import {
    IsNumber,
    IsString,
    IsNotEmpty,
    IsOptional,
    Min,
    Max
} from "class-validator"

export class DispersionPayloadDto {
    @IsOptional()
    @IsString()
    station_id?: string;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(360)
    wind_from_deg?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    wind_speed_ms?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10000)
    radius_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1000)
    resolution_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    vertical_resolution_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(10000)
    z_max_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(3600)
    duration_s?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    wind_reference_height_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    roughness_m?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    horizontal_diffusivity_m2_s?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    vertical_diffusivity_m2_s?: number;

    @IsOptional()
    @IsString()
    mode?: "pollution" | "heat" | "city-idw";
}