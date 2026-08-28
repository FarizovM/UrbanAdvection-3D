import { useEffect, useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { PathLayer, PointCloudLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MVTLayer, TerrainLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

type CalculationMode = 'pollution' | 'heat';

type Post = {
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

type MapPoint = { lat: number; lng: number };
type MenuPosition = { left: number; top: number };

type Voxel = {
    position: [number, number, number];
    value: number;
    normalized: number;
};

type DispersionResult = {
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
};

type BuildingProperties = { id: string; name?: string | null; height: number };

const INITIAL_VIEW_STATE: MapViewState = {
    longitude: 30.5234,
    latitude: 50.4501,
    zoom: 12,
    pitch: 60,
    bearing: 0,
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8000';

function plumeColor(value: number): [number, number, number, number] {
    const normalized = Math.max(0, Math.min(1, value));
    return [
        Math.round(40 + 215 * normalized),
        Math.round(180 - 140 * normalized),
        Math.round(255 - 220 * normalized),
        Math.round(35 + 200 * normalized),
    ];
}

function formatNumber(value: number | null | undefined, digits = 1): string {
    return value == null ? '—' : value.toFixed(digits);
}

function formatObservedAt(value: string | null | undefined): string {
    return value == null ? 'немає даних' : new Date(value).toLocaleTimeString('uk-UA');
}

export default function MapComponent() {
    const [showTerrain, setShowTerrain] = useState(true);
    const [marker, setMarker] = useState<MapPoint | null>(null);
    const [contextMenu, setContextMenu] = useState<MenuPosition | null>(null);
    const [pointFormOpen, setPointFormOpen] = useState(false);
    const [posts, setPosts] = useState<Post[]>([]);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [dispersion, setDispersion] = useState<DispersionResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [calculationMode, setCalculationMode] = useState<CalculationMode>('pollution');
    const [pointSourceHeight, setPointSourceHeight] = useState('10');
    const [pointEmissionRate, setPointEmissionRate] = useState('1');
    const [pointWindFromDeg, setPointWindFromDeg] = useState('270');
    const [pointWindSpeedMs, setPointWindSpeedMs] = useState('3');
    const [postSourceHeight, setPostSourceHeight] = useState('2');
    const [postWindFromDeg, setPostWindFromDeg] = useState('');
    const [postWindSpeedMs, setPostWindSpeedMs] = useState('');

    useEffect(() => {
        let isActive = true;
        const loadPosts = async () => {
            try {
                const response = await fetch(`${WORKER_URL}/api/posts`);
                if (!response.ok) throw new Error('Не вдалося завантажити пости');
                const result = await response.json() as { status: string; data: Post[] };
                if (!isActive || result.status !== 'success') return;
                setPosts(result.data);
                setSelectedPost((current) => current == null
                    ? current
                    : result.data.find((post) => post.id === current.id) ?? current);
            } catch (reason: unknown) {
                if (isActive) setError(reason instanceof Error ? reason.message : 'Помилка постів');
            }
        };

        void loadPosts();
        const intervalId = window.setInterval(() => void loadPosts(), 300000);
        return () => {
            isActive = false;
            window.clearInterval(intervalId);
        };
    }, []);

    const clearScenarioPoint = () => {
        setMarker(null);
        setContextMenu(null);
        setPointFormOpen(false);
        setSelectedPost(null);
        setDispersion(null);
    };

    const selectPost = (post: Post) => {
        setSelectedPost(post);
        setMarker(null);
        setContextMenu(null);
        setPointFormOpen(false);
        setDispersion(null);
        setCalculationMode('pollution');
        setPostWindFromDeg(post.wind_from_deg == null ? '' : String(post.wind_from_deg));
        setPostWindSpeedMs(post.wind_speed_ms == null ? '' : String(post.wind_speed_ms));
    };

    const handleMapClick = (info: PickingInfo<Post>) => {
        if (info.object && info.layer?.id === 'monitoring-posts-layer') {
            selectPost(info.object);
            return;
        }
        if (!info.coordinate) return;

        const [lng, lat] = info.coordinate;
        setMarker({ lat, lng });
        setSelectedPost(null);
        setPointFormOpen(false);
        setDispersion(null);
        setContextMenu({
            left: Math.min(Math.max(info.pixel?.[0] ?? 24, 12), window.innerWidth - 300),
            top: Math.min(Math.max(info.pixel?.[1] ?? 24, 12), window.innerHeight - 180),
        });
    };

    const validateWind = (directionValue: string, speedValue: string) => {
        const direction = Number(directionValue);
        const speed = Number(speedValue);
        if (!Number.isFinite(direction) || direction < 0 || direction >= 360 || !Number.isFinite(speed) || speed < 0) {
            setError('Вкажіть напрям вітру 0–359° і невід’ємну швидкість у м/с');
            return null;
        }
        return { direction, speed };
    };

    const sendCalculation = async (request: Record<string, unknown>): Promise<boolean> => {
        setError(null);
        setIsCalculating(true);
        try {
            const response = await fetch(`${API_URL}/simulations/dispersion`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request),
            });
            const payload = await response.json() as { status: string; result?: DispersionResult; detail?: string };
            if (!response.ok || payload.status !== 'success' || !payload.result) {
                throw new Error(payload.detail ?? 'Помилка розрахунку розсіювання');
            }
            setDispersion(payload.result);
            return true;
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : 'Помилка розрахунку');
            return false;
        } finally {
            setIsCalculating(false);
        }
    };

    const calculatePointScenario = async () => {
        if (!marker) return;
        const wind = validateWind(pointWindFromDeg, pointWindSpeedMs);
        const height = Number(pointSourceHeight);
        const emissionRate = Number(pointEmissionRate);
        if (!wind || !Number.isFinite(height) || height < 0.5 || !Number.isFinite(emissionRate) || emissionRate < 0) {
            setError('Вкажіть висоту джерела від 0,5 м і невід’ємну потужність викиду');
            return;
        }
        setCalculationMode('pollution');
        const successful = await sendCalculation({
            source: { lng: marker.lng, lat: marker.lat, height_m: height, emission_rate_gps: emissionRate, duration_s: 300 },
            wind_from_deg: wind.direction,
            wind_speed_ms: wind.speed,
            radius_m: 3000,
            resolution_m: 50,
            vertical_resolution_m: 10,
            z_max_m: 240,
            duration_s: 300,
            mode: 'pollution',
        });
        if (successful) {
            setPointFormOpen(false);
            setContextMenu(null);
        }
    };

    const calculatePostScenario = async (mode: CalculationMode) => {
        if (!selectedPost) return;
        const wind = validateWind(postWindFromDeg, postWindSpeedMs);
        const height = Number(postSourceHeight);
        if (!wind || !Number.isFinite(height) || height < 0.5) {
            setError('Для поста вкажіть коректну висоту джерела та метеодані');
            return;
        }
        setCalculationMode(mode);
        await sendCalculation({
            station_id: selectedPost.id,
            source: { lng: selectedPost.lng, lat: selectedPost.lat, height_m: height, emission_rate_gps: 1, duration_s: 300 },
            wind_from_deg: wind.direction,
            wind_speed_ms: wind.speed,
            radius_m: 3000,
            resolution_m: 50,
            vertical_resolution_m: 10,
            z_max_m: 240,
            duration_s: 300,
            mode,
        });
    };

    const layers = useMemo(() => [
        showTerrain && new TerrainLayer({
            id: 'terrain-layer',
            elevationDecoder: { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 },
            elevationData: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            texture: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            maxZoom: 14,
            meshMaxError: 8,
            operation: 'terrain+draw',
        }),
        new MVTLayer<BuildingProperties>({
            id: '3d-buildings-layer',
            data: `${API_URL}/spatial/buildings/tiles/{z}/{x}/{y}`,
            // At z=12 Kyiv is split into manageable tiles; zooming farther out
            // would put the whole city into one multi-megabyte tile.
            minZoom: 12,
            maxZoom: 17,
            extruded: true,
            wireframe: true,
            uniqueIdProperty: 'id',
            getElevation: (feature: { properties?: BuildingProperties }) => feature.properties?.height ?? 9,
            getFillColor: [74, 80, 87, 210],
            getLineColor: [0, 0, 0, 100],
            pickable: true,
            autoHighlight: true,
            extensions: [new TerrainExtension()],
        }),
        new ScatterplotLayer({
            id: 'source-marker-layer',
            data: marker ? [marker] : [],
            getPosition: (point: MapPoint) => [point.lng, point.lat, Math.max(2, Number(pointSourceHeight) || 2)],
            getFillColor: [255, 50, 50, 255],
            getRadius: 25,
            radiusUnits: 'meters',
            pickable: false,
            extensions: [new TerrainExtension()],
        }),
        new ScatterplotLayer({
            id: 'monitoring-posts-layer',
            data: posts,
            getPosition: (post: Post) => [post.lng, post.lat, 30],
            getFillColor: [50, 200, 100, 255],
            getRadius: 40,
             radiusUnits: 'meters',
             pickable: true,
             autoHighlight: true,
             extensions: [new TerrainExtension()],
         }),
        new PointCloudLayer({
            id: 'dispersion-voxels-layer',
            data: dispersion?.voxels ?? [],
            getPosition: (voxel: Voxel) => voxel.position,
            getColor: (voxel: Voxel) => plumeColor(voxel.normalized),
            getNormal: [0, 0, 1],
            getRadius: Math.max(8, (dispersion?.grid.resolution_m ?? 50) * 0.45),
            radiusUnits: 'meters',
             pickable: true,
         }),
        new PathLayer<{ path: [number, number, number][] }>({
            id: 'wind-streamlines-layer',
            data: dispersion?.wind_streamlines ?? [],
            getPath: (line) => line.path,
            getColor: [105, 210, 255, 190],
            getWidth: 3,
            widthUnits: 'meters',
            widthMinPixels: 1,
            pickable: false,
        }),
    ].filter(Boolean), [dispersion, marker, pointSourceHeight, posts, showTerrain]);

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
                onClick={handleMapClick}
                getCursor={({ isHovering, isDragging }) => isDragging ? 'grabbing' : (isHovering ? 'pointer' : 'crosshair')}
            >
                <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
            </DeckGL>

            <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1, background: 'rgba(30, 30, 30, 0.9)', color: 'white', padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <input type="checkbox" checked={showTerrain} onChange={(event) => setShowTerrain(event.target.checked)} />
                    <b>Увімкнути 3D-рельєф</b>
                </label>
            </div>

            {error && (
                <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 4, background: '#8b1e1e', color: 'white', padding: '12px 16px', borderRadius: '8px', maxWidth: '360px' }}>
                    {error}
                    <button onClick={() => setError(null)} style={{ marginLeft: '10px' }}>×</button>
                </div>
            )}

            {marker && contextMenu && !pointFormOpen && !selectedPost && (
                <div style={{ position: 'fixed', left: contextMenu.left, top: contextMenu.top, zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', padding: '14px', border: '1px solid #ff5252', borderRadius: '8px', fontFamily: 'sans-serif', width: '250px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    <b style={{ color: '#ff7777' }}>Точка сценарію</b>
                    <div style={{ fontSize: '12px', color: '#bbb', margin: '8px 0 12px' }}>{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</div>
                    <button onClick={() => { setPointFormOpen(true); setContextMenu(null); }} style={{ display: 'block', width: '100%', marginBottom: '8px', padding: '9px' }}>Симулювати викид</button>
                    <button onClick={clearScenarioPoint} style={{ display: 'block', width: '100%', padding: '9px', color: '#8b1e1e' }}>Прибрати точку</button>
                </div>
            )}

            {marker && pointFormOpen && !selectedPost && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', border: '1px solid #ff5252', padding: '22px', borderRadius: '12px', fontFamily: 'sans-serif', width: '340px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <h2 style={{ margin: '0 0 5px', color: '#ff7777' }}>Симуляція викиду</h2>
                    <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Точка: {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</div>
                    <label style={{ display: 'block', marginBottom: '10px' }}>Висота викиду (м)
                        <input value={pointSourceHeight} onChange={(event) => setPointSourceHeight(event.target.value)} type="number" min="0.5" step="0.5" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '10px' }}>Потужність викиду (г/с)
                        <input value={pointEmissionRate} onChange={(event) => setPointEmissionRate(event.target.value)} type="number" min="0" step="0.1" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '10px' }}>Напрямок, звідки дме вітер (°)
                        <input value={pointWindFromDeg} onChange={(event) => setPointWindFromDeg(event.target.value)} type="number" min="0" max="359" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '16px' }}>Швидкість вітру (м/с)
                        <input value={pointWindSpeedMs} onChange={(event) => setPointWindSpeedMs(event.target.value)} type="number" min="0" step="0.1" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <button onClick={() => void calculatePointScenario()} disabled={isCalculating} style={{ background: '#ff5252', color: 'white', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', width: '100%', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating ? 'Розрахунок…' : 'Розрахувати 3D-розсіювання'}</button>
                    <button onClick={clearScenarioPoint} style={{ display: 'block', width: '100%', marginTop: '9px', padding: '8px', color: '#8b1e1e' }}>Прибрати точку</button>
                </div>
            )}

            {selectedPost && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', border: '1px solid #50c878', padding: '22px', borderRadius: '12px', fontFamily: 'sans-serif', width: '360px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <h2 style={{ margin: '0 0 4px', color: '#50c878' }}>Пост повітря</h2>
                    <h3 style={{ margin: '0 0 14px', fontWeight: 'normal' }}>{selectedPost.name}</h3>
                    <div style={{ background: 'rgba(80, 200, 120, 0.1)', padding: '10px', borderRadius: '6px', fontSize: '13px', lineHeight: 1.55, marginBottom: '14px' }}>
                        <div><b>Вітер:</b> {formatNumber(selectedPost.wind_from_deg, 0)}° · {formatNumber(selectedPost.wind_speed_ms, 2)} м/с</div>
                        <div><b>Температура:</b> {formatNumber(selectedPost.air_temp_c, 1)} °C · <b>Вологість:</b> {formatNumber(selectedPost.humidity_pct, 1)}%</div>
                        <div><b>PM2.5:</b> {formatNumber(selectedPost.pm25_ug_m3, 1)} мкг/м³ · <b>PM10:</b> {formatNumber(selectedPost.pm10_ug_m3, 1)} мкг/м³</div>
                        <div><b>NO₂:</b> {formatNumber(selectedPost.no2_ug_m3, 1)} мкг/м³ · <b>CO₂:</b> {formatNumber(selectedPost.co2_ppm, 1)} ppm</div>
                        <div style={{ color: '#9bd9ae', marginTop: '4px' }}>Оновлено: {formatObservedAt(selectedPost.observed_at)}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '12px' }}>Показники демонстраційно генеруються для всіх постів раз на 5 хвилин. Їх можна замінити реальними спостереженнями через API.</div>
                    <label style={{ display: 'block', marginBottom: '10px' }}>Висота джерела для сценарію (м)
                        <input value={postSourceHeight} onChange={(event) => setPostSourceHeight(event.target.value)} type="number" min="0.5" step="0.5" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '10px' }}>Напрямок вітру, звідки (°)
                        <input value={postWindFromDeg} onChange={(event) => setPostWindFromDeg(event.target.value)} type="number" min="0" max="359" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '14px' }}>Швидкість вітру (м/с)
                        <input value={postWindSpeedMs} onChange={(event) => setPostWindSpeedMs(event.target.value)} type="number" min="0" step="0.1" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
                    </label>
                    <button onClick={() => void calculatePostScenario('pollution')} disabled={isCalculating} style={{ display: 'block', width: '100%', background: '#50c878', color: '#000', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '8px', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating && calculationMode === 'pollution' ? 'Розрахунок…' : 'Розрахувати розсіювання повітря'}</button>
                    <button onClick={() => void calculatePostScenario('heat')} disabled={isCalculating} style={{ display: 'block', width: '100%', background: '#f3a641', color: '#000', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating && calculationMode === 'heat' ? 'Розрахунок…' : 'Розрахувати тепловий слід'}</button>
                    {dispersion && <div style={{ marginTop: '14px', fontSize: '12px', color: '#bdeccf' }}>{dispersion.mode === 'heat' ? 'Тепловий слід' : 'Розсіювання домішки'} · {dispersion.grid.nx}×{dispersion.grid.ny}×{dispersion.grid.nz} комірок · {dispersion.terrain.building_count} будівель · максимум {dispersion.max_value.toExponential(3)} {dispersion.value_unit}</div>}
                    <button onClick={() => setSelectedPost(null)} style={{ display: 'block', margin: '12px auto 0', background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer' }}>Закрити картку</button>
                </div>
            )}

            {dispersion && !selectedPost && !pointFormOpen && (
                <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 2, background: 'rgba(20, 25, 30, 0.93)', color: 'white', padding: '12px 15px', borderRadius: '8px', fontFamily: 'sans-serif', fontSize: '12px' }}>
                    {dispersion.mode === 'heat' ? 'Тепловий слід' : '3D-розсіювання'} · блакитні лінії — напрямок переносу · {dispersion.grid.nx}×{dispersion.grid.ny}×{dispersion.grid.nz} · {dispersion.terrain.building_count} будівель
                </div>
            )}
        </div>
    );
}
