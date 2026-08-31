import type { Post, DispersionResult, CalculationMode } from '../types';
import { formatNumber, formatObservedAt } from '../utils';

type PostCardProps = {
    selectedPost: Post;
    dispersion: DispersionResult | null;
    trajectories: Array<{ path: [number, number, number][] }>;
    calculationMode: CalculationMode;
    isCalculating: boolean;
    postSourceHeight: string;
    setPostSourceHeight: (value: string) => void;
    postWindFromDeg: string;
    setPostWindFromDeg: (value: string) => void;
    postWindSpeedMs: string;
    setPostWindSpeedMs: (value: string) => void;
    calculatePostScenario: (mode: CalculationMode) => void;
    calculateReverseTrajectory: () => void;
    onClose: () => void;
};

export function PostCard({
    selectedPost,
    dispersion,
    trajectories,
    calculationMode,
    isCalculating,
    postSourceHeight,
    setPostSourceHeight,
    postWindFromDeg,
    setPostWindFromDeg,
    postWindSpeedMs,
    setPostWindSpeedMs,
    calculatePostScenario,
    calculateReverseTrajectory,
    onClose,
}: PostCardProps) {
    return (
        <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', border: '1px solid #50c878', padding: '22px', borderRadius: '12px', fontFamily: 'sans-serif', width: '360px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
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
            <button onClick={() => void calculatePostScenario('pollution')} disabled={isCalculating} style={{ display: 'block', width: '100%', background: '#50c878', color: '#000', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '8px', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating && calculationMode === 'pollution' ? 'Розрахунок…' : 'Розрахувати розсіювання повітря'}
            </button>
            <button onClick={() => void calculatePostScenario('heat')} disabled={isCalculating} style={{ display: 'block', width: '100%', background: '#f3a641', color: '#000', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', marginBottom: '8px', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating && calculationMode === 'heat' ? 'Розрахунок…' : 'Розрахувати тепловий слід'}
            </button>
            <button onClick={() => void calculateReverseTrajectory()} disabled={isCalculating} style={{ display: 'block', width: '100%', background: '#ffeb3b', color: '#000', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating && trajectories.length === 0 && calculationMode === 'trajectory' ? 'Розрахунок…' : 'Знайти джерело (Трасування)'}
            </button>
            {dispersion && <div style={{ marginTop: '14px', fontSize: '12px', color: dispersion.mode === 'heat' ? '#ffd56a' : '#bdeccf' }}>{dispersion.mode === 'heat' ? 'Тепловий слід' : 'Розсіювання домішки'} · {dispersion.grid.nx}×{dispersion.grid.ny}×{dispersion.grid.nz} комірок · {dispersion.terrain.building_count} будівель · максимум {dispersion.max_value.toExponential(3)} {dispersion.value_unit}</div>}
            <button onClick={onClose} style={{ display: 'block', margin: '12px auto 0', background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer' }}>Закрити картку</button>
        </div>
    );
}
