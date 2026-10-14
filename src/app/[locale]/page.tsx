'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import Header, { type WorkspaceViewMode } from '@/components/layout/Header';
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
import TargetFrameOverlay from '@/components/studio/TargetFrameOverlay';
import { useWeatherData } from '@/hooks/useWeatherData';
import { useTideData } from '@/hooks/useTideData';
import { deriveMapWind } from '@/lib/wind-vector';
import WindFlowOverlay from '@/components/map/WindFlowOverlay';
import type { ShadowMapRef } from '@/components/map/ShadowMap';
import type { SidebarTab } from '@/components/layout/SidebarContent';
import {
  recomputeSliceMassing,
  type ClayAreaSlice,
  type StudioBoxSize,
} from '@/lib/clay-extractor';
import type { StudioCameraOrientation } from '@/components/studio/WhiteClayCanvas';
import { cn } from '@/lib/cn';

const ShadowMap = dynamic(() => import('@/components/map/ShadowMap'), { ssr: false });
const WhiteClayStudio = dynamic(() => import('@/components/studio/WhiteClayStudio'), {
  ssr: false,
});

const reverseGeocodeCache = new Map<string, string>();

interface MapTilerFeature {
  text?: string;
  place_name?: string;
  place_type?: string[];
}

async function reverseGeocodeLocation(
  lat: number,
  lng: number,
  locale: string,
): Promise<string | null> {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${locale}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://api.maptiler.com/geocoding/${lng.toFixed(5)},${lat.toFixed(5)}.json?key=${key}&language=${locale}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { features?: MapTilerFeature[] };
        const features = data.features ?? [];
        if (features.length > 0) {
          const district = features.find((f) =>
            f.place_type?.some((t) =>
              ['municipality', 'subregion', 'joint_municipality', 'locality', 'place'].includes(t),
            ),
          );
          const region = features.find((f) =>
            f.place_type?.some((t) => ['region', 'county'].includes(t)),
          );
          let label = '';
          if (district?.text && region?.text && district.text !== region.text) {
            label = `${district.text}, ${region.text}`;
          } else {
            label =
              district?.text ||
              region?.text ||
              features[0]?.text ||
              features[0]?.place_name ||
              '';
          }
          if (label) {
            reverseGeocodeCache.set(cacheKey, label);
            return label;
          }
        }
      }
    } catch {
      // Fallback to Nominatim below
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&accept-language=${locale}`,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        address?: Record<string, string | undefined>;
        name?: string;
      };
      const addr = data.address ?? {};
      const district =
        addr.city_district ||
        addr.suburb ||
        addr.district ||
        addr.County ||
        addr.town ||
        addr.city ||
        addr.municipality;
      const province = addr.state || addr.province || addr.region || addr.city;
      const label =
        district && province && district !== province
          ? `${district}, ${province}`
          : province || district || data.name || null;
      if (label) {
        reverseGeocodeCache.set(cacheKey, label);
        return label;
      }
    }
  } catch {
    // Ignore network errors
  }

  return null;
}

function daytimeOrNoon(date: Date, lat: number, lng: number): Date {
  const times = getSunTimes(date, lat, lng);
  if (date >= times.sunrise && date <= times.sunset) return date;
  return times.solarNoon;
}

export default function Home() {
  const mapRef = useRef<ShadowMapRef>(null);
  const locale = useLocale();
  const tHeader = useTranslations('header');
  const tSide = useTranslations('sidebar');
  const tLocations = useTranslations('locations');
  const tMap = useTranslations('map');

  const [location, setLocation] = useState({
    lat: DEFAULT_CENTER[1],
    lng: DEFAULT_CENTER[0],
    name: tLocations('bangkok'),
  });
  const manualSelectRef = useRef<{ lat: number; lng: number; locale: string } | null>(null);
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

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // 3D Studio & Split-Screen State
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('2d');
  const [boxSize, setBoxSize] = useState<StudioBoxSize>(350);
  const [isAreaLocked, setIsAreaLocked] = useState(false);
  const [claySlice, setClaySlice] = useState<ClayAreaSlice | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [lockedCenter, setLockedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [studioCamera, setStudioCamera] = useState<StudioCameraOrientation>({
    azimuthDeg: 317,
    pitchDeg: 32,
  });

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
    sidebarTab === 'wind' || viewMode !== '2d',
  );
  const tideData = useTideData(
    location.lat,
    location.lng,
    selectedDate,
    selectedTime,
    sidebarTab === 'tide',
  );
  const mapWind = useMemo(
    () =>
      deriveMapWind(
        climateData?.find((row) => row.month === selectedMonth + 1),
        windRoseData,
      ),
    [climateData, windRoseData, selectedMonth],
  );

  // Smooth 60 FPS Solar Time Playback Loop
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.05, (now - last) / 1000);
      last = now;
      // 1x = 45 simulated minutes per real second
      const deltaMinutes = dtSec * 45 * playbackSpeed;

      setSelectedTime((prev) => {
        const curMins = prev.getHours() * 60 + prev.getMinutes() + prev.getSeconds() / 60;
        let nextMins = curMins + deltaMinutes;
        if (nextMins >= 24 * 60) nextMins -= 24 * 60;
        const next = new Date(prev);
        const h = Math.floor(nextMins / 60);
        const m = Math.floor(nextMins % 60);
        const s = Math.floor((nextMins * 60) % 60);
        next.setHours(h, m, s, 0);
        return next;
      });

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, playbackSpeed]);

  // Handle switching between 2D, Split 2D+3D, and Full 3D Studio
  const handleViewModeChange = useCallback(
    (nextMode: WorkspaceViewMode) => {
      setViewMode(nextMode);
      if (nextMode !== '2d') {
        mapRef.current?.ensureBuildingZoom();
        // Auto-collapse sidebar in Split & Full 3D mode so Studio HUD has full room
        setIsSidebarOpen(false);
      }
      setTimeout(() => mapRef.current?.resize(), 60);
      setTimeout(() => mapRef.current?.resize(), 340);
    },
    [],
  );

  const massingRafRef = useRef<number>(0);
  const handleMassingChange = useCallback(() => {
    if (massingRafRef.current) cancelAnimationFrame(massingRafRef.current);
    massingRafRef.current = requestAnimationFrame(() => {
      massingRafRef.current = 0;
      setClaySlice((prev) =>
        prev ? recomputeSliceMassing(prev, selectedDate, mapWind) : null,
      );
      mapRef.current?.refreshCustomMassing();
    });
  }, [selectedDate, mapWind]);

  // Extract 3D White Clay Slice when in Split or 3D mode
  const activeSyncLat = isAreaLocked && lockedCenter ? lockedCenter.lat : location.lat;
  const activeSyncLng = isAreaLocked && lockedCenter ? lockedCenter.lng : location.lng;

  useEffect(() => {
    if (viewMode === '2d' || !isMapReady) return;

    let cancelled = false;
    let timer2: ReturnType<typeof setTimeout> | undefined;
    setIsExtracting(true);

    const runExtract = async (isRetry = false) => {
      const slice = await mapRef.current?.extractAreaSlice(boxSize, selectedDate, mapWind);
      if (cancelled) return;
      if (slice) {
        setClaySlice(slice);
        setIsExtracting(false);
        // Only schedule a retry pass if 0 buildings were found on first pass while tiles stream in
        if (!isRetry && slice.buildings.length === 0) {
          timer2 = setTimeout(() => void runExtract(true), 750);
        }
      } else {
        setIsExtracting(false);
      }
    };

    const timer1 = setTimeout(() => void runExtract(false), 160);

    return () => {
      cancelled = true;
      clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, [
    viewMode,
    isMapReady,
    boxSize,
    activeSyncLat,
    activeSyncLng,
    selectedDate,
    mapWind,
  ]);

  const handleToggleLock = useCallback(() => {
    setIsAreaLocked((prev) => {
      const next = !prev;
      if (next) {
        setLockedCenter({ lat: location.lat, lng: location.lng });
      } else {
        setLockedCenter(null);
      }
      return next;
    });
  }, [location.lat, location.lng]);

  const handleDateChange = (nextDate: Date) => {
    setSelectedDate(nextDate);
    setSelectedTime(combineDateAndTime(nextDate, selectedTime));
    setSelectedMonth(nextDate.getMonth());
  };

  const handleSelectLocation = (next: { lat: number; lng: number; name: string }) => {
    manualSelectRef.current = { lat: next.lat, lng: next.lng, locale };
    setLocation(next);
    setIsAreaLocked(false);
    setLockedCenter(null);
    mapRef.current?.flyTo(next.lng, next.lat, viewMode !== '2d' ? 15.8 : undefined);
  };

  const handleMapLocationChange = useCallback((next: { lat: number; lng: number }) => {
    setLocation((prev) => ({ ...prev, lat: next.lat, lng: next.lng }));
  }, []);

  // Automatically reverse-geocode the current map center when the user pans to a new district/province or switches language
  useEffect(() => {
    const manual = manualSelectRef.current;
    if (
      manual &&
      manual.locale === locale &&
      Math.hypot(location.lat - manual.lat, location.lng - manual.lng) < 0.012
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const resolvedName = await reverseGeocodeLocation(location.lat, location.lng, locale);
      if (!cancelled && resolvedName) {
        setLocation((prev) =>
          prev.name === resolvedName ? prev : { ...prev, name: resolvedName },
        );
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [location.lat, location.lng, locale]);

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
      date={selectedDate}
      onDateChange={handleDateChange}
      sunrise={sunTimes.sunrise}
      sunset={sunTimes.sunset}
      lat={location.lat}
      lng={location.lng}
      period={sky.period}
      isPlaying={isPlaying}
      onTogglePlay={() => setIsPlaying((p) => !p)}
      playbackSpeed={playbackSpeed}
      onSpeedChange={setPlaybackSpeed}
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
      data-sky-period={sky.period}
      data-view-mode={viewMode}
      data-inspector={isMobile ? 'hidden' : isSidebarOpen ? 'expanded' : 'collapsed'}
      data-sheet={isSheetOpen ? 'expanded' : 'collapsed'}
      style={{
        ['--hud-left' as string]:
          isMobile || viewMode !== '2d' ? '0px' : isSidebarOpen ? '352px' : '60px',
      }}
    >
      {/* Dual-Sync Stage: 2D MapLibre (Left/Top) <-> 3D White Clay Studio (Right/Bottom) */}
      <div className="relative flex h-full w-full flex-col md:flex-row">
        {/* Left / Top Pane: 2D MapLibre Viewport */}
        <div
          className={cn(
            'transition-all duration-300 ease-out',
            viewMode === '2d' && 'relative h-full w-full',
            viewMode === 'split' && 'relative h-[46%] w-full shrink-0 md:h-full md:w-1/2',
            viewMode === '3d' && 'pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-0',
          )}
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
            visible={sidebarTab === 'wind' && viewMode !== '3d'}
            wind={mapWind}
            month={selectedMonth}
            emphasized={windEmphasized}
            project={(lng, lat) => mapRef.current?.project(lng, lat) ?? null}
            getBounds={() => mapRef.current?.getBounds() ?? null}
            getZoom={() => mapRef.current?.getZoom() ?? 0}
            subscribeView={(cb) => mapRef.current?.subscribeView(cb) ?? (() => {})}
          />

          <TargetFrameOverlay
            visible={viewMode === 'split'}
            lat={location.lat}
            sizeMeters={boxSize}
            onSizeChange={setBoxSize}
            locked={isAreaLocked}
            onToggleLock={handleToggleLock}
            getZoom={() => mapRef.current?.getZoom() ?? 15.6}
            getBearing={() => mapRef.current?.getBearing() ?? 0}
            subscribeView={(cb) => mapRef.current?.subscribeView(cb) ?? (() => {})}
            buildingCount={claySlice?.buildings.length ?? 0}
            onOpenFull3D={() => handleViewModeChange('3d')}
            cameraOrientation={studioCamera}
          />
        </div>

        {/* Right / Bottom Pane: 3D White Clay Architectural Studio */}
        {viewMode !== '2d' && (
          <div
            className={cn(
              'relative z-[var(--z-map)] transition-all duration-300 ease-out',
              viewMode === 'split'
                ? 'h-[54%] w-full shrink-0 border-t border-[var(--glass-border)] md:h-full md:w-1/2 md:border-t-0 md:border-l'
                : 'h-full w-full flex-1',
            )}
          >
            <WhiteClayStudio
              slice={claySlice}
              isExtracting={isExtracting}
              date={selectedDate}
              time={selectedTime}
              wind={mapWind}
              sizeMeters={boxSize}
              onSizeChange={setBoxSize}
              isFull3D={viewMode === '3d'}
              onToggleFull3D={() =>
                handleViewModeChange(viewMode === '3d' ? 'split' : '3d')
              }
              onMassingChange={handleMassingChange}
              onCameraOrientationChange={setStudioCamera}
            />
          </div>
        )}
      </div>

      {/* Spatial Glass HUD Layer */}
      <div className="hud pointer-events-none absolute inset-0 z-[var(--z-hud)]">
        <Header
          locationName={location.name}
          lat={location.lat}
          lng={location.lng}
          altitudeDeg={sky.sun.altitudeDeg}
          azimuthDeg={sky.sun.compassAzimuthDeg}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onSelectLocation={handleSelectLocation}
        />

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
                lat={location.lat}
                lng={location.lng}
                period={sky.period}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                playbackSpeed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
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
