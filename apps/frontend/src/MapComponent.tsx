import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// Початкова точка камери (Центр Києва, нахил 45 градусів для 3D ефекту)
const INITIAL_VIEW_STATE = {
    longitude: 30.5234,
    latitude: 50.4501,
    zoom: 15,
    pitch: 45,
    bearing: 0
};

export default function MapComponent() {
    const [buildingsData, setBuildingsData] = useState(null);

    useEffect(() => {
        // Задаємо BBox навколо центру Києва для тестового запиту
        const bbox = 'minLng=30.51&minLat=50.44&maxLng=30.54&maxLat=50.46';

        fetch(`http://localhost:3000/spatial/buildings?${bbox}`)
            .then(res => res.json())
            .then(data => {
                // Конвертуємо відповідь Prisma у GeoJSON FeatureCollection
                const geojson = {
                    type: 'FeatureCollection',
                    features: data.map(b => ({
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

    const layers = [
        new GeoJsonLayer({
            id: '3d-buildings-layer',
            data: buildingsData,
            extruded: true,           // Вмикаємо 3D-екструзію
            wireframe: true,          // Малюємо контури дахів
            getElevation: f => f.properties.height,
            getFillColor: [74, 80, 87, 255], // Темно-сірий колір будівель
            getLineColor: [0, 0, 0, 100],
            pickable: true,
            autoHighlight: true,      // Підсвічування при наведенні
        })
    ];

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={layers}
                // Встановлюємо темний фон карти
                getCursor={({ isDragging }) => isDragging ? 'grabbing' : 'grab'}
            >
                <Map
                    mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                />
            </DeckGL>
        </div>
    );
}