export interface SunPosition {
  azimuth: number;
  altitude: number;
  compassAzimuthDeg: number;
  isNight: boolean;
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  goldenHour: Date;
  dawn: Date;
  dusk: Date;
  [key: string]: Date; // For other properties returned by SunCalc
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

export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
}

export interface BookmarkLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  createdAt: string;
}

export interface ExportOptions {
  format: 'png';
  includeUI: boolean;
}

export interface AppState {
  selectedDate: Date;
  selectedTime: string;
  location: [number, number];
  month: number;
}
