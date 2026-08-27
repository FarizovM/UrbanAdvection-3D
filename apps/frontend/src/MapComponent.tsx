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
    const [showTerrain, setShowTerrain] = useState(true);

    // Стан для кліку по карті (червоний маркер)
    const [marker, setMarker] = useState<{ lat: number, lng: number } | null>(null);

    // Стан для ВСІХ постів моніторингу
    const [posts, setPosts] = useState<any[]>([]);

    // Стан для масиву знайдених постів (зелені маркери)
    const [nearestPosts, setNearestPosts] = useState<any[]>([]);

    // Стан для вибраного поста (картка з кнопкою)
    const [selectedPost, setSelectedPost] = useState<any | null>(null);

    // 1. Завантаження будівель (з NestJS)
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
                        properties: { id: b.id, name: b.name, height: b.height }
                    }))
                };
                setBuildingsData(geojson);
            })
            .catch(err => console.error("Помилка завантаження будівель:", err));

        // Завантаження постів моніторингу
        fetch('http://localhost:8000/api/posts')
            .then(res => res.json())
            .then(result => {
                if (result.status === 'success') {
                    setPosts(result.data);
                }
            })
            .catch(err => console.error("Помилка завантаження постів:", err));

    }, []);

    // Обробка кліків по карті та об'єктах
    const handleMapClick = (info: any) => {
        // Якщо клікнули на пост моніторингу
        if (info.object && info.layer.id === 'monitoring-posts-layer') {
            setSelectedPost(info.object);
            return;
        }

        // Якщо клікнули просто по карті - ставимо джерело
        if (info.coordinate) {
            const [lng, lat] = info.coordinate;
            setMarker({ lat, lng });
            setSelectedPost(null); // Ховаємо картку, якщо клікнули повз
        }
    };

    const layers = [
        showTerrain && new TerrainLayer({
            id: 'terrain-layer',
            elevationDecoder: { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 },
            elevationData: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
            texture: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            maxZoom: 14,
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

        // Червоний маркер - точка нашого кліку
        new ScatterplotLayer({
            id: 'source-marker-layer',
            data: marker ? [marker] : [],
            getPosition: d => [d.lng, d.lat, 20],
            getFillColor: [255, 50, 50, 255],
            getRadius: 25,
            radiusUnits: 'meters',
            pickable: false, // Відключаємо, щоб не заважав клікати
            extensions: [new TerrainExtension()],
        }),

        // Зелені маркери - знайдені пости моніторингу
        new ScatterplotLayer({
            id: 'monitoring-posts-layer',
            data: posts,
            getPosition: d => [d.lng, d.lat, 30],
            getFillColor: [50, 200, 100, 255],
            getRadius: 40,
            radiusUnits: 'meters',
            pickable: true,
            autoHighlight: true,
            extensions: [new TerrainExtension()],
        })
    ].filter(Boolean);

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

            {/* Перемикач рельєфу (Справа зверху) */}
            <div style={{
                position: 'absolute', top: 20, right: 20, zIndex: 1,
                background: 'rgba(30, 30, 30, 0.9)', color: 'white',
                padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif',
            }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <input
                        type="checkbox" checked={showTerrain}
                        onChange={(e) => setShowTerrain(e.target.checked)}
                        style={{ width: '18px', height: '18px' }}
                    />
                    <b>Увімкнути 3D-рельєф</b>
                </label>
            </div>

            {/* Плашка точки кліку та список знайдених постів (Зліва зверху) */}
            {marker && !selectedPost && (
                <div style={{
                    position: 'absolute', top: 20, left: 20, zIndex: 1,
                    background: 'rgba(30, 30, 30, 0.9)', color: 'white',
                    padding: '20px', borderRadius: '8px', fontFamily: 'sans-serif',
                    width: '280px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#ff5252' }}>Точка аналізу</h3>
                    <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '15px' }}>
                        Клікніть на знайдений пост на карті (зелений), щоб провести симуляцію.
                    </div>
                    {nearestPosts.length > 0 ? (
                        <>
                            <h4 style={{ margin: '0 0 10px 0', color: '#50c878' }}>Пости в радіусі 3 км:</h4>
                            <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px' }}>
                                {nearestPosts.map(post => (
                                    <li key={post.id} style={{ marginBottom: '8px' }}>
                                        {post.name} <br />
                                        <span style={{ color: '#aaa', fontSize: '12px' }}>Відстань: {Math.round(post.distance_m)} м</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <div style={{ fontSize: '14px', color: '#aaa' }}>Постів поруч не знайдено</div>
                    )}
                </div>
            )}

            {/* Картка вибраного поста (По центру) */}
            {selectedPost && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 2,
                    background: 'rgba(20, 25, 30, 0.95)', color: 'white', border: '1px solid #50c878',
                    padding: '25px', borderRadius: '12px', fontFamily: 'sans-serif',
                    width: '320px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center'
                }}>
                    <h2 style={{ margin: '0 0 5px 0', color: '#50c878' }}>Датчик екології</h2>
                    <h3 style={{ margin: '0 0 20px 0', fontWeight: 'normal' }}>{selectedPost.name}</h3>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '14px' }}>
                        <div><b>PM2.5:</b> 12 µg/m³</div>
                        <div><b>NO2:</b> 45 µg/m³</div>
                        <div><b>t°:</b> 22°C</div>
                    </div>

                    <button
                        style={{
                            background: '#50c878', color: '#000', border: 'none', padding: '12px 20px',
                            borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%'
                        }}
                        onClick={() => alert(`Тут ми відправимо координати ${selectedPost.lat}, ${selectedPost.lng} в Python для генерації Plume!`)}
                    >
                        Розрахувати розсіювання
                    </button>

                    <button
                        style={{
                            background: 'transparent', color: '#aaa', border: 'none', padding: '10px',
                            marginTop: '10px', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline'
                        }}
                        onClick={() => setSelectedPost(null)}
                    >
                        Закрити
                    </button>
                </div>
            )}
        </div>
    );
}