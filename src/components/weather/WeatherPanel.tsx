'use client';

import { useTranslations } from 'next-intl';

interface WeatherPanelProps {
  lat: number;
  lng: number;
  selectedMonth: number;
}

export default function WeatherPanel({ lat, lng, selectedMonth }: WeatherPanelProps) {
  const t = useTranslations('weather');
  
  return (
    <div className="glass-panel p-4 rounded-lg mb-4">
      <h3 className="font-semibold mb-3">{t('title') || 'Climate Data'}</h3>
      <div className="text-sm">
        <p>Avg Temp: 28°C</p>
        <p>Wind: 10 km/h SW</p>
        {/* Skeleton or real data goes here */}
      </div>
    </div>
  );
}
