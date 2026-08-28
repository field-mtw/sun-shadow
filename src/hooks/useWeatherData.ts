import { useEffect, useState } from 'react';
import type { MonthlyClimate, WindRoseData } from '@/types';
import { getMonthlyClimate, getWindRoseData } from '@/lib/weather-client';

export function useWeatherData(lat: number, lng: number, monthIndex: number, enabled = true) {
  const [climateData, setClimateData] = useState<MonthlyClimate[] | null>(null);
  const [windRoseData, setWindRoseData] = useState<WindRoseData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      const latR = Math.round(lat * 5) / 5;
      const lngR = Math.round(lng * 5) / 5;

      Promise.all([getMonthlyClimate(latR, lngR), getWindRoseData(latR, lngR, monthIndex + 1)])
        .then(([climate, wind]) => {
          if (cancelled) return;
          setClimateData(climate);
          setWindRoseData(wind);
        })
        .catch((err: Error) => {
          if (!cancelled) console.error(err);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 1400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lat, lng, monthIndex, enabled]);

  return { climateData, windRoseData, isLoading };
}
