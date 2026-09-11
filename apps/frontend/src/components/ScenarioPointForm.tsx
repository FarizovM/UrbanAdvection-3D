import type { MapPoint, CalculationMode } from '../types';

type ScenarioPointFormProps = {
    marker: MapPoint;
    calculationMode: CalculationMode;
    isCalculating: boolean;
    pointSourceHeight: string;
    setPointSourceHeight: (v: string) => void;
    pointEmissionRate: string;
    setPointEmissionRate: (v: string) => void;
    pointWindFromDeg: string;
    setPointWindFromDeg: (v: string) => void;
    pointWindSpeedMs: string;
    setPointWindSpeedMs: (v: string) => void;
    calculatePointScenario: (mode: CalculationMode) => void;
    clearScenarioPoint: () => void;
};

export function ScenarioPointForm({
    marker,
    calculationMode,
    isCalculating,
    pointSourceHeight,
    setPointSourceHeight,
    pointEmissionRate,
    setPointEmissionRate,
    pointWindFromDeg,
    setPointWindFromDeg,
    pointWindSpeedMs,
    setPointWindSpeedMs,
    calculatePointScenario,
    clearScenarioPoint,
}: ScenarioPointFormProps) {
    return (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', border: '1px solid #ff5252', padding: '22px', borderRadius: '12px', fontFamily: 'sans-serif', width: '340px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 5px', color: calculationMode === 'heat' ? '#f3a641' : '#ff7777' }}>{calculationMode === 'heat' ? 'Тепловий слід' : 'Симуляція викиду'}</h2>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>Точка: {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</div>
            <label style={{ display: 'block', marginBottom: '10px' }}>{calculationMode === 'heat' ? 'Висота теплового джерела (м)' : 'Висота викиду (м)'}
                <input value={pointSourceHeight} onChange={(event) => setPointSourceHeight(event.target.value)} type="number" min="0.5" step="0.5" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
            </label>
            <label style={{ display: 'block', marginBottom: '10px' }}>{calculationMode === 'heat' ? 'Інтенсивність теплового джерела (умовні од./с)' : 'Потужність викиду (г/с)'}
                <input value={pointEmissionRate} onChange={(event) => setPointEmissionRate(event.target.value)} type="number" min="0" step="0.1" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
            </label>
            <label style={{ display: 'block', marginBottom: '10px' }}>Напрямок, звідки дме вітер (°)
                <input value={pointWindFromDeg} onChange={(event) => setPointWindFromDeg(event.target.value)} type="number" min="0" max="359" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
            </label>
            <label style={{ display: 'block', marginBottom: '16px' }}>Швидкість вітру (м/с)
                <input value={pointWindSpeedMs} onChange={(event) => setPointWindSpeedMs(event.target.value)} type="number" min="0" step="0.1" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '8px' }} />
            </label>
            <button onClick={() => void calculatePointScenario(calculationMode)} disabled={isCalculating} style={{ background: calculationMode === 'heat' ? '#f3a641' : '#ff5252', color: calculationMode === 'heat' ? '#000' : 'white', border: 'none', padding: '11px', borderRadius: '6px', fontWeight: 'bold', width: '100%', cursor: isCalculating ? 'wait' : 'pointer' }}>{isCalculating ? 'Розрахунок…' : calculationMode === 'heat' ? 'Розрахувати 3D-тепловий слід' : 'Розрахувати 3D-розсіювання'}</button>
            <button onClick={clearScenarioPoint} style={{ display: 'block', width: '100%', marginTop: '9px', padding: '8px', color: '#8b1e1e' }}>Прибрати точку</button>
        </div>
    );
}
