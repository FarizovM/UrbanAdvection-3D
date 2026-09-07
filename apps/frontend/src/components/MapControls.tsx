import type { CalculationMode } from '../types';

type MapControlsProps = {
    showTerrain: boolean;
    setShowTerrain: (v: boolean) => void;
    calculationMode: CalculationMode;
    setCalculationMode: (v: CalculationMode) => void;
    calculateCityIDW: () => void;
    isCalculating: boolean;
};

export function MapControls({ showTerrain, setShowTerrain, calculationMode, setCalculationMode, calculateCityIDW, isCalculating }: MapControlsProps) {
    return (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1, background: 'rgba(30, 30, 30, 0.9)', color: 'white', padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                <input type="checkbox" checked={showTerrain} onChange={(event) => setShowTerrain(event.target.checked)} />
                <b>Увімкнути 3D-рельєф</b>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px', marginTop: '10px' }}>
                <input type="checkbox" checked={calculationMode === 'city-idw'} onChange={(event) => {
                    if (event.target.checked) {
                        calculateCityIDW();
                    } else {
                        setCalculationMode('pollution');
                    }
                }} disabled={isCalculating && calculationMode !== 'city-idw'} />
                <b>Загальноміська карта (IDW)</b>
                {isCalculating && calculationMode === 'city-idw' && (
                    <span style={{ fontSize: '12px', color: '#50c878', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span className="spinner" style={{ width: '12px', height: '12px', border: '2px solid #50c878', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }}></span>
                        Завантаження...
                    </span>
                )}
            </label>
            <div style={{ marginTop: '10px', color: '#bbb', fontSize: '12px', lineHeight: 1.4 }}>
                ЛКМ по зеленому посту — картка · ЛКМ по карті — точка сценарію
            </div>
        </div>
    );
}
