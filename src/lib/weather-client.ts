import type { DailyClimateSeries, MonthlyClimate, WindRoseData } from '../types';
import { OPEN_METEO_ARCHIVE_URL, WIND_DIRECTIONS } from './constants';
import { compassFromDeg, pad2 } from './sun-engine';
import { openMeteoJson } from './open-meteo';

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getDominantDirection(directions: number[]): string {
  if (directions.length === 0) return 'N';
  const counts: Record<string, number> = {};
  for (const dir of directions) {
    const key = compassFromDeg(dir);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
}

function aggregateByMonth(daily: DailyClimateSeries | undefined): MonthlyClimate[] {
  if (!daily?.time) return [];

  const monthBins: Record<
    number,
    { tempMax: number[]; tempMin: number[]; tempMean: number[]; windSpeedMax: number[]; windDirs: number[] }
  > = {};

  for (let i = 0; i < daily.time.length; i++) {
    const month = new Date(daily.time[i]).getMonth() + 1;
    if (!monthBins[month]) {
      monthBins[month] = { tempMax: [], tempMin: [], tempMean: [], windSpeedMax: [], windDirs: [] };
    }
    const bin = monthBins[month];
    const tempMax = daily.temperature_2m_max[i];
    const tempMin = daily.temperature_2m_min[i];
    const tempMean = daily.temperature_2m_mean[i];
    const windMax = daily.wind_speed_10m_max[i];
    const windDir = daily.wind_direction_10m_dominant[i];
    if (tempMax != null) bin.tempMax.push(tempMax);
    if (tempMin != null) bin.tempMin.push(tempMin);
    if (tempMean != null) bin.tempMean.push(tempMean);
    if (windMax != null) bin.windSpeedMax.push(windMax);
    if (windDir != null) bin.windDirs.push(windDir);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const monthly: MonthlyClimate[] = [];
  for (let month = 1; month <= 12; month++) {
    const bin = monthBins[month];
    if (!bin) continue;
    monthly.push({
      month,
      tempMax: bin.tempMax.length ? Math.max(...bin.tempMax) : 0,
      tempMin: bin.tempMin.length ? Math.min(...bin.tempMin) : 0,
      tempMean: avg(bin.tempMean),
      windSpeedMax: bin.windSpeedMax.length ? Math.max(...bin.windSpeedMax) : 0,
      windDirectionDominant: getDominantDirection(bin.windDirs),
    });
  }
  return monthly;
}

function binWindDirections(directions: (number | null)[], speeds: (number | null)[]): WindRoseData[] {
  const bins = Object.fromEntries(WIND_DIRECTIONS.map((d) => [d, { count: 0, totalSpeed: 0 }])) as Record<
    string,
    { count: number; totalSpeed: number }
  >;
  let totalValid = 0;

  for (let i = 0; i < directions.length; i++) {
    const dir = directions[i];
    const spd = speeds[i];
    if (dir == null || spd == null) continue;
    const key = compassFromDeg(dir);
    bins[key].count += 1;
    bins[key].totalSpeed += spd;
    totalValid += 1;
  }

  return WIND_DIRECTIONS.map((direction) => {
    const { count, totalSpeed } = bins[direction];
    return {
      direction,
      frequency: totalValid > 0 ? (count / totalValid) * 100 : 0,
      avgSpeed: count > 0 ? totalSpeed / count : 0,
    };
  });
}

export async function getMonthlyClimate(
  lat: number,
  lng: number,
  year: number = new Date().getFullYear() - 1,
): Promise<MonthlyClimate[]> {
  const url =
    `${OPEN_METEO_ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${year}-01-01&end_date=${year}-12-31` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto`;

  const data = await openMeteoJson<{ daily?: DailyClimateSeries }>(url);
  return aggregateByMonth(data?.daily);
}

export async function getWindRoseData(
  lat: number,
  lng: number,
  month: number,
  year: number = new Date().getFullYear() - 1,
): Promise<WindRoseData[]> {
  const startDate = toYmd(new Date(year, month - 1, 1));
  const endDate = toYmd(new Date(year, month, 0));
  const url =
    `${OPEN_METEO_ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=wind_speed_10m,wind_direction_10m&timezone=auto`;

  const data = await openMeteoJson<{
    hourly?: { wind_direction_10m?: (number | null)[]; wind_speed_10m?: (number | null)[] };
  }>(url);
  const hourly = data?.hourly;
  if (!hourly?.wind_direction_10m || !hourly.wind_speed_10m) return [];
  return binWindDirections(hourly.wind_direction_10m, hourly.wind_speed_10m);
}
