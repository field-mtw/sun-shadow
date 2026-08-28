'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LoaderCircle, MapPin, Search } from 'lucide-react';
import { PRESET_LOCATIONS } from '@/lib/constants';
import GlassPanel from '@/components/ui/GlassPanel';
import Chip from '@/components/ui/Chip';
import { cn } from '@/lib/cn';

interface LocationSearchProps {
  onSelect: (location: { lat: number; lng: number; name: string }) => void;
  variant?: 'topbar' | 'panel';
  showPresets?: boolean;
  hideField?: boolean;
}

export default function LocationSearch({
  onSelect,
  variant = 'panel',
  showPresets = true,
  hideField = false,
}: LocationSearchProps) {
  const t = useTranslations('search');
  const tLoc = useTranslations('locations');
  const locale = useLocale();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = query.length < 3 ? [] : results;

  useEffect(() => {
    if (query.length < 3) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (!cancelled) setLoading(true);
      const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      try {
        const res = await fetch(
          `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&language=${locale}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.features) {
          setResults(
            data.features.map((feature: { place_name?: string; center: [number, number] }) => ({
              name: feature.place_name ?? query,
              lng: feature.center[0],
              lat: feature.center[1],
            })),
          );
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, locale]);

  const field = (
    <div className={cn('relative', variant === 'topbar' ? 'flex h-full min-w-0 flex-1 items-center' : '')}>
      <Search
        size={variant === 'topbar' ? 18 : 16}
        strokeWidth={1.75}
        className={cn(
          'pointer-events-none shrink-0 text-fg-muted',
          variant === 'topbar' ? 'mr-2.5' : 'absolute top-1/2 left-3 -translate-y-1/2',
        )}
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className={cn(
          'min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-muted/80 focus-visible:outline-none',
          variant === 'topbar'
            ? 'h-full border-0 pr-8'
            : 'h-10 w-full rounded-[var(--radius-chip)] border border-[var(--glass-border)] bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] pr-9 pl-10',
        )}
      />
      {loading && query.length >= 3 && (
        <LoaderCircle
          size={16}
          strokeWidth={1.75}
          className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-fg-muted"
        />
      )}

      {query.length >= 3 && !loading && shown.length === 0 && (
        <GlassPanel
          elevation={2}
          className="absolute z-[var(--z-dropdown)] mt-2 w-full p-3 text-sm text-fg-muted"
        >
          {t('noResults')}
        </GlassPanel>
      )}

      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="glass-panel glass-panel-strong absolute z-[var(--z-dropdown)] mt-2 max-h-60 w-full overflow-auto py-1"
        >
          {shown.map((result) => (
            <li
              key={`${result.lat},${result.lng},${result.name}`}
              role="option"
              aria-selected={false}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--glass-hover)]"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(result);
                setQuery('');
                setResults([]);
                setOpen(false);
              }}
            >
              <MapPin size={12} strokeWidth={2} className="shrink-0 text-fg-faint" />
              <span className="truncate">{result.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (variant === 'topbar') {
    return (
      <GlassPanel
        elevation={1}
        data-open={open && query.length >= 3 ? 'true' : undefined}
        className="topbar-search pointer-events-auto absolute top-[calc(var(--hud-inset)+env(safe-area-inset-top,0px))] left-1/2 z-[var(--z-hud)] hidden h-12 w-[min(420px,calc(100vw-420px))] max-w-[420px] -translate-x-1/2 items-center px-4 md:flex focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"
      >
        <div className="min-w-0 flex-1 overflow-hidden">{field}</div>
      </GlassPanel>
    );
  }

  return (
    <div className="relative mb-4">
      {!hideField && field}
      {showPresets && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-fg-muted">{t('quickLocations')}</div>
          <div className="flex flex-wrap gap-1">
            {PRESET_LOCATIONS.map((place) => {
              const label = tLoc(place.id);
              return (
                <Chip
                  key={place.id}
                  onClick={() => onSelect({ lat: place.lat, lng: place.lng, name: label })}
                >
                  {label}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
