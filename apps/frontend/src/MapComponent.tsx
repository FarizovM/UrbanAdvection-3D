import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import type { MapViewState } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TerrainLayer } from '@deck.gl/geo-layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE: MapViewState = {
    longitude: 30.5234,
    latitude: 50.4501,
    zoom: 14,
    pitch: 60,
    bearing: 0
};

export default function MapComponent() {
    const [buildingsData, setBuildingsData] = useState(null);
    const [marker, setMarker] = useState<{ lat: number, lng: number } | null>(null);

    // Стан для перемикача рельєфу
    const [showTerrain, setShowTerrain] = useState(true);

    useEffect(() => {
        const bbox = 'minLng=30.48&minLat=50.42&maxLng=30.56&maxLat=50.48';

        fetch(`http://localhost:3000/spatial/buildings?${bbox}`)
            .then(res => res.json())
            .then(data => {
                const geojson = {
                    type: 'FeatureCollection',
                    features: data.map((b: any) => ({
                        type: 'Feature',
                        geometry: b.footprint_json,
                        properties: {
                            id: b.id,
                            name: b.name,
                            height: b.height
                        }
                    }))
                };
                setBuildingsData(geojson);
            })
            .catch(err => console.error("Помилка завантаження будівель:", err));
    }, []);

    const handleMapClick = (info: any) => {
        if (info.coordinate) {
            const [lng, lat] = info.coordinate;
            setMarker({ lat, lng });
        }
    };

    // Формуємо масив шарів. Використовуємо .filter(Boolean) щоб відкинути false/null
    const layers = [
        // Додаємо шар рельєфу тільки якщо showTerrain === true
        showTerrain && new TerrainLayer({
            id: 'terrain-layer',
            elevationDecoder: {
                rScaler: 256,
                gScaler: 1,
                bScaler: 1 / 256,
                offset: -32768
            },
            elevationData: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            texture: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            // ВИПРАВЛЕННЯ ЗУМУ: Обмежуємо запити до API на зумі 14
            maxZoom: 15,
            operation: 'terrain+draw'
        }),

        new GeoJsonLayer({
            id: '3d-buildings-layer',
            data: buildingsData,
            extruded: true,
            wireframe: true,
            getElevation: (f: any) => f.properties.height,
            getFillColor: [74, 80, 87, 255],
            getLineColor: [0, 0, 0, 100],
            pickable: true,
            autoHighlight: true,
            extensions: [new TerrainExtension()],
        }),

        new ScatterplotLayer({
            id: 'source-marker-layer',
            data: marker ? [marker] : [],
            getPosition: d => [d.lng, d.lat, 50],
            getFillColor: [255, 50, 50, 255],
            getRadius: 30,
            radiusUnits: 'meters',
            pickable: true,
            extensions: [new TerrainExtension()],
        })
    ].filter(Boolean); // Фільтруємо масив, щоб Deck.gl не сварився на `false`

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
                onClick={handleMapClick}
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'crosshair'}
            >
                <Map mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" />
            </DeckGL>

            {/* Панель керування у правому верхньому куті */}
            <div style={{
                position: 'absolute', top: 20, right: 20, zIndex: 1,
                background: 'rgba(30, 30, 30, 0.9)', color: 'white',
                padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <input
                        type="checkbox"
                        checked={showTerrain}
                        onChange={(e) => setShowTerrain(e.target.checked)}
                        style={{ width: '18px', height: '18px' }}
                    />
                    <b>Увімкнути 3D-рельєф</b>
                </label>
            </div>

            {/* Плашка джерела */}
            {marker && (
                <div style={{
                    position: 'absolute', top: 20, left: 20, zIndex: 1,
                    background: 'rgba(30, 30, 30, 0.9)', color: 'white',
                    padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}>
                    <h3 style={{ margin: '0 0 10px 0', color: '#ff5252' }}>Точка розрахунку</h3>
                    <div style={{ marginBottom: '5px' }}><b>Lat:</b> {marker.lat.toFixed(5)}</div>
                    <div><b>Lng:</b> {marker.lng.toFixed(5)}</div>
                </div>
            )}
        </div>
    );
}