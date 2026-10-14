'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Box, Columns2, Map as MapIcon, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import LogoMark from '@/components/icons/LogoMark';
import GlassPanel from '@/components/ui/GlassPanel';
import IconButton from '@/components/ui/IconButton';
import LocationSearch from '@/components/search/LocationSearch';
import { applyTheme, readTheme, type Theme } from '@/components/theme/theme';
import { soundFX } from '@/lib/sound-fx';
import { cn } from '@/lib/cn';

export type WorkspaceViewMode = '2d' | 'split' | '3d';

interface HeaderProps {
  locationName: string;
  lat: number;
  lng: number;
  altitudeDeg: number;
  azimuthDeg: number;
  viewMode: WorkspaceViewMode;
  onViewModeChange: (mode: WorkspaceViewMode) => void;
  onSelectLocation: (location: { lat: number; lng: number; name: string }) => void;
}

export default function Header({
  locationName,
  lat,
  lng,
  altitudeDeg,
  azimuthDeg,
  viewMode,
  onViewModeChange,
  onSelectLocation,
}: HeaderProps) {
  const t = useTranslations('header');
  const tApp = useTranslations('app');
  const tStudio = useTranslations('studio');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('light');
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSoundEnabled(soundFX.isEnabled());
      const stored = readTheme();
      if (stored) {
        applyTheme(stored);
        setTheme(stored);
        return;
      }
      const next = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    soundFX.playSwitch(next === 'dark');
    applyTheme(next);
    setTheme(next);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    soundFX.setEnabled(next);
    setSoundEnabled(next);
  };

  const toggleLanguage = () => {
    soundFX.playSwitch(true);
    const nextLocale = locale === 'en' ? 'th' : 'en';
    router.replace(pathname, { locale: nextLocale });
  };

  const handleMode = (mode: WorkspaceViewMode) => {
    soundFX.playSwitch(mode !== '2d');
    onViewModeChange(mode);
  };

  const targetLocale = locale === 'en' ? 'TH' : 'EN';

  const modeSwitcher = (
    <div
      role="group"
      aria-label={tStudio('viewMode')}
      className="flex items-center gap-0.5 rounded-full border border-[var(--glass-border)] bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] p-0.5"
    >
      <button
        type="button"
        onClick={() => handleMode('2d')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
          viewMode === '2d'
            ? 'bg-sun text-fg-inverse shadow-xs'
            : 'text-fg-muted hover:text-fg',
        )}
      >
        <MapIcon size={12} strokeWidth={2.1} />
        <span className="hidden sm:inline">{tStudio('mode2D')}</span>
      </button>

      <button
        type="button"
        onClick={() => handleMode('split')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
          viewMode === 'split'
            ? 'bg-sun text-fg-inverse shadow-xs'
            : 'text-fg-muted hover:text-fg',
        )}
      >
        <Columns2 size={12} strokeWidth={2.1} />
        <span>{tStudio('modeSplit')}</span>
      </button>

      <button
        type="button"
        onClick={() => handleMode('3d')}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
          viewMode === '3d'
            ? 'bg-sun text-fg-inverse shadow-xs'
            : 'text-fg-muted hover:text-fg',
        )}
      >
        <Box size={12} strokeWidth={2.1} />
        <span className="hidden sm:inline">{tStudio('mode3D')}</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Unified Top Bar */}
      <GlassPanel
        elevation={1}
        className="pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] left-[var(--hud-inset)] right-[calc(var(--hud-inset)+var(--map-tool-col)+6px)] z-[var(--z-hud)] flex h-11 items-center justify-between gap-1.5 px-2.5 md:hidden"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <LogoMark className="shrink-0 text-sun-text" size={20} />
          <span className="truncate text-[13px] font-semibold tracking-tight text-fg">
            {locationName}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {modeSwitcher}
          <IconButton
            label={t('toggleTheme')}
            icon={theme === 'dark' ? Sun : Moon}
            onClick={toggleTheme}
          />
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t('language')}
            className="flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-fg hover:bg-[var(--glass-hover)]"
          >
            {targetLocale}
          </button>
        </div>
      </GlassPanel>

      {/* Desktop Unified Spatial Command Bar */}
      <GlassPanel
        elevation={2}
        className="pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] left-[var(--hud-inset)] right-[calc(var(--hud-inset)+48px)] z-[var(--z-hud)] hidden h-12 items-center justify-between gap-3 rounded-full px-4 md:flex"
      >
        {/* Left: Brand + Live Telemetry Pill */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <LogoMark className="shrink-0 text-sun-text" size={22} />
            <h1 className="text-[15px] font-bold tracking-tight text-fg whitespace-nowrap">
              {tApp('title')}
            </h1>
          </div>

          <div className="hidden h-4 w-px bg-[var(--glass-border)] md:block" />

          {/* Precision Telemetry Readout */}
          <div
            className="hidden items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-fg-muted md:flex"
            title={`${locationName} (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`}
          >
            <span className="max-w-[160px] truncate font-semibold text-fg lg:max-w-[220px]">
              {locationName}
            </span>
            <span className="hidden text-fg-faint xl:inline">·</span>
            <span className="hidden xl:inline">
              {lat.toFixed(3)}°N, {lng.toFixed(3)}°E
            </span>
            <span className="hidden text-fg-faint 2xl:inline">·</span>
            <span className="hidden font-semibold text-sun-text 2xl:inline">
              ALT {altitudeDeg.toFixed(1)}° · AZM {Math.round(azimuthDeg)}°
            </span>
          </div>
        </div>

        {/* Center: Inline Search + View Mode Switcher */}
        <div className="flex items-center gap-2.5">
          <LocationSearch variant="inline" onSelect={onSelectLocation} showPresets={false} />
          {modeSwitcher}
        </div>

        {/* Right: Sound FX + Theme + Locale */}
        <div className="flex items-center gap-0.5">
          <IconButton
            label={soundEnabled ? tStudio('muteSound') : tStudio('unmuteSound')}
            icon={soundEnabled ? Volume2 : VolumeX}
            onClick={toggleSound}
          />
          <IconButton
            label={t('toggleTheme')}
            icon={theme === 'dark' ? Sun : Moon}
            onClick={toggleTheme}
          />
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t('language')}
            className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[11px] font-bold text-fg hover:bg-[var(--glass-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {targetLocale}
          </button>
        </div>
      </GlassPanel>
    </>
  );
}
