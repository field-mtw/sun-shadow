'use client';

import { useTranslations } from 'next-intl';

interface SunInfoPanelProps {
  date: Date;
  lat: number;
  lng: number;
}

export default function SunInfoPanel({ date, lat, lng }: SunInfoPanelProps) {
  const t = useTranslations('sun');
  
  return (
    <div className="glass-panel p-4 rounded-lg mb-4">
      <h3 className="font-semibold mb-3">{t('title') || 'Sun Information'}</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-white/50 dark:bg-black/50 p-2 rounded">
          <div className="text-xs text-slate-500">{t('sunrise') || 'Sunrise'}</div>
          <div className="font-medium">06:00</div>
        </div>
        <div className="bg-white/50 dark:bg-black/50 p-2 rounded">
          <div className="text-xs text-slate-500">{t('sunset') || 'Sunset'}</div>
          <div className="font-medium">18:00</div>
        </div>
        <div className="bg-white/50 dark:bg-black/50 p-2 rounded">
          <div className="text-xs text-slate-500">{t('solarNoon') || 'Solar Noon'}</div>
          <div className="font-medium">12:00</div>
        </div>
        <div className="bg-white/50 dark:bg-black/50 p-2 rounded">
          <div className="text-xs text-slate-500">{t('dayLength') || 'Day Length'}</div>
          <div className="font-medium">12h 0m</div>
        </div>
      </div>
    </div>
  );
}
