import type { MonthlyClimate, WindRoseData } from '@/types';

export type MapWind = {
  fromDeg: number;
  towardDeg: number;
  speedKmh: number;
  compass: string;
};

const DIR_DEG: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

export function compassToFromDeg(compass: string): number {
  return DIR_DEG[compass] ?? 0;
}

export function deriveMapWind(
  climate: MonthlyClimate | undefined,
  rose: WindRoseData[] | null,
): MapWind | null {
  const top = rose?.reduce<WindRoseData | undefined>(
    (best, row) => (!best || row.frequency > best.frequency ? row : best),
    undefined,
  );
  const compass = top?.direction || climate?.windDirectionDominant;
  if (!compass) return null;

  const speedKmh = top?.avgSpeed || climate?.windSpeedMax || 0;
  const fromDeg = compassToFromDeg(compass);
  return {
    fromDeg,
    towardDeg: (fromDeg + 180) % 360,
    speedKmh,
    compass,
  };
}

function lerpColor(a: number[], b: number[], t: number): number[] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgba(rgb: number[], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function windCoreRgb(speedKmh: number): number[] {
  const t = Math.max(0, Math.min(1, (speedKmh - 3) / 24));
  const deepTeal = [13, 116, 128];
  const strongCyan = [8, 145, 178];
  const amber = [217, 119, 6];
  if (t < 0.55) return lerpColor(deepTeal, strongCyan, t / 0.55);
  return lerpColor(strongCyan, amber, (t - 0.55) / 0.45);
}

export function windColor(speedKmh: number, alpha: number): string {
  return rgba(windCoreRgb(speedKmh), alpha);
}

export function windHeadColor(speedKmh: number, alpha: number): string {
  const core = windCoreRgb(speedKmh);
  const bright = lerpColor(core, [255, 255, 255], 0.35);
  return rgba(bright, alpha);
}

export function windPixelsPerSecond(speedKmh: number): number {
  return 14 + Math.max(0, speedKmh) * 1.6;
}
