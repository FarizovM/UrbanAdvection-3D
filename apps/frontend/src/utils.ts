import type { ColorRGBA } from './types.ts';

export function plumeColor(value: number): ColorRGBA {
    const normalized = Math.max(0, Math.min(1, value));
    return [
        Math.round(40 + 215 * normalized),
        Math.round(180 - 140 * normalized),
        Math.round(255 - 220 * normalized),
        Math.round(35 + 200 * normalized),
    ];
}

export function heatColor(value: number): ColorRGBA {
    const normalized = Math.max(0, Math.min(1, value));
    const stops: Array<ColorRGBA> = [
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

export function buildingRiskColor(risk: number, maxRisk: number): ColorRGBA {
    const normalized = Math.max(0, Math.min(1, risk / maxRisk));
    // Amber to crimson: [255, 190, 0] -> [220, 20, 60]
    return [
        Math.round(255 - 35 * normalized),
        Math.round(190 - 170 * normalized),
        Math.round(0 + 60 * normalized),
        255
    ];
}

export function formatObservedAt(value: string | Date | null | undefined): string {
    return value == null ? 'немає даних' : new Date(value).toLocaleTimeString('uk-UA');
}

export const ELEVATION_DECODER = { rScaler: 256, gScaler: 1, bScaler: 1 / 256, offset: -32768 };

export function calculateCityIDW(posts: any[], resolutionDeg = 0.005) {
    if (!posts || posts.length === 0) return { voxels: [], maxValue: 0 };

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const p of posts) {
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
    }

    minLng -= 0.05; maxLng += 0.05;
    minLat -= 0.05; maxLat += 0.05;

    const alphaFactor = 2.0;
    let maxValue = 0;
    const gridValues = [];

    for (let lng = minLng; lng <= maxLng; lng += resolutionDeg) {
        for (let lat = minLat; lat <= maxLat; lat += resolutionDeg) {
            let num = 0;
            let den = 0;

            for (const p of posts) {
                // Determine value to interpolate (e.g. pm25, fallback to 1)
                const aqValue = p.pm25_ug_m3 ?? p.no2_ug_m3 ?? p.pm10_ug_m3 ?? 10;

                const windSpeed = p.wind_speed_ms ?? 0;
                const windDir = p.wind_from_deg ?? 0;
                const windToDeg = (windDir + 180) % 360;

                const dy = lat - p.lat;
                const cosLat = Math.cos(p.lat * Math.PI / 180);
                const dx = (lng - p.lng) * cosLat;

                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1e-6) dist = 1e-6;

                const angleRad = Math.atan2(dx, dy); // dx=E, dy=N
                const angleDeg = (angleRad * 180 / Math.PI + 360) % 360;

                let theta = Math.abs(windToDeg - angleDeg);
                if (theta > 180) theta = 360 - theta;

                const alpha = windSpeed * alphaFactor;
                const thetaRad = theta * Math.PI / 180;
                const penalty = 1 + alpha * Math.pow(Math.sin(thetaRad / 2), 2);
                const penalizedDist = dist * penalty;

                const weight = 1 / Math.pow(penalizedDist, 2);

                num += weight * aqValue;
                den += weight;
            }

            if (den > 0) {
                const val = num / den;
                gridValues.push({ lng, lat, val });
                if (val > maxValue) maxValue = val;
            }
        }
    }

    const voxels = gridValues.map(cell => ({
        position: [cell.lng, cell.lat, 0] as [number, number, number],
        value: cell.val,
        normalized: maxValue > 0 ? cell.val / maxValue : 0
    }));

    return { voxels, maxValue };
}
