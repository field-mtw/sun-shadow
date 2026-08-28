'use client';

import { useTranslations } from 'next-intl';

export default function ExportButton({ mapRef }: { mapRef: any }) {
  const t = useTranslations('export');
  
  const handleScreenshot = () => {
    // Implement screenshot logic later
    alert('Screenshot feature coming soon!');
  };

  return (
    <button 
      onClick={handleScreenshot}
      className="p-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors shadow-md text-sm font-medium dark:bg-slate-200 dark:text-black dark:hover:bg-slate-300"
    >
      📸 {t('screenshot') || 'Screenshot'}
    </button>
  );
}
