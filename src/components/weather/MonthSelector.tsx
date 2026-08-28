'use client';

import { useTranslations } from 'next-intl';

interface MonthSelectorProps {
  value: number;
  onChange: (month: number) => void;
  climateData?: any;
}

export default function MonthSelector({ value, onChange, climateData }: MonthSelectorProps) {
  const t = useTranslations('months');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return (
    <div className="grid grid-cols-4 gap-1 p-2 glass-panel rounded-lg">
      {months.map((m, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`p-1 text-xs rounded transition-colors ${value === i ? 'bg-amber-500 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
