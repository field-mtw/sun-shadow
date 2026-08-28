import { useState, useEffect } from 'react';

export function useWeatherData(lat: number, lng: number) {
  const [climateData, setClimateData] = useState<any[] | null>(null);
  const [windRoseData, setWindRoseData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // fetch open-meteo data here
  }, [lat, lng]);

  return { climateData, windRoseData, isLoading, error };
}
