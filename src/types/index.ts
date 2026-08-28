export interface SunPosition {
  /** Compass azimuth in radians, 0 = north, clockwise. */
  azimuth: number;
  /** Solar altitude in radians (negative = below horizon). */
  altitude: number;
  altitudeDeg: number;
  compassAzimuthDeg: number;
  isNight: boolean;
}

export type SkyPeriod = 'day' | 'goldenHour' | 'twilight' | 'night' | 'moonlight';

export interface SkyCast {
  kind: 'sun' | 'moon' | 'none';
  compassAzimuthDeg: number;
  altitudeDeg: number;
  strength: number;
  rgb: [number, number, number];
}

export interface SkyLighting {
  period: SkyPeriod;
  sun: SunPosition;
  moon: {
    compassAzimuthDeg: number;
    altitudeDeg: number;
    fraction: number;
    isUp: boolean;
  };
  nightAmount: number;
  cast: SkyCast;
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  goldenHour: Date;
  dawn: Date;
  dusk: Date;
}

export interface MonthlyClimate {
  month: number;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  windSpeedMax: number;
  windDirectionDominant: string;
}

export interface WindRoseData {
  direction: string;
  frequency: number;
  avgSpeed: number;
}

export interface DailyClimateSeries {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  temperature_2m_mean: (number | null)[];
  wind_speed_10m_max: (number | null)[];
  wind_direction_10m_dominant: (number | null)[];
}

export type MoonPhaseKey =
  | 'newMoon'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'fullMoon'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export type TidalType = 'springTide' | 'neapTide' | 'moderateTide';

export interface MoonInfo {
  fraction: number;
  phase: number;
  phaseKey: MoonPhaseKey;
  tidalType: TidalType;
  waxing: boolean;
  rise: Date | null;
  set: Date | null;
}

export interface TideExtreme {
  type: 'high' | 'low';
  time: Date;
  height: number;
}

export interface HourlyMarinePoint {
  time: Date;
  seaLevelHeight: number | null;
  waveHeight: number | null;
  oceanCurrentVelocity: number | null;
  oceanCurrentDirection: number | null;
  seaSurfaceTemperature: number | null;
}

export interface TideData {
  hasMarineData: boolean;
  hourlyPoints: HourlyMarinePoint[];
  extremes: TideExtreme[];
  currentHeight: number | null;
  isRising: boolean | null;
  avgWaveHeight: number | null;
  avgSeaTemp: number | null;
  avgCurrentSpeed: number | null;
  moon: MoonInfo;
}
