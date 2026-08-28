'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import Header from '@/components/layout/Header';
import { DEFAULT_CENTER } from '@/lib/constants';
import { combineDateAndTime, formatTime, getSkyLighting, getSunTimes } from '@/lib/sun-engine';
import Sidebar from '@/components/layout/Sidebar';
import SidebarContent from '@/components/layout/SidebarContent';
import TimeBar from '@/components/controls/TimeBar';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import BottomSheet from '@/components/ui/BottomSheet';
import Dock from '@/components/ui/Dock';
import SunMark from '@/components/icons/SunMark';
import WindMark from '@/components/icons/WindMark';
import TideMark from '@/components/icons/TideMark';
import { useWeatherData } from '@/hooks/useWeatherData';
import { useTideData } from '@/hooks/useTideData';
import { deriveMapWind } from '@/lib/wind-vector';
import WindFlowOverlay from '@/components/map/WindFlowOverlay';
import type { ShadowMapRef } from '@/components/map/ShadowMap';
import type { SidebarTab } from '@/components/layout/SidebarContent';

const ShadowMap = dynamic(() => import('@/components/map/ShadowMap'), { ssr: false });

function daytimeOrNoon(date: Date, lat: number, lng: number): Date {
  const times = getSunTimes(date, lat, lng);
  if (date >= times.sunrise && date <= times.sunset) return date;
  return times.solarNoon;
}

export default function Home() {
  const mapRef = useRef<ShadowMapRef>(null);
  const tHeader = useTranslations('header');
  const tSide = useTranslations('sidebar');
  const tLocations = useTranslations('locations');
  const tMap = useTranslations('map');
  const [location, setLocation] = useState({
    lat: DEFAULT_CENTER[1],
    lng: DEFAULT_CENTER[0],
    name: tLocations('bangkok'),
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<Date>(() =>
    daytimeOrNoon(new Date(), DEFAULT_CENTER[1], DEFAULT_CENTER[0]),
  );
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sun');
  const [windEmphasized, setWindEmphasized] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const wide = window.matchMedia('(min-width: 1280px)');
    const applyMobile = () => setIsMobile(mobile.matches);
    const frame = requestAnimationFrame(() => {
      applyMobile();
      if (wide.matches) setIsSidebarOpen(true);
    });
    mobile.addEventListener('change', applyMobile);
    return () => {
      cancelAnimationFrame(frame);
      mobile.removeEventListener('change', applyMobile);
    };
  }, []);

  const sunTimes = useMemo(
    () => getSunTimes(selectedDate, location.lat, location.lng),
    [selectedDate, location.lat, location.lng],
  );
  const sky = useMemo(
    () => getSkyLighting(combineDateAndTime(selectedDate, selectedTime), location.lat, location.lng),
    [selectedDate, selectedTime, location.lat, location.lng],
  );
  const { climateData, windRoseData, isLoading: weatherLoading } = useWeatherData(
    location.lat,
    location.lng,
    selectedMonth,
    sidebarTab === 'wind',
  );
  const tideData = useTideData(
    location.lat,
    location.lng,
    selectedDate,
    selectedTime,
    sidebarTab === 'tide',
  );
  const mapWind = useMemo(
    () => deriveMapWind(
      climateData?.find((row) => row.month === selectedMonth + 1),
      windRoseData,
    ),
    [climateData, windRoseData, selectedMonth],
  );

  const handleDateChange = (nextDate: Date) => {
    setSelectedDate(nextDate);
    setSelectedTime(combineDateAndTime(nextDate, selectedTime));
    setSelectedMonth(nextDate.getMonth());
  };

  const handleSelectLocation = (next: { lat: number; lng: number; name: string }) => {
    setLocation(next);
    mapRef.current?.flyTo(next.lng, next.lat);
  };

  const handleMapLocationChange = useCallback((next: { lat: number; lng: number }) => {
    setLocation((prev) => ({ ...prev, lat: next.lat, lng: next.lng }));
  }, []);

  const inspector = (
    <SidebarContent
      locationName={location.name}
      lat={location.lat}
      lng={location.lng}
      date={selectedDate}
      time={selectedTime}
      month={selectedMonth}
      tab={sidebarTab}
      onTabChange={setSidebarTab}
      onSelectLocation={handleSelectLocation}
      onDateChange={handleDateChange}
      onMonthChange={setSelectedMonth}
      climateData={climateData}
      windRoseData={windRoseData}
      weatherLoading={weatherLoading}
      tideData={tideData}
      tideLoading={tideData.isLoading}
      hideSearch={!isMobile}
      wind={mapWind}
      windEmphasized={windEmphasized}
      onToggleWindEmphasis={() => setWindEmphasized((value) => !value)}
    />
  );

  const timeBar = (
    <TimeBar
      mapRef={mapRef}
      value={selectedTime}
      onChange={setSelectedTime}
      sunrise={sunTimes.sunrise}
      sunset={sunTimes.sunset}
      period={sky.period}
    />
  );

  const mapLocale = useMemo(
    () => ({
      'NavigationControl.ZoomIn': tMap('zoomIn'),
      'NavigationControl.ZoomOut': tMap('zoomOut'),
      'NavigationControl.ResetBearing': tMap('resetBearing'),
      'GeolocateControl.FindMyLocation': tMap('findMyLocation'),
      'GeolocateControl.LocationNotAvailable': tMap('locationNotAvailable'),
    }),
    [tMap],
  );

  return (
    <main
      className="relative h-dvh overflow-hidden bg-map-void"
      data-inspector={isMobile ? 'hidden' : isSidebarOpen ? 'expanded' : 'collapsed'}
      data-sheet={isSheetOpen ? 'expanded' : 'collapsed'}
      style={{ ['--hud-left' as string]: isMobile ? '0px' : isSidebarOpen ? '352px' : '60px' }}
    >
      <ShadowMap
        ref={mapRef}
        date={selectedDate}
        time={selectedTime}
        onMapReady={() => setIsMapReady(true)}
        onLocationChange={handleMapLocationChange}
        enterLabel={tHeader('fullscreen')}
        exitLabel={tHeader('exitFullscreen')}
        mapLocale={mapLocale}
      />

      <WindFlowOverlay
        visible={sidebarTab === 'wind'}
        wind={mapWind}
        month={selectedMonth}
        emphasized={windEmphasized}
        project={(lng, lat) => mapRef.current?.project(lng, lat) ?? null}
        getBounds={() => mapRef.current?.getBounds() ?? null}
        getZoom={() => mapRef.current?.getZoom() ?? 0}
        subscribeView={(cb) => mapRef.current?.subscribeView(cb) ?? (() => {})}
      />

      <div className="hud pointer-events-none absolute inset-0 z-[var(--z-hud)]">
        <Header locationName={location.name} onSelectLocation={handleSelectLocation} />

        {!isMobile && (
          <Sidebar
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((open) => !open)}
            tab={sidebarTab}
            onTabChange={setSidebarTab}
          >
            {inspector}
          </Sidebar>
        )}

        {!isMobile && <Dock>{timeBar}</Dock>}

        {isMobile && (
          <BottomSheet
            isOpen={isSheetOpen}
            onToggle={() => setIsSheetOpen((open) => !open)}
            peekLabel={`${sidebarTab === 'sun' ? tSide('sunTab') : sidebarTab === 'wind' ? tSide('windTab') : tSide('tideTab')} · ${location.name}`}
            peekIcon={
              sidebarTab === 'sun' ? (
                <SunMark size={18} className="text-sun-text" />
              ) : sidebarTab === 'wind' ? (
                <WindMark size={18} className="text-wind" />
              ) : (
                <TideMark size={18} className="text-tide" />
              )
            }
            peekMeta={formatTime(selectedTime)}
            footer={
              <TimeBar
                mapRef={mapRef}
                value={selectedTime}
                onChange={setSelectedTime}
                sunrise={sunTimes.sunrise}
                sunset={sunTimes.sunset}
                period={sky.period}
                hideReadout
              />
            }
          >
            {inspector}
          </BottomSheet>
        )}
      </div>

      <LoadingOverlay isLoading={!isMapReady} />
    </main>
  );
}
