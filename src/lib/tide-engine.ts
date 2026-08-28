import * as SunCalc from 'suncalc';
import type { HourlyMarinePoint, MoonInfo, MoonPhaseKey, TidalType, TideExtreme } from '@/types';

export function getMoonPhaseKey(phase: number): MoonPhaseKey {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.04 || p >= 0.96) return 'newMoon';
  if (p < 0.21) return 'waxingCrescent';
  if (p < 0.29) return 'firstQuarter';
  if (p < 0.46) return 'waxingGibbous';
  if (p < 0.54) return 'fullMoon';
  if (p < 0.71) return 'waningGibbous';
  if (p < 0.79) return 'lastQuarter';
  return 'waningCrescent';
}

export function getTidalType(phase: number): TidalType {
  const p = ((phase % 1) + 1) % 1;
  // Near 0 (New Moon) or 0.5 (Full Moon) -> Spring Tide (น้ำเกิด)
  if (p <= 0.08 || p >= 0.92 || (p >= 0.42 && p <= 0.58)) {
    return 'springTide';
  }
  // Near 0.25 (First Quarter) or 0.75 (Last Quarter) -> Neap Tide (น้ำตาย)
  if ((p >= 0.18 && p <= 0.32) || (p >= 0.68 && p <= 0.82)) {
    return 'neapTide';
  }
  return 'moderateTide';
}

export function getMoonInfo(date: Date, lat: number, lng: number): MoonInfo {
  const illum = SunCalc.getMoonIllumination(date);
  const times = SunCalc.getMoonTimes(date, lat, lng);
  const phaseKey = getMoonPhaseKey(illum.phase);
  const tidalType = getTidalType(illum.phase);

  return {
    fraction: illum.fraction,
    phase: illum.phase,
    phaseKey,
    tidalType,
    waxing: illum.phase < 0.5,
    rise: times.rise ? new Date(times.rise) : null,
    set: times.set ? new Date(times.set) : null,
  };
}

export function findTideExtremes(points: HourlyMarinePoint[]): TideExtreme[] {
  const valid = points.filter((p): p is HourlyMarinePoint & { seaLevelHeight: number } => p.seaLevelHeight !== null);
  if (valid.length < 3) return [];

  const extremes: TideExtreme[] = [];

  for (let i = 1; i < valid.length - 1; i++) {
    const prev = valid[i - 1].seaLevelHeight;
    const curr = valid[i].seaLevelHeight;
    const next = valid[i + 1].seaLevelHeight;

    if (curr > prev && curr >= next) {
      extremes.push({
        type: 'high',
        time: valid[i].time,
        height: curr,
      });
    } else if (curr < prev && curr <= next) {
      extremes.push({
        type: 'low',
        time: valid[i].time,
        height: curr,
      });
    }
  }

  // If no interior peaks found but points exist, take global min and max
  if (extremes.length === 0 && valid.length > 0) {
    let maxP = valid[0];
    let minP = valid[0];
    for (const p of valid) {
      if (p.seaLevelHeight > maxP.seaLevelHeight) maxP = p;
      if (p.seaLevelHeight < minP.seaLevelHeight) minP = p;
    }
    if (maxP.seaLevelHeight !== minP.seaLevelHeight) {
      extremes.push({ type: 'high', time: maxP.time, height: maxP.seaLevelHeight });
      extremes.push({ type: 'low', time: minP.time, height: minP.seaLevelHeight });
      extremes.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
  }

  return extremes;
}

export function interpolateWaterHeight(
  points: HourlyMarinePoint[],
  currentTime: Date,
): { height: number | null; isRising: boolean | null } {
  const valid = points.filter((p): p is HourlyMarinePoint & { seaLevelHeight: number } => p.seaLevelHeight !== null);
  if (valid.length === 0) return { height: null, isRising: null };

  const target = currentTime.getTime();
  let before: (HourlyMarinePoint & { seaLevelHeight: number }) | null = null;
  let after: (HourlyMarinePoint & { seaLevelHeight: number }) | null = null;

  for (let i = 0; i < valid.length; i++) {
    const t = valid[i].time.getTime();
    if (t <= target) before = valid[i];
    if (t >= target && !after) {
      after = valid[i];
      break;
    }
  }

  if (!before && after) return { height: after.seaLevelHeight, isRising: null };
  if (before && !after) return { height: before.seaLevelHeight, isRising: null };
  if (!before && !after) return { height: valid[0].seaLevelHeight, isRising: null };

  if (before && after) {
    if (before.time.getTime() === after.time.getTime()) {
      return { height: before.seaLevelHeight, isRising: null };
    }
    const ratio = (target - before.time.getTime()) / (after.time.getTime() - before.time.getTime());
    const height = before.seaLevelHeight + (after.seaLevelHeight - before.seaLevelHeight) * ratio;
    const isRising = after.seaLevelHeight > before.seaLevelHeight;
    return { height, isRising };
  }

  return { height: null, isRising: null };
}
