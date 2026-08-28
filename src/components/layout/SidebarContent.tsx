'use client';

import { useTranslations } from 'next-intl';
import LocationSearch from '@/components/search/LocationSearch';
import DatePicker from '@/components/controls/DatePicker';
import SunInfoPanel from '@/components/info/SunInfoPanel';
import WeatherPanel from '@/components/weather/WeatherPanel';
import TidePanel from '@/components/tides/TidePanel';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SunMark from '@/components/icons/SunMark';
import WindMark from '@/components/icons/WindMark';
import TideMark from '@/components/icons/TideMark';
import type { MonthlyClimate, TideData, WindRoseData } from '@/types';
import type { MapWind } from '@/lib/wind-vector';

export type SidebarTab = 'sun' | 'wind' | 'tide';

interface SidebarContentProps {
  locationName: string;
  lat: number;
  lng: number;
  date: Date;
  time: Date;
  month: number;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onSelectLocation: (location: { lat: number; lng: number; name: string }) => void;
  onDateChange: (date: Date) => void;
  onMonthChange: (month: number) => void;
  climateData: MonthlyClimate[] | null;
  windRoseData: WindRoseData[] | null;
  weatherLoading: boolean;
  tideData?: TideData | null;
  tideLoading?: boolean;
  hideSearch?: boolean;
  wind?: MapWind | null;
  windEmphasized?: boolean;
  onToggleWindEmphasis?: () => void;
}

export default function SidebarContent({
  locationName,
  lat,
  lng,
  date,
  time,
  month,
  tab,
  onTabChange,
  onSelectLocation,
  onDateChange,
  onMonthChange,
  climateData,
  windRoseData,
  weatherLoading,
  tideData,
  tideLoading = false,
  hideSearch = false,
  wind,
  windEmphasized,
  onToggleWindEmphasis,
}: SidebarContentProps) {
  const t = useTranslations('sidebar');
  const tDir = useTranslations('directions');
  const tWeather = useTranslations('weather');

  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-fg-muted">{locationName}</div>
      <LocationSearch
        onSelect={onSelectLocation}
        variant="panel"
        showPresets
        hideField={hideSearch}
      />

      <DatePicker value={date} onChange={onDateChange} />

      <SegmentedControl
        value={tab}
        onChange={onTabChange}
        options={[
          {
            id: 'sun' as const,
            label: t('sunTab'),
            icon: <SunMark size={16} />,
            tone: 'sun',
          },
          {
            id: 'wind' as const,
            label: t('windTab'),
            icon: <WindMark size={16} />,
            tone: 'wind',
          },
          {
            id: 'tide' as const,
            label: t('tideTab'),
            icon: <TideMark size={16} />,
            tone: 'tide',
          },
        ]}
      />

      {tab === 'sun' && <SunInfoPanel date={date} time={time} lat={lat} lng={lng} />}

      {tab === 'wind' && (
        <>
          <WeatherPanel
            selectedMonth={month}
            onMonthChange={onMonthChange}
            climateData={climateData}
            windRoseData={windRoseData}
            isLoading={weatherLoading}
          />
          {wind && onToggleWindEmphasis && (
            <button
              type="button"
              onClick={onToggleWindEmphasis}
              aria-pressed={windEmphasized}
              title={windEmphasized ? tWeather('windSofter') : tWeather('windClearer')}
              className="mt-3 flex w-full items-center rounded-[var(--radius-chip)] px-3 py-2 text-left text-xs font-medium text-fg hover:bg-[var(--glass-hover)]"
            >
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent-wind)]" />
              {tDir(wind.compass)} · {wind.speedKmh.toFixed(0)} {tWeather('kmh')}
              <span className="ml-auto text-[10px] font-normal text-fg-muted">
                {windEmphasized ? tWeather('windSofter') : tWeather('windClearer')}
              </span>
            </button>
          )}
        </>
      )}

      {tab === 'tide' && tideData && (
        <TidePanel tideData={tideData} time={time} isLoading={tideLoading} />
      )}
    </div>
  );
}
