import type { DispersionResult, CalculationMode } from '../types';
import { formatNumber } from '../utils';

type MapLegendProps = {
    dispersion: DispersionResult | null;
    trajectories: Array<{ path: [number, number, number][] }>;
    calculationMode: CalculationMode;
    maxBuildingRisk: number;
};

export function MapLegend({ dispersion, trajectories, calculationMode, maxBuildingRisk }: MapLegendProps) {
    if (!dispersion && trajectories.length === 0) return null;

    return (
        <div style={{ position: 'absolute', bottom: 30, right: 20, zIndex: 1, background: 'rgba(20, 20, 20, 0.95)', color: 'white', padding: '16px', borderRadius: '12px', fontFamily: 'sans-serif', width: '320px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', border: '1px solid #444' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', borderBottom: '1px solid #555', paddingBottom: '8px' }}>
                Легенда симуляції
            </h3>

            {trajectories.length > 0 && calculationMode === 'trajectory' && (
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Зворотне трасування повітряних мас</div>
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>Відображає можливі шляхи надходження повітря до поста за останні 10 хвилин.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '20px', height: '4px', background: 'rgba(255, 255, 50, 0.8)' }}></div>
                        <span style={{ fontSize: '12px' }}>Траєкторія частинки</span>
                    </div>
                </div>
            )}

            {dispersion && calculationMode === 'pollution' && (
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#ff7777' }}>Розсіювання забруднення (Плюм)</div>
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>Концентрація речовини (відносні одиниці, де {formatNumber(dispersion.max_value, 2)} — максимум на сітці). Від синього (фонове розсіювання) до червоного (ядро викиду).</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span>0</span>
                        <span>{formatNumber(dispersion.max_value / 2, 2)}</span>
                        <span>{formatNumber(dispersion.max_value, 2)}</span>
                    </div>
                    <div style={{ height: '12px', background: 'linear-gradient(to right, rgb(40, 180, 255), rgb(147, 110, 145), rgb(255, 40, 35))', borderRadius: '4px', marginBottom: '16px' }}></div>

                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#ffcc00' }}>Експозиція будівель (Ризик)</div>
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>Накопичена доза забруднення на фасадах × населення будівлі.</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span>0</span>
                        <span>{formatNumber(maxBuildingRisk, 1)}</span>
                    </div>
                    <div style={{ height: '12px', background: 'linear-gradient(to right, rgb(74, 80, 87), rgb(255, 190, 0), rgb(220, 20, 60))', borderRadius: '4px', marginBottom: '16px' }}></div>

                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>Вуличні каньйони</div>
                    <div style={{ fontSize: '12px', color: '#ccc' }}>Зони стагнації, де H/W ≥ 1.5, відображаються як об'ємні червоні стовпи (висота пропорційна концентрації застою).</div>
                </div>
            )}

            {dispersion && calculationMode === 'heat' && (
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#f3a641' }}>Тепловий слід (ΔT °C)</div>
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>Аномальне підвищення температури повітря від джерела тепла.</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span>+0 °C</span>
                        <span>+{formatNumber(dispersion.max_value / 2, 1)} °C</span>
                        <span>+{formatNumber(dispersion.max_value, 1)} °C</span>
                    </div>
                    <div style={{ height: '12px', background: 'linear-gradient(to right, rgb(45, 15, 100), rgb(94, 28, 154), rgb(193, 35, 104), rgb(244, 99, 38), rgb(255, 213, 58), rgb(255, 247, 170))', borderRadius: '4px', marginBottom: '16px' }}></div>

                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#ffcc00' }}>Теплове навантаження будівель</div>
                    <div style={{ fontSize: '12px', color: '#ccc', marginBottom: '8px' }}>Вплив теплового сліду на фасади прилеглих будівель.</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span>Норма</span>
                        <span>Максимум</span>
                    </div>
                    <div style={{ height: '12px', background: 'linear-gradient(to right, rgb(74, 80, 87), rgb(255, 190, 0), rgb(220, 20, 60))', borderRadius: '4px' }}></div>
                </div>
            )}
        </div>
    );
}
