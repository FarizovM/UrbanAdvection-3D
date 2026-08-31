import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import DeckGL from '@deck.gl/react';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { CalculationMode, Post, MapPoint, MenuPosition, DispersionResult } from './types';
import { MapLegend } from './components/MapLegend';
import { PostCard } from './components/PostCard';
import { ScenarioPointContextMenu } from './components/ScenarioPointContextMenu';
import { ScenarioPointForm } from './components/ScenarioPointForm';
import { MapControls } from './components/MapControls';
import { ErrorNotification } from './components/ErrorNotification';
import { useMapLayers } from './hooks/useMapLayers';

const INITIAL_VIEW_STATE: MapViewState = {
    longitude: 30.5234,
    latitude: 50.4501,
    zoom: 12,
    pitch: 60,
    bearing: 0,
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

    const [trajectories, setTrajectories] = useState<Array<{ path: [number, number, number][] }>>([]);
    const [time, setTime] = useState(0);

    // Animation loop for TripsLayer
    useEffect(() => {
        let animation: number;
        const animate = () => {
            setTime(t => (t + 1) % 600);
            animation = requestAnimationFrame(animate);
        };
        if (trajectories.length > 0) {
            animate();
        }
        return () => cancelAnimationFrame(animation);
    }, [trajectories]);

    useEffect(() => {
        let isActive = true;
        const loadPosts = async () => {
            try {
                const response = await fetch(`${API_URL}/simulations/posts`);
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
        setTrajectories([]);
    };

    const selectPost = (post: Post) => {
        setSelectedPost(post);
        setMarker(null);
        setContextMenu(null);
        setPointFormOpen(false);
        setDispersion(null);
        setTrajectories([]);
        setCalculationMode('pollution');
        setPostWindFromDeg(post.wind_from_deg == null ? '' : String(post.wind_from_deg));
        setPostWindSpeedMs(post.wind_speed_ms == null ? '' : String(post.wind_speed_ms));
    };

    const handleMapClick = (info: PickingInfo<Post>, event: { srcEvent?: Event }) => {
        if (event.srcEvent instanceof MouseEvent && event.srcEvent.button !== 0) return;
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
        setTrajectories([]);
        setContextMenu({
            left: Math.min(Math.max(info.pixel?.[0] ?? 24, 12), Math.max(12, window.innerWidth - 285)),
            top: Math.min(Math.max(info.pixel?.[1] ?? 24, 12), Math.max(12, window.innerHeight - 210)),
        });
    };

    const preventBrowserContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const openPointForm = (mode: CalculationMode) => {
        setCalculationMode(mode);
        setPointFormOpen(true);
        setContextMenu(null);
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

            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail ?? 'Помилка');

            const runId = payload.run_id;
            // 2. Запитуємо статус кожні 2 секунди (Polling)
            return new Promise((resolve) => {
                const interval = setInterval(async () => {
                    const statusRes = await fetch(`${API_URL}/simulations/dispersion/${runId}`);
                    const statusData = await statusRes.json();

                    if (statusData.status === 'COMPLETED') {
                        setDispersion(statusData.result);
                        setIsCalculating(false);
                        clearInterval(interval);
                        resolve(true);
                    } else if (statusData.status === 'FAILED') {
                        setError(statusData.error || 'Помилка симуляції');
                        setIsCalculating(false);
                        clearInterval(interval);
                        resolve(false);
                    }
                    // Якщо статус PENDING або RUNNING - нічого не робимо, чекаємо наступної ітерації
                }, 2000);
            });
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : 'Помилка розрахунку');
            setIsCalculating(false);
            return false;
        }
    };

    const calculatePointScenario = async (mode: CalculationMode) => {
        if (!marker) return;
        const wind = validateWind(pointWindFromDeg, pointWindSpeedMs);
        const height = Number(pointSourceHeight);
        const emissionRate = Number(pointEmissionRate);
        if (!wind || !Number.isFinite(height) || height < 0.5 || !Number.isFinite(emissionRate) || emissionRate < 0) {
            setError(mode === 'heat'
                ? 'Вкажіть висоту джерела від 0,5 м і невід’ємну інтенсивність теплового джерела'
                : 'Вкажіть висоту джерела від 0,5 м і невід’ємну потужність викиду');
            return;
        }
        setCalculationMode(mode);
        const successful = await sendCalculation({
            source: { lng: marker.lng, lat: marker.lat, height_m: height, emission_rate_gps: emissionRate, duration_s: 300 },
            wind_from_deg: wind.direction,
            wind_speed_ms: wind.speed,
            radius_m: 3000,
            resolution_m: 50,
            vertical_resolution_m: 10,
            z_max_m: 240,
            duration_s: 300,
            mode,
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

    const calculateReverseTrajectory = async () => {
        if (!selectedPost) return;
        setCalculationMode('trajectory');
        const wind = validateWind(postWindFromDeg, postWindSpeedMs);
        if (!wind) {
            setError('Вкажіть метеодані для зворотного трасування');
            return;
        }
        setIsCalculating(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/simulations/reverse-trajectory`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    lng: selectedPost.lng,
                    lat: selectedPost.lat,
                    wind_from_deg: wind.direction,
                    wind_speed_ms: wind.speed,
                    duration_s: 600,
                }),
            });
            const payload = await response.json();
            if (!response.ok || payload.status !== 'success') {
                throw new Error(payload.detail ?? 'Помилка зворотного трасування');
            }
            setTrajectories(payload.result.particles);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCalculating(false);
        }
    };

    const maxBuildingRisk = useMemo(() =>
        dispersion?.building_risks ? Math.max(...Object.values(dispersion.building_risks), 1e-9) : 1
        , [dispersion?.building_risks]);

    const layers = useMapLayers({
        showTerrain,
        dispersion,
        marker,
        pointSourceHeight,
        posts,
        selectedPost,
        trajectories,
        time,
        maxBuildingRisk
    });

    return (
        <div onContextMenu={preventBrowserContextMenu} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
                onClick={handleMapClick}
                getCursor={({ isHovering, isDragging }) => isDragging ? 'grabbing' : (isHovering ? 'pointer' : 'crosshair')}
            >
                <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
            </DeckGL>

            <MapControls showTerrain={showTerrain} setShowTerrain={setShowTerrain} />

            <ErrorNotification error={error} setError={setError} />

            {marker && contextMenu && !pointFormOpen && !selectedPost && (
                <ScenarioPointContextMenu
                    marker={marker}
                    contextMenu={contextMenu}
                    openPointForm={openPointForm}
                    clearScenarioPoint={clearScenarioPoint}
                />
            )}

            {marker && pointFormOpen && !selectedPost && (
                <ScenarioPointForm
                    marker={marker}
                    calculationMode={calculationMode}
                    isCalculating={isCalculating}
                    pointSourceHeight={pointSourceHeight}
                    setPointSourceHeight={setPointSourceHeight}
                    pointEmissionRate={pointEmissionRate}
                    setPointEmissionRate={setPointEmissionRate}
                    pointWindFromDeg={pointWindFromDeg}
                    setPointWindFromDeg={setPointWindFromDeg}
                    pointWindSpeedMs={pointWindSpeedMs}
                    setPointWindSpeedMs={setPointWindSpeedMs}
                    calculatePointScenario={calculatePointScenario}
                    clearScenarioPoint={clearScenarioPoint}
                />
            )}

            {selectedPost && (
                <PostCard
                    selectedPost={selectedPost}
                    dispersion={dispersion}
                    trajectories={trajectories}
                    calculationMode={calculationMode}
                    isCalculating={isCalculating}
                    postSourceHeight={postSourceHeight}
                    setPostSourceHeight={setPostSourceHeight}
                    postWindFromDeg={postWindFromDeg}
                    setPostWindFromDeg={setPostWindFromDeg}
                    postWindSpeedMs={postWindSpeedMs}
                    setPostWindSpeedMs={setPostWindSpeedMs}
                    calculatePostScenario={calculatePostScenario}
                    calculateReverseTrajectory={calculateReverseTrajectory}
                    onClose={() => { setSelectedPost(null); setTrajectories([]); setDispersion(null); }}
                />
            )}

            <MapLegend
                dispersion={dispersion}
                trajectories={trajectories}
                calculationMode={calculationMode}
                maxBuildingRisk={maxBuildingRisk}
            />
        </div>
    );
}
