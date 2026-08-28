import * as SunCalc from 'suncalc';
import type { SkyLighting, SunPosition, SunTimes } from '../types';
import { WIND_DIRECTIONS } from './constants';

/**
 * Calculates sun position for a given date and location.
 * suncalc v2 returns compass degrees (0 = north) and altitude in degrees.
 */
export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  const position = SunCalc.getPosition(date, lat, lng);
  const compassAzimuthDeg = ((position.azimuth % 360) + 360) % 360;
  const altitudeDeg = position.altitude;
  const altitude = altitudeDeg * Math.PI / 180;

  return {
    azimuth: compassAzimuthDeg * Math.PI / 180,
    altitude,
    altitudeDeg,
    compassAzimuthDeg,
    isNight: altitude < 0,
  };
}

/**
 * Gets important sun times (sunrise, sunset, etc.) for a given date and location.
 */
export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
  const times = SunCalc.getTimes(date, lat, lng);
  return {
    sunrise: times.sunrise ?? date,
    sunset: times.sunset ?? date,
    solarNoon: times.solarNoon ?? date,
    goldenHour: times.goldenHour ?? date,
    dawn: times.dawn ?? date,
    dusk: times.dusk ?? date,
  };
}

/**
 * Calculates the length of the day in hours.
 * Handles edge cases for polar regions.
 */
export function getDayLength(date: Date, lat: number, lng: number): number {
  const times = SunCalc.getTimes(date, lat, lng);

  if (!times.sunrise || !times.sunset) {
    const pos = getSunPosition(date, lat, lng);
    return pos.altitude > 0 ? 24 : 0;
  }

  return (times.sunset.getTime() - times.sunrise.getTime()) / (1000 * 60 * 60);
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return combined;
}

export function formatDayLength(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export function toLocalDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function compassFromDeg(deg: number): string {
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return WIND_DIRECTIONS[index];
}

export function clampTimeToSunWindow(time: Date, sunrise: Date, sunset: Date): Date {
  const t = time.getTime();
  if (t < sunrise.getTime()) return new Date(sunrise.getTime());
  if (t > sunset.getTime()) return new Date(sunset.getTime());
  return time;
}

/**
 * Determines whether it is currently golden hour.
 */
export function isGoldenHour(date: Date, lat: number, lng: number): boolean {
  const pos = getSunPosition(date, lat, lng);
  return pos.altitudeDeg >= -4 && pos.altitudeDeg <= 6;
}

export function getMoonPosition(date: Date, lat: number, lng: number): {
  compassAzimuthDeg: number;
  altitudeDeg: number;
  fraction: number;
  isUp: boolean;
} {
  const position = SunCalc.getMoonPosition(date, lat, lng);
  const illumination = SunCalc.getMoonIllumination(date);
  const compassAzimuthDeg = ((position.azimuth % 360) + 360) % 360;
  const altitudeDeg = position.altitude;
  return {
    compassAzimuthDeg,
    altitudeDeg,
    fraction: illumination.fraction,
    isUp: altitudeDeg > 0,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const SUN_SHADOW_RGB: [number, number, number] = [0.004, 0.067, 0.184];
const WARM_SHADOW_RGB: [number, number, number] = [0.09, 0.06, 0.05];
const MOON_SHADOW_RGB: [number, number, number] = [0.03, 0.07, 0.14];

/**
 * Lighting + shadow source for a moment in time.
 * Day/golden hour: sun umbra. Twilight: long sun umbra fading out.
 * Night: faint moon umbra when the moon is up, otherwise ambient darkness only.
 */
export function getSkyLighting(date: Date, lat: number, lng: number): SkyLighting {
  const sun = getSunPosition(date, lat, lng);
  const moon = getMoonPosition(date, lat, lng);
  const alt = sun.altitudeDeg;

  let period: SkyLighting['period'];
  if (alt >= 8) period = 'day';
  else if (alt >= 0) period = 'goldenHour';
  else if (alt >= -6) period = 'twilight';
  else if (moon.isUp && moon.altitudeDeg > 4 && moon.fraction > 0.12) period = 'moonlight';
  else period = 'night';

  const nightAmount =
    alt >= 8 ? 0
    : alt >= 0 ? 0.12 * (1 - alt / 8)
    : alt >= -6 ? 0.12 + 0.42 * ((-alt) / 6)
    : 0.54 + 0.28 * clamp01((-6 - alt) / 12);

  let cast: SkyLighting['cast'];
  if (alt >= -6) {
    const strength = alt >= 0 ? 1 : clamp01((alt + 6) / 6);
    const warm = alt < 12;
    cast = {
      kind: 'sun',
      compassAzimuthDeg: sun.compassAzimuthDeg,
      altitudeDeg: alt >= 0 ? alt : 3.6,
      strength,
      rgb: warm ? WARM_SHADOW_RGB : SUN_SHADOW_RGB,
    };
  } else if (moon.altitudeDeg > 2 && moon.fraction > 0.12) {
    const moonLift = clamp01((moon.altitudeDeg - 2) / 38);
    cast = {
      kind: 'moon',
      compassAzimuthDeg: moon.compassAzimuthDeg,
      altitudeDeg: Math.max(7, moon.altitudeDeg),
      strength: 0.22 + 0.5 * moon.fraction * moonLift,
      rgb: MOON_SHADOW_RGB,
    };
  } else {
    cast = {
      kind: 'none',
      compassAzimuthDeg: sun.compassAzimuthDeg,
      altitudeDeg: 0,
      strength: 0,
      rgb: SUN_SHADOW_RGB,
    };
  }

  return { period, sun, moon, nightAmount, cast };
}
