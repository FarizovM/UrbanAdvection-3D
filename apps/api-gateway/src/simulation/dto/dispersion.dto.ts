import {
    IsNumber,
    IsString,
    IsNotEmpty,
    Min,
    Max
} from "class-validator"

export class DispersionPayloadDto {
    @IsString()
    @IsNotEmpty()
    station_id: string;

    @IsNumber()
    @IsNotEmpty()
    @Min(-180)
    @Max(180)
    lng: number;

    @IsNumber()
    @IsNotEmpty()
    @Min(-90)
    @Max(90)
    lat: number;

    @IsNumber()
    @Min(0)
    @Max(360)
    wind_from_deg: number;

    @IsNumber()
    @Min(0)
    wind_speed_ms: number;

    @IsNumber()
    @Min(0)
    @Max(10000)
    radius_m: number;

    @IsNumber()
    @Min(0)
    @Max(1000)
    resolution_m: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    vertical_resolution_m: number;

    @IsNumber()
    @Min(0)
    @Max(10000)
    z_max_m: number;

    @IsNumber()
    @Min(0)
    @Max(3600)
    duration_s: number;

    @IsNumber()
    @Min(0)
    wind_reference_height_m: number;

    @IsNumber()
    @Min(0)
    roughness_m: number;

    @IsNumber()
    @Min(0)
    horizontal_diffusivity_m2_s: number;

    @IsNumber()
    @Min(0)
    vertical_diffusivity_m2_s: number;

    @IsString()
    @IsNotEmpty()
    mode: "pollution" | "heat";
}