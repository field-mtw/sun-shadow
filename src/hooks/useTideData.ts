import { useEffect, useMemo, useState } from 'react';
import { fetchMarineData } from '@/lib/marine-client';
import { findTideExtremes, getMoonInfo, interpolateWaterHeight } from '@/lib/tide-engine';
import { combineDateAndTime } from '@/lib/sun-engine';
import type { HourlyMarinePoint, TideData } from '@/types';

export function useTideData(
  lat: number,
  lng: number,
  date: Date,
  time: Date,
  enabled = true,
): TideData & { isLoading: boolean } {
  const [points, setPoints] = useState<HourlyMarinePoint[]>([]);
  const [hasMarineData, setHasMarineData] = useState(false);
  const [avgWaveHeight, setAvgWaveHeight] = useState<number | null>(null);
  const [avgSeaTemp, setAvgSeaTemp] = useState<number | null>(null);
  const [avgCurrentSpeed, setAvgCurrentSpeed] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const moon = useMemo(() => getMoonInfo(date, lat, lng), [date, lat, lng]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      const latR = Math.round(lat * 5) / 5;
      const lngR = Math.round(lng * 5) / 5;

      fetchMarineData(latR, lngR, date)
        .then((res) => {
          if (cancelled) return;
          setPoints(res.points);
          setHasMarineData(res.hasMarineData);
          setAvgWaveHeight(res.avgWaveHeight);
          setAvgSeaTemp(res.avgSeaTemp);
          setAvgCurrentSpeed(res.avgCurrentSpeed);
        })
        .catch((err) => {
          if (!cancelled) console.error('[SolariaScope] Marine fetch error:', err);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lat, lng, date, enabled]);

  const currentDateTime = useMemo(() => combineDateAndTime(date, time), [date, time]);

  const { height: currentHeight, isRising } = useMemo(
    () => interpolateWaterHeight(points, currentDateTime),
    [points, currentDateTime],
  );

  const extremes = useMemo(() => findTideExtremes(points), [points]);

  return {
    hasMarineData,
    hourlyPoints: points,
    extremes,
    currentHeight,
    isRising,
    avgWaveHeight,
    avgSeaTemp,
    avgCurrentSpeed,
    moon,
    isLoading,
  };
}
