'use client';

import { useTranslations } from 'next-intl';

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const t = useTranslations('date');
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    if (!isNaN(newDate.getTime())) {
      onChange(newDate);
    }
  };

  const setPreset = (preset: 'today' | 'summer' | 'winter') => {
    const d = new Date();
    if (preset === 'summer') {
      d.setMonth(5); // June
      d.setDate(21);
    } else if (preset === 'winter') {
      d.setMonth(11); // Dec
      d.setDate(21);
    }
    onChange(d);
  };

  return (
    <div className="flex flex-col gap-2 p-2 glass-panel rounded-lg mb-4">
      <label className="text-sm font-medium">{t('selectDate') || 'Select Date'}</label>
      <input 
        type="date" 
        value={value.toISOString().split('T')[0]}
        onChange={handleDateChange}
        className="p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700"
      />
      <div className="flex gap-2 mt-2">
        <button onClick={() => setPreset('today')} className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">Today</button>
        <button onClick={() => setPreset('summer')} className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">Summer Solstice</button>
        <button onClick={() => setPreset('winter')} className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded">Winter Solstice</button>
      </div>
    </div>
  );
}
