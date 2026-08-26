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
    zoom: 15,
    pitch: 60, // Зробимо кут ще трохи гострішим для красивого 3D
    bearing: 0
};

export default function MapComponent() {
    const [buildingsData, setBuildingsData] = useState(null);
    const [marker, setMarker] = useState<{ lat: number, lng: number } | null>(null);

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

    const layers = [
        // 1. Шар рельєфу (3D поверхня землі)
        new TerrainLayer({
            id: 'terrain-layer',
            elevationDecoder: {
                rScaler: 256,
                gScaler: 1,
                bScaler: 1 / 256,
                offset: -32768
            },
            elevationData: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            // ДОДАНО: Натягуємо темні тайли карти прямо на 3D-рельєф
            texture: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            operation: 'terrain+draw'
        }),

        // 2. Шар 3D будівель
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

        // 3. Шар маркера (джерело забруднення/тепла)
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
    ];

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
                onClick={handleMapClick}
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'crosshair'}
            >
                {/* Цей базовий MapLibre тепер працює скоріше як фон/небо, 
                    бо основну площину міста відмальовує TerrainLayer з текстурою */}
                <Map
                    mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                />
            </DeckGL>

            {marker && (
                <div style={{
                    position: 'absolute', top: 20, left: 20, zIndex: 1,
                    background: 'rgba(0,0,0,0.8)', color: 'white',
                    padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif'
                }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>Джерело (Точка кліку)</h3>
                    <div>Lat: {marker.lat.toFixed(5)}</div>
                    <div>Lng: {marker.lng.toFixed(5)}</div>
                </div>
            )}
        </div>
    );
}