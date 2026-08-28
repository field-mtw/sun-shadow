'use client';

import { useState } from 'react';
import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, LoaderCircle } from 'lucide-react';
import { captureMapScreenshot } from '@/lib/export-manager';
import type { ShadowMapRef } from '@/components/map/ShadowMap';
import IconButton from '@/components/ui/IconButton';

export default function ExportButton({ mapRef }: { mapRef: RefObject<ShadowMapRef | null> }) {
  const t = useTranslations('export');
  const [loading, setLoading] = useState(false);

  const handleScreenshot = () => {
    const next = mapRef.current?.getCanvas();
    if (!next) return;
    setLoading(true);
    try {
      captureMapScreenshot(next);
    } finally {
      window.setTimeout(() => setLoading(false), 200);
    }
  };

  return (
    <IconButton
      label={t('screenshot')}
      icon={loading ? LoaderCircle : Camera}
      loading={loading}
      onClick={handleScreenshot}
      className="shrink-0"
    />
  );
}
