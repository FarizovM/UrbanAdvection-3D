import type { CalculationMode } from '../types';

type MapControlsProps = {
    showTerrain: boolean;
    setShowTerrain: (v: boolean) => void;
    calculationMode: CalculationMode;
    setCalculationMode: (v: CalculationMode) => void;
    calculateCityIDW: () => void;
};

export function MapControls({ showTerrain, setShowTerrain, calculationMode, setCalculationMode, calculateCityIDW }: MapControlsProps) {
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
                }} />
                <b>Загальноміська карта (IDW)</b>
            </label>
            <div style={{ marginTop: '10px', color: '#bbb', fontSize: '12px', lineHeight: 1.4 }}>
                ЛКМ по зеленому посту — картка · ЛКМ по карті — точка сценарію
            </div>
        </div>
    );
}
