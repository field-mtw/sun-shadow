import { THEME_COOKIE } from '@/components/theme/theme-boot';

export type Theme = 'light' | 'dark';
export { THEME_COOKIE };

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function readTheme(): Theme | null {
  const match = document.cookie.match(/(?:^|; )sunshadow-theme=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : '';
  if (value === 'light' || value === 'dark') return value;
  return null;
}
