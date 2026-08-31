export type CalculationMode = 'pollution' | 'heat' | 'trajectory';

export type Post = {
    id: string;
    name: string;
    lng: number;
    lat: number;
    wind_from_deg?: number | null;
    wind_speed_ms?: number | null;
    air_temp_c?: number | null;
    background_temp_c?: number | null;
    pm25_ug_m3?: number | null;
    no2_ug_m3?: number | null;
    pm10_ug_m3?: number | null;
    co2_ppm?: number | null;
    humidity_pct?: number | null;
    observed_at?: string | null;
};

export type MapPoint = { lat: number; lng: number };
export type MenuPosition = { left: number; top: number };

export type Voxel = {
    position: [number, number, number];
    value: number;
    normalized: number;
};

export type DispersionResult = {
    mode: CalculationMode;
    value_unit: string;
    max_value: number;
    steps: number;
    time_s: number;
    terrain: { min_m: number; max_m: number; building_count: number };
    grid: { nx: number; ny: number; nz: number; resolution_m: number; vertical_resolution_m: number };
    wind: { from_deg: number; to_deg: number; speed_ms: number };
    voxels: Voxel[];
    wind_streamlines: Array<{ path: [number, number, number][]; offset_m: number }>;
    canyon_concentrations?: Record<string, number>;
    building_risks?: Record<string, number>;
};

export type BuildingProperties = { id: string; name?: string | null; height: number };
