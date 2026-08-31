type MapControlsProps = {
    showTerrain: boolean;
    setShowTerrain: (v: boolean) => void;
};

export function MapControls({ showTerrain, setShowTerrain }: MapControlsProps) {
    return (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1, background: 'rgba(30, 30, 30, 0.9)', color: 'white', padding: '15px', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                <input type="checkbox" checked={showTerrain} onChange={(event) => setShowTerrain(event.target.checked)} />
                <b>Увімкнути 3D-рельєф</b>
            </label>
            <div style={{ marginTop: '10px', color: '#bbb', fontSize: '12px', lineHeight: 1.4 }}>
                ЛКМ по зеленому посту — картка · ЛКМ по карті — точка сценарію
            </div>
        </div>
    );
}
