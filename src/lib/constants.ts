export const DEFAULT_CENTER: [number, number] = [100.5018, 13.7563]; // Bangkok
export const DEFAULT_ZOOM = 14;
export const SHADOW_COLOR = '#010d24';
export const SHADOW_OPACITY = 0.7;

export const PRESET_LOCATIONS = [
  { id: 'bangkok', name: 'กรุงเทพมหานคร', nameEn: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { id: 'chiangMai', name: 'เชียงใหม่', nameEn: 'Chiang Mai', lat: 18.7883, lng: 98.9853 },
  { id: 'phuket', name: 'ภูเก็ต', nameEn: 'Phuket', lat: 7.8804, lng: 98.3923 },
  { id: 'pattaya', name: 'พัทยา', nameEn: 'Pattaya', lat: 12.9236, lng: 100.8825 },
  { id: 'khonKaen', name: 'ขอนแก่น', nameEn: 'Khon Kaen', lat: 16.4322, lng: 102.8236 },
  { id: 'hatYai', name: 'หาดใหญ่', nameEn: 'Hat Yai', lat: 7.0097, lng: 100.4705 },
] as const;

export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type WindCompass = (typeof WIND_DIRECTIONS)[number];

export const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
export const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export const getMapTilerStyleUrl = (apiKey: string, style = 'outdoor-v2') =>
  `https://api.maptiler.com/maps/${style}/style.json?key=${apiKey}`;

/** AWS Open Data Terrain Tiles (Terrarium). Proxied locally to avoid S3 CORS. */
export const TERRARIUM_SOURCE_ID = 'aws-terrarium';
export const TERRARIUM_TILE_URL = '/api/terrarium/{z}/{x}/{y}';
export const TERRARIUM_MAXZOOM = 15;

/** Overture Maps buildings (polygons + height). Proxied for byte-range PMTiles. */
export const OVERTURE_BUILDINGS_SOURCE_ID = 'overture-buildings';
export const OVERTURE_BUILDINGS_LAYER = 'building';
export const OVERTURE_BUILDINGS_PMTILES_URL = 'pmtiles:///api/overture-buildings';
export const METERS_PER_FLOOR = 3.5;
