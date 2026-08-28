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
  return useMemo(() => {
    const datetime = combineDateAndTime(date, time);
    const times = getSunTimes(date, lat, lng);
    const position = getSunPosition(datetime, lat, lng);
    const dayLength = getDayLength(date, lat, lng);
    const sky = getSkyLighting(datetime, lat, lng);
    return {
      datetime,
      position,
      times,
      dayLength,
      dayLengthLabel: formatDayLength(dayLength),
      isGoldenHour: isGoldenHour(datetime, lat, lng),
      sky,
    };
  }, [date, time, lat, lng]);
}
