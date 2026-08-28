'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Moon, Sun } from 'lucide-react';
import LogoMark from '@/components/icons/LogoMark';
import GlassPanel from '@/components/ui/GlassPanel';
import IconButton from '@/components/ui/IconButton';
import LocationSearch from '@/components/search/LocationSearch';
import { applyTheme, readTheme, type Theme } from '@/components/theme/theme';

export default function Header({
  locationName,
  onSelectLocation,
}: {
  locationName: string;
  onSelectLocation: (location: { lat: number; lng: number; name: string }) => void;
}) {
  const t = useTranslations('header');
  const tApp = useTranslations('app');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
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
    applyTheme(next);
    setTheme(next);
  };

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'th' : 'en';
    router.replace(pathname, { locale: nextLocale });
  };

  const targetLocale = locale === 'en' ? 'TH' : 'EN';

  const themeButton = (
    <IconButton
      label={t('toggleTheme')}
      icon={theme === 'dark' ? Sun : Moon}
      onClick={toggleTheme}
    />
  );
  const langButton = (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={t('language')}
      className="flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-chip)] px-2 text-[11px] font-bold text-fg hover:bg-[var(--glass-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      {targetLocale}
    </button>
  );

  return (
    <>
      <GlassPanel
        elevation={1}
        className="pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] left-[var(--hud-inset)] right-[calc(var(--hud-inset)+var(--map-tool-col)+8px)] z-[var(--z-hud)] flex h-11 items-center gap-2 px-2.5 md:hidden"
      >
        <LogoMark className="shrink-0 text-sun-text" size={22} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-fg">
          {locationName}
        </span>
        {themeButton}
        {langButton}
      </GlassPanel>

      <GlassPanel
        elevation={1}
        className="pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] left-[var(--hud-inset)] z-[var(--z-hud)] hidden h-11 items-center gap-2 px-3 md:flex"
      >
        <LogoMark className="text-sun-text" size={22} />
        <h1 className="hidden text-[15px] font-semibold tracking-tight text-fg min-[640px]:block">
          {tApp('title')}
        </h1>
      </GlassPanel>

      <LocationSearch variant="topbar" onSelect={onSelectLocation} />

      <GlassPanel
        elevation={1}
        className="pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] right-[calc(var(--hud-inset)+52px)] z-[var(--z-hud)] hidden h-11 items-center gap-0.5 px-1.5 md:flex"
      >
        {themeButton}
        {langButton}
      </GlassPanel>
    </>
  );
}
