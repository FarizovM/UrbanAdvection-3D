import type { MapPoint, MenuPosition, CalculationMode } from '../types';

type ScenarioPointContextMenuProps = {
    marker: MapPoint;
    contextMenu: MenuPosition;
    openPointForm: (mode: CalculationMode) => void;
    clearScenarioPoint: () => void;
};

export function ScenarioPointContextMenu({ marker, contextMenu, openPointForm, clearScenarioPoint }: ScenarioPointContextMenuProps) {
    return (
        <div style={{ position: 'fixed', left: contextMenu.left, top: contextMenu.top, zIndex: 3, background: 'rgba(20, 25, 30, 0.97)', color: 'white', padding: '14px', border: '1px solid #ff5252', borderRadius: '8px', fontFamily: 'sans-serif', width: '250px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            <b style={{ color: '#ff7777' }}>Точка сценарію</b>
            <div style={{ fontSize: '12px', color: '#bbb', margin: '8px 0 12px' }}>{marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}</div>
            <button onClick={() => openPointForm('pollution')} style={{ display: 'block', width: '100%', marginBottom: '8px', padding: '9px' }}>Симулювати розсіювання домішки</button>
            <button onClick={() => openPointForm('heat')} style={{ display: 'block', width: '100%', marginBottom: '8px', padding: '9px', background: '#f3a641', border: 'none', borderRadius: '4px' }}>Розрахувати тепловий слід</button>
            <button onClick={clearScenarioPoint} style={{ display: 'block', width: '100%', padding: '9px', color: '#8b1e1e' }}>Прибрати точку</button>
        </div>
    );
}
