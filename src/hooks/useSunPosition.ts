import { useMemo } from 'react';
import {
  combineDateAndTime,
  formatDayLength,
  getDayLength,
  getSkyLighting,
  getSunPosition,
  getSunTimes,
  isGoldenHour,
} from '@/lib/sun-engine';

export function useSunPosition(date: Date, time: Date, lat: number, lng: number) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const daily = useMemo(() => {
    const d = new Date(year, month, day, 12, 0, 0, 0);
    const times = getSunTimes(d, lat, lng);
    const dayLength = getDayLength(d, lat, lng);
    return {
      times,
      dayLength,
      dayLengthLabel: formatDayLength(dayLength),
    };
  }, [year, month, day, lat, lng]);

  return useMemo(() => {
    const datetime = combineDateAndTime(date, time);
    const sky = getSkyLighting(datetime, lat, lng);
    const position = sky.sun;
    return {
      datetime,
      position,
      times: daily.times,
      dayLength: daily.dayLength,
      dayLengthLabel: daily.dayLengthLabel,
      isGoldenHour: position.altitudeDeg >= -4 && position.altitudeDeg <= 6,
      sky,
    };
  }, [date, time, lat, lng, daily]);
}
