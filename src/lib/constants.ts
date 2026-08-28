export const DEFAULT_CENTER: [number, number] = [100.5018, 13.7563]; // Bangkok
export const DEFAULT_ZOOM = 14;
export const SHADOW_COLOR = '#01112f';
export const SHADOW_OPACITY = 0.7;
export const ANIMATION_INTERVAL_MS = 100;

export const PRESET_LOCATIONS = [
  { name: 'กรุงเทพมหานคร', nameEn: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'เชียงใหม่', nameEn: 'Chiang Mai', lat: 18.7883, lng: 98.9853 },
  { name: 'ภูเก็ต', nameEn: 'Phuket', lat: 7.8804, lng: 98.3923 },
  { name: 'พัทยา', nameEn: 'Pattaya', lat: 12.9236, lng: 100.8825 },
  { name: 'ขอนแก่น', nameEn: 'Khon Kaen', lat: 16.4322, lng: 102.8236 },
  { name: 'หาดใหญ่', nameEn: 'Hat Yai', lat: 7.0097, lng: 100.4705 },
];

export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export const SOLSTICE_DATES = {
  summer: new Date(new Date().getFullYear(), 5, 21), // June 21
  winter: new Date(new Date().getFullYear(), 11, 21), // Dec 21
};

/**
 * Returns the MapTiler style URL.
 */
export const getMapTilerStyleUrl = (apiKey: string, style: string = 'streets-v2') => {
  return `https://api.maptiler.com/maps/${style}/style.json?key=${apiKey}`;
};

/**
 * Configuration object for MapTiler DEM terrain source used in shadow simulation.
 */
export const TERRAIN_SOURCE = (apiKey: string) => ({
  tileSize: 256,
  maxZoom: 12,
  getSourceUrl: (params: { x: number; y: number; z: number }) => {
    return `https://api.maptiler.com/tiles/terrain-rgb-v2/${params.z}/${params.x}/${params.y}.webp?key=${apiKey}`;
  },
  getElevation: (r: number, g: number, b: number) => {
    return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
  }
});
