import * as SunCalc from 'suncalc';
import type { SunPosition, SunTimes } from '../types';

/**
 * Calculates sun position for a given date and location.
 * Converts SunCalc's azimuth (from south to west) to compass azimuth (from north to east).
 */
export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  const position = SunCalc.getPosition(date, lat, lng);
  const altitude = position.altitude;
  
  // SunCalc azimuth: 0 is south, Math.PI/2 is west.
  // We want compass azimuth: 0 is north, 90 is east.
  let compassAzimuthDeg = (position.azimuth * 180 / Math.PI) + 180;
  compassAzimuthDeg = (compassAzimuthDeg + 360) % 360;

  return {
    azimuth: position.azimuth,
    altitude,
    compassAzimuthDeg,
    isNight: altitude < 0
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
 * Generates an array of sun positions throughout a given day at specified intervals.
 */
export function getSunPositionsForDay(date: Date, lat: number, lng: number, intervalMinutes: number = 30): { time: Date, position: SunPosition }[] {
  const positions: { time: Date, position: SunPosition }[] = [];
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 24 * 60; i += intervalMinutes) {
    const time = new Date(startOfDay.getTime() + i * 60000);
    positions.push({
      time,
      position: getSunPosition(time, lat, lng)
    });
  }
  return positions;
}

/**
 * Calculates the length of the day in hours.
 * Handles edge cases for polar regions.
 */
export function getDayLength(date: Date, lat: number, lng: number): number {
  const times = SunCalc.getTimes(date, lat, lng);
  
  if (!times.sunrise || !times.sunset) {
    // Polar regions edge cases: it could be 24 hours of light or darkness
    const pos = getSunPosition(date, lat, lng);
    return pos.altitude > 0 ? 24 : 0;
  }
  
  const diffMs = times.sunset.getTime() - times.sunrise.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Formats a Date object into HH:mm time string.
 */
export function formatTime(date: Date): string {
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Determines whether it is currently golden hour.
 */
export function isGoldenHour(date: Date, lat: number, lng: number): boolean {
  const pos = getSunPosition(date, lat, lng);
  const altDeg = pos.altitude * 180 / Math.PI;
  // Golden hour roughly corresponds to sun altitude between -4 and 6 degrees
  return altDeg >= -4 && altDeg <= 6;
}
