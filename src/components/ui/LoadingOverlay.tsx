'use client';

import { useTranslations } from 'next-intl';
import SunMark from '@/components/icons/SunMark';

export default function LoadingOverlay({ isLoading }: { isLoading: boolean }) {
  const t = useTranslations('loading');
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 z-[var(--z-loading)] flex flex-col items-center justify-center bg-[rgba(8,18,36,0.35)] backdrop-blur-[6px] dark:bg-[rgba(8,18,36,0.5)]">
      <SunMark size={36} className="sun-slow-spin mb-4 text-sun-text" />
      <p className="text-sm font-medium text-fg-inverse drop-shadow-md">{t('map')}</p>
    </div>
  );
}
