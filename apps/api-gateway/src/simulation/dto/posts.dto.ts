import {
    IsNumber,
    IsString,
    IsDate,
    IsNotEmpty,
    Min,
    Max
} from "class-validator"

export class PostDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsNumber()
    @IsNotEmpty()
    lng: number;

    @IsNumber()
    @IsNotEmpty()
    lat: number;

    @IsNumber()
    @Min(0)
    @Max(360)
    wind_from_deg?: number | null;

    @IsNumber()
    @Min(0)
    wind_speed_ms?: number | null;

    @IsNumber()
    @Min(-100)
    @Max(100)
    air_temp_c?: number | null;

    @IsNumber()
    background_temp_c?: number | null;

    @IsNumber()
    @Min(0)
    pm25_ug_m3?: number | null;

    @IsNumber()
    @Min(0)
    no2_ug_m3?: number | null;

    @IsNumber()
    @Min(0)
    pm10_ug_m3?: number | null;

    @IsNumber()
    @Min(0)
    co2_ppm?: number | null;

    @IsNumber()
    @Min(0)
    humidity_pct?: number | null;

    @IsDate()
    observed_at?: Date | null;
}