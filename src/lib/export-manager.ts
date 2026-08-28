import type { AppState, BookmarkLocation } from '../types';

const BOOKMARK_STORAGE_KEY = 'sunshadow_bookmarks';

/**
 * Captures a screenshot of the provided MapLibre GL canvas and triggers a download.
 */
export function captureMapScreenshot(mapCanvas: HTMLCanvasElement, filename?: string): void {
  try {
    const dataUrl = mapCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    
    if (!filename) {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      filename = `sunshadow-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.png`;
    }
    
    link.download = filename;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Failed to capture map screenshot:', error);
  }
}

/**
 * Generates a shareable URL containing the current app state encoded in search params.
 */
export function generateShareUrl(state: { lat: number; lng: number; zoom: number; date: string; time: string }): string {
  if (typeof window === 'undefined') return '';
  
  const params = new URLSearchParams({
    lat: state.lat.toString(),
    lng: state.lng.toString(),
    zoom: state.zoom.toString(),
    date: state.date,
    time: state.time
  });
  
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * Parses a share URL and returns a partial AppState object.
 */
export function parseShareUrl(url: string): Partial<AppState> | null {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    const latStr = params.get('lat');
    const lngStr = params.get('lng');
    const dateStr = params.get('date');
    const timeStr = params.get('time');
    
    const state: Partial<AppState> = {};
    
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) {
        state.location = [lng, lat];
      }
    }
    
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        state.selectedDate = d;
        state.month = d.getMonth() + 1;
      }
    }
    
    if (timeStr) {
      state.selectedTime = timeStr;
    }
    
    return Object.keys(state).length > 0 ? state : null;
  } catch (error) {
    console.error('Failed to parse share URL:', error);
    return null;
  }
}

/**
 * Saves a bookmark location to localStorage safely.
 */
export function saveBookmark(bookmark: BookmarkLocation): void {
  try {
    const existing = getBookmarks();
    existing.push(bookmark);
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error('Failed to save bookmark:', error);
  }
}

/**
 * Retrieves all saved bookmarks from localStorage.
 */
export function getBookmarks(): BookmarkLocation[] {
  try {
    const stored = localStorage.getItem(BOOKMARK_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to get bookmarks:', error);
  }
  return [];
}

/**
 * Removes a bookmark location by ID from localStorage.
 */
export function removeBookmark(id: string): void {
  try {
    const existing = getBookmarks();
    const updated = existing.filter((b) => b.id !== id);
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to remove bookmark:', error);
  }
}
