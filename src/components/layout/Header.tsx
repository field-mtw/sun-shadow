'use client';

import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Header() {
  const t = useTranslations('header');
  const router = useRouter();
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const toggleLanguage = () => {
    const nextLocale = pathname.startsWith('/en') ? 'th' : 'en';
    const nextPath = pathname.replace(/^\/[a-z]{2}/, `/${nextLocale}`);
    router.push(nextPath);
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 w-full items-center justify-between glass-panel px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="text-2xl">☀️</span>
        <h1 className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
          SunShadow
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          aria-label={t('toggleTheme')}
        >
          {isDark ? '🌙' : '☀️'}
        </button>
        <button 
          onClick={toggleLanguage}
          className="px-3 py-1 rounded-md bg-slate-200 dark:bg-slate-700 font-medium"
        >
          {pathname.startsWith('/en') ? 'TH' : 'EN'}
        </button>
      </div>
    </header>
  );
}
