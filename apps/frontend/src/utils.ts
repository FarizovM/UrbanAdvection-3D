export function plumeColor(value: number): [number, number, number, number] {
    const normalized = Math.max(0, Math.min(1, value));
    return [
        Math.round(40 + 215 * normalized),
        Math.round(180 - 140 * normalized),
        Math.round(255 - 220 * normalized),
        Math.round(35 + 200 * normalized),
    ];
}

export function heatColor(value: number): [number, number, number, number] {
    const normalized = Math.max(0, Math.min(1, value));
    const stops: Array<[number, number, number, number]> = [
        [45, 15, 100, 45],
        [94, 28, 154, 95],
        [193, 35, 104, 155],
        [244, 99, 38, 205],
        [255, 213, 58, 235],
        [255, 247, 170, 245],
    ];
    const scaled = normalized * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const ratio = scaled - index;
    const start = stops[index];
    const end = stops[index + 1];
    return [
        Math.round(start[0] + (end[0] - start[0]) * ratio),
        Math.round(start[1] + (end[1] - start[1]) * ratio),
        Math.round(start[2] + (end[2] - start[2]) * ratio),
        Math.round(start[3] + (end[3] - start[3]) * ratio),
    ];
}

export function formatNumber(value: number | null | undefined, requestedDigits = 1): string {
    if (value == null) return '—';
    if (value === 0) return '0';

    let digits = requestedDigits;
    const abs = Math.abs(value);

    // Динамічно збільшуємо кількість знаків після коми для дуже малих чисел, 
    // щоб уникнути наукового формату (e-4, e-5) і не показувати просто '0'
    if (abs < 0.0001) digits = 6;
    else if (abs < 0.001) digits = 5;
    else if (abs < 0.01) digits = 4;
    else if (abs < 0.1) digits = 3;

    return new Intl.NumberFormat('en-US', {
        useGrouping: false,
        maximumFractionDigits: Math.max(digits, 2)
    }).format(value);
}

export function buildingRiskColor(risk: number, maxRisk: number): [number, number, number, number] {
    const normalized = Math.max(0, Math.min(1, risk / maxRisk));
    // Amber to crimson: [255, 190, 0] -> [220, 20, 60]
    return [
        Math.round(255 - 35 * normalized),
        Math.round(190 - 170 * normalized),
        Math.round(0 + 60 * normalized),
        255
    ];
}

export function formatObservedAt(value: string | null | undefined): string {
    return value == null ? 'немає даних' : new Date(value).toLocaleTimeString('uk-UA');
}

export const ELEVATION_DECODER = { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 };
