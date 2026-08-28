import type { MonthlyClimate, WindRoseData } from '../types';
import { WIND_DIRECTIONS } from './constants';

const ARCHIVE_API_URL = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Maps a direction in degrees to a compass string (N, NE, E, etc.).
 */
function getDirectionString(degrees: number): string {
  const index = Math.round((degrees % 360) / 45);
  return WIND_DIRECTIONS[index % 8];
}

/**
 * Finds the most frequent wind direction (mode) from an array of degrees.
 */
function getDominantDirection(directions: number[]): string {
  if (directions.length === 0) return 'N';
  
  const counts: Record<string, number> = {};
  for (const dir of directions) {
    const dStr = getDirectionString(dir);
    counts[dStr] = (counts[dStr] || 0) + 1;
  }
  
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

/**
 * Aggregates daily climate data into monthly averages.
 */
function aggregateByMonth(daily: any): MonthlyClimate[] {
  if (!daily || !daily.time) return [];
  
  const monthly: MonthlyClimate[] = [];
  const monthBins: Record<number, {
    tempMax: number[],
    tempMin: number[],
    tempMean: number[],
    windSpeedMax: number[],
    windDirs: number[]
  }> = {};

  for (let i = 0; i < daily.time.length; i++) {
    const date = new Date(daily.time[i]);
    const month = date.getMonth() + 1;
    
    if (!monthBins[month]) {
      monthBins[month] = { tempMax: [], tempMin: [], tempMean: [], windSpeedMax: [], windDirs: [] };
    }
    
    if (daily.temperature_2m_max[i] !== null) monthBins[month].tempMax.push(daily.temperature_2m_max[i]);
    if (daily.temperature_2m_min[i] !== null) monthBins[month].tempMin.push(daily.temperature_2m_min[i]);
    if (daily.temperature_2m_mean[i] !== null) monthBins[month].tempMean.push(daily.temperature_2m_mean[i]);
    if (daily.wind_speed_10m_max[i] !== null) monthBins[month].windSpeedMax.push(daily.wind_speed_10m_max[i]);
    if (daily.wind_direction_10m_dominant[i] !== null) monthBins[month].windDirs.push(daily.wind_direction_10m_dominant[i]);
  }

  for (let m = 1; m <= 12; m++) {
    if (!monthBins[m]) continue;
    const bin = monthBins[m];
    
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
    const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;

    monthly.push({
      month: m,
      tempMax: max(bin.tempMax),
      tempMin: min(bin.tempMin),
      tempMean: avg(bin.tempMean),
      windSpeedMax: max(bin.windSpeedMax),
      windDirectionDominant: getDominantDirection(bin.windDirs)
    });
  }
  
  return monthly;
}

/**
 * Bins hourly wind data into 8 compass directions.
 */
function binWindDirections(directions: (number | null)[], speeds: (number | null)[]): WindRoseData[] {
  const bins: Record<string, { count: number, totalSpeed: number }> = {};
  
  WIND_DIRECTIONS.forEach(d => {
    bins[d] = { count: 0, totalSpeed: 0 };
  });

  let totalValid = 0;

  for (let i = 0; i < directions.length; i++) {
    const dir = directions[i];
    const spd = speeds[i];
    if (dir !== null && spd !== null) {
      const dirStr = getDirectionString(dir);
      bins[dirStr].count++;
      bins[dirStr].totalSpeed += spd;
      totalValid++;
    }
  }

  return WIND_DIRECTIONS.map(dir => {
    const count = bins[dir].count;
    return {
      direction: dir,
      frequency: totalValid > 0 ? (count / totalValid) * 100 : 0,
      avgSpeed: count > 0 ? bins[dir].totalSpeed / count : 0
    };
  });
}

/**
 * Fetches daily data from Open-Meteo archive API and returns aggregated monthly climate data.
 */
export async function getMonthlyClimate(lat: number, lng: number, year: number = new Date().getFullYear() - 1): Promise<MonthlyClimate[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  
  const url = `${ARCHIVE_API_URL}?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    return aggregateByMonth(data.daily);
  } catch (error) {
    console.error('Error fetching monthly climate:', error);
    return [];
  }
}

/**
 * Fetches hourly wind data for a given month and returns binned wind rose data.
 */
export async function getWindRoseData(lat: number, lng: number, month: number, year: number = new Date().getFullYear() - 1): Promise<WindRoseData[]> {
  const startDay = new Date(year, month - 1, 1);
  const endDay = new Date(year, month, 0); // Last day of the month
  
  const startDate = startDay.toISOString().split('T')[0];
  const endDate = endDay.toISOString().split('T')[0];
  
  const url = `${ARCHIVE_API_URL}?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    return binWindDirections(data.hourly.wind_direction_10m, data.hourly.wind_speed_10m);
  } catch (error) {
    console.error('Error fetching wind rose data:', error);
    return [];
  }
}
