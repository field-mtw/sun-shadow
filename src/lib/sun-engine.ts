import * as SunCalc from 'suncalc';
import type { SunPosition, SunTimes } from '../types';
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
