'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface LocationSearchProps {
  onSelect: (location: { lat: number, lng: number, name: string }) => void;
}

export default function LocationSearch({ onSelect }: LocationSearchProps) {
  const t = useTranslations('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    
    const timeout = setTimeout(async () => {
      const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      try {
        const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${KEY}&language=auto`);
        const data = await res.json();
        if (data.features) {
          setResults(data.features);
        }
      } catch (e) {
        console.error(e);
      }
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="relative mb-4">
      <input 
        type="text" 
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('placeholder') || 'Search location...'}
        className="w-full p-2 pl-8 border rounded-md dark:bg-slate-800 dark:border-slate-700"
      />
      <span className="absolute left-2 top-2">🔍</span>
      
      {results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((r, i) => (
            <li 
              key={i}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm"
              onClick={() => {
                onSelect({ lat: r.center[1], lng: r.center[0], name: r.place_name });
                setQuery('');
                setResults([]);
              }}
            >
              {r.place_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
