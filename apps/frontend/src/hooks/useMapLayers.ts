import { useMemo } from 'react';
import { PathLayer, PointCloudLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MVTLayer, TerrainLayer, TripsLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';

import type { DispersionResult, Post, MapPoint, BuildingProperties, Voxel } from '../types';
import { buildingRiskColor, heatColor, plumeColor, ELEVATION_DECODER } from '../utils';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TERRAIN_EXTENSION = [new TerrainExtension()];

type UseMapLayersProps = {
    showTerrain: boolean;
    dispersion: DispersionResult | null;
    marker: MapPoint | null;
    pointSourceHeight: string;
    posts: Post[];
    selectedPost: Post | null;
    trajectories: Array<{ path: [number, number, number][] }>;
    time: number;
    maxBuildingRisk: number;
};

export function useMapLayers({
    showTerrain,
    dispersion,
    marker,
    pointSourceHeight,
    posts,
    selectedPost,
    trajectories,
    time,
    maxBuildingRisk,
}: UseMapLayersProps) {
    return useMemo(() => [
        showTerrain && new TerrainLayer({
            id: 'terrain-layer',
            elevationDecoder: ELEVATION_DECODER,
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
            getElevation: (feature) => feature.properties?.height ?? 9,
            getFillColor: (feature) => {
                const risk = dispersion?.building_risks?.[feature.properties?.id ?? ''];
                if (!risk) return [74, 80, 87, 210];
                return buildingRiskColor(risk, maxBuildingRisk);
            },
            getLineColor: [0, 0, 0, 100],
            updateTriggers: {
                getFillColor: [dispersion?.building_risks, maxBuildingRisk],
            },
            pickable: true,
            autoHighlight: true,
            extensions: TERRAIN_EXTENSION,
        }),
        new MVTLayer({
            id: 'street-canyons-layer',
            data: `${API_URL}/spatial/canyons/tiles/{z}/{x}/{y}`,
            minZoom: 12,
            maxZoom: 17,
            extruded: true,
            wireframe: false,
            uniqueIdProperty: 'id',
            getElevation: (feature: any) => {
                const canyonConc = dispersion?.canyon_concentrations?.[feature.properties?.id];
                if (!canyonConc) return 2;
                const normalized = Math.max(0, Math.min(1, canyonConc / (dispersion?.max_value || 1)));
                return 10 + normalized * 150; // Формує високий стовп для зон стагнації
            },
            getFillColor: (feature: any) => {
                const canyonConc = dispersion?.canyon_concentrations?.[feature.properties?.id];
                if (!canyonConc) return [255, 255, 255, 15]; // Ледь помітний білий колір для відображення розмітки вулиць
                const normalized = Math.max(0, Math.min(1, canyonConc / (dispersion?.max_value || 1)));
                return [255, Math.round(255 * (1 - normalized)), 0, Math.round(50 + 200 * normalized)];
            },
            updateTriggers: {
                getElevation: [dispersion?.canyon_concentrations, dispersion?.max_value],
                getFillColor: [dispersion?.canyon_concentrations, dispersion?.max_value],
            },
            pickable: true,
            autoHighlight: true,
            extensions: TERRAIN_EXTENSION,
        }),
        new ScatterplotLayer({
            id: 'source-marker-layer',
            data: marker ? [marker] : [],
            getPosition: (point: MapPoint) => [point.lng, point.lat, Math.max(2, Number(pointSourceHeight) || 2)],
            getFillColor: [255, 50, 50, 255],
            getRadius: 25,
            radiusUnits: 'meters',
            pickable: false,
            extensions: TERRAIN_EXTENSION,
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
            extensions: TERRAIN_EXTENSION,
        }),
        selectedPost && new ScatterplotLayer({
            id: 'selected-post-pulse-layer',
            data: [selectedPost],
            getPosition: (post: Post) => [post.lng, post.lat, 30],
            getFillColor: [50, 255, 100, 70],
            getRadius: 100,
            radiusUnits: 'meters',
            pickable: false,
            extensions: TERRAIN_EXTENSION,
        }),
        new PointCloudLayer({
            id: 'dispersion-voxels-layer',
            data: dispersion?.voxels ?? [],
            getPosition: (voxel: Voxel) => voxel.position,
            getColor: (voxel: Voxel) => dispersion?.mode === 'heat' ? heatColor(voxel.normalized) : plumeColor(voxel.normalized),
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
        new TripsLayer({
            id: 'reverse-trajectory-layer',
            data: trajectories,
            getPath: (d: { path: [number, number, number][] }) => d.path.map(p => [p[0], p[1], 20] as [number, number, number]),
            getTimestamps: (d: { path: [number, number, number][] }) => d.path.map(p => p[2]),
            getColor: [255, 255, 50, 200],
            opacity: 0.8,
            widthMinPixels: 3,
            trailLength: 50,
            currentTime: time,
            shadowEnabled: false,
            extensions: TERRAIN_EXTENSION
        })
    ].filter(Boolean), [dispersion, marker, pointSourceHeight, posts, selectedPost, showTerrain, trajectories, time, maxBuildingRisk]);
}
