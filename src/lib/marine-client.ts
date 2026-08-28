import { OPEN_METEO_MARINE_URL } from './constants';
import { openMeteoJson } from './open-meteo';
import { pad2 } from './sun-engine';
import type { HourlyMarinePoint } from '@/types';

interface RawMarineApiResponse {
  hourly?: {
    time: string[];
    sea_level_height_msl?: (number | null)[];
    wave_height?: (number | null)[];
    ocean_current_velocity?: (number | null)[];
    ocean_current_direction?: (number | null)[];
    sea_surface_temperature?: (number | null)[];
  };
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export async function fetchMarineData(
  lat: number,
  lng: number,
  date: Date,
): Promise<{
  hasMarineData: boolean;
  points: HourlyMarinePoint[];
  avgWaveHeight: number | null;
  avgSeaTemp: number | null;
  avgCurrentSpeed: number | null;
}> {
  const dateStr = toDateString(date);
  const url =
    `${OPEN_METEO_MARINE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${dateStr}&end_date=${dateStr}` +
    `&hourly=wave_height,sea_level_height_msl,ocean_current_velocity,ocean_current_direction,sea_surface_temperature` +
    `&timezone=auto`;

  const data = await openMeteoJson<RawMarineApiResponse>(url);
  const hourly = data?.hourly;

  if (!hourly || !hourly.time || hourly.time.length === 0) {
    return {
      hasMarineData: false,
      points: [],
      avgWaveHeight: null,
      avgSeaTemp: null,
      avgCurrentSpeed: null,
    };
  }

  const points: HourlyMarinePoint[] = [];
  let waveSum = 0;
  let waveCount = 0;
  let tempSum = 0;
  let tempCount = 0;
  let currentSum = 0;
  let currentCount = 0;
  let hasValidSeaLevel = false;

  for (let i = 0; i < hourly.time.length; i++) {
    const time = new Date(hourly.time[i]);
    const seaLevelHeight = hourly.sea_level_height_msl?.[i] ?? null;
    const waveHeight = hourly.wave_height?.[i] ?? null;
    const oceanCurrentVelocity = hourly.ocean_current_velocity?.[i] ?? null;
    const oceanCurrentDirection = hourly.ocean_current_direction?.[i] ?? null;
    const seaSurfaceTemperature = hourly.sea_surface_temperature?.[i] ?? null;

    if (seaLevelHeight !== null) hasValidSeaLevel = true;

    if (waveHeight !== null) {
      waveSum += waveHeight;
      waveCount++;
    }
    if (seaSurfaceTemperature !== null) {
      tempSum += seaSurfaceTemperature;
      tempCount++;
    }
    if (oceanCurrentVelocity !== null) {
      currentSum += oceanCurrentVelocity;
      currentCount++;
    }

    points.push({
      time,
      seaLevelHeight,
      waveHeight,
      oceanCurrentVelocity,
      oceanCurrentDirection,
      seaSurfaceTemperature,
    });
  }

  return {
    hasMarineData: hasValidSeaLevel,
    points,
    avgWaveHeight: waveCount > 0 ? waveSum / waveCount : null,
    avgSeaTemp: tempCount > 0 ? tempSum / tempCount : null,
    avgCurrentSpeed: currentCount > 0 ? currentSum / currentCount : null,
  };
}
