'use client';

import type { ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import GlassPanel from '@/components/ui/GlassPanel';
import IconButton from '@/components/ui/IconButton';
import SunMark from '@/components/icons/SunMark';
import WindMark from '@/components/icons/WindMark';
import TideMark from '@/components/icons/TideMark';
import type { SidebarTab } from '@/components/layout/SidebarContent';
import { cn } from '@/lib/cn';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  children: ReactNode;
}

export default function Sidebar({ isOpen, onToggle, tab, onTabChange, children }: SidebarProps) {
  const t = useTranslations('header');
  const tSide = useTranslations('sidebar');

  const selectTab = (next: SidebarTab) => {
    onTabChange(next);
    if (!isOpen) onToggle();
  };

  return (
    <GlassPanel
      as="aside"
      elevation={2}
      className={cn(
        'pointer-events-auto absolute top-[var(--map-ctrl-top)] left-[var(--hud-inset)] z-[var(--z-hud)] hidden max-h-[calc(100dvh-var(--map-ctrl-top)-var(--dock-height)-28px)] flex-col overflow-hidden md:flex',
        'transition-[width,padding] duration-[var(--dur-2)] ease-[var(--ease-out)]',
        isOpen
          ? 'w-[var(--inspector-width)] p-[var(--inspector-padding)]'
          : 'w-[var(--inspector-rail)] p-[var(--inspector-rail-padding)]',
      )}
    >
      {isOpen ? (
        <>
          <div className="mb-2 flex justify-end">
            <IconButton
              label={t('collapsePanel')}
              icon={PanelLeftClose}
              onClick={onToggle}
              aria-expanded={isOpen}
            />
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto transition-opacity duration-[var(--dur-fade)]">
            {children}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <IconButton
            label={t('expandPanel')}
            icon={PanelLeftOpen}
            onClick={onToggle}
            aria-expanded={isOpen}
          />
          <button
            type="button"
            onClick={() => selectTab('sun')}
            aria-label={tSide('sunTab')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-[var(--radius-chip)] text-sun-text hover:bg-[var(--accent-sun-soft)]',
              tab === 'sun' && 'bg-[var(--accent-sun-soft)]',
            )}
          >
            <SunMark size={18} />
          </button>
          <button
            type="button"
            onClick={() => selectTab('wind')}
            aria-label={tSide('windTab')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-[var(--radius-chip)] text-wind hover:bg-[var(--accent-wind-soft)]',
              tab === 'wind' && 'bg-[var(--accent-wind-soft)]',
            )}
          >
            <WindMark size={18} />
          </button>
          <button
            type="button"
            onClick={() => selectTab('tide')}
            aria-label={tSide('tideTab')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-[var(--radius-chip)] text-tide hover:bg-[var(--accent-tide-soft)]',
              tab === 'tide' && 'bg-[var(--accent-tide-soft)]',
            )}
          >
            <TideMark size={18} />
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
