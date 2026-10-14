import { METERS_PER_FLOOR } from './constants';

export type BuildingHeightSource = 'measured' | 'estimated' | 'custom';

export interface SmartHeightResult {
  height: number;
  baseHeight: number;
  source: BuildingHeightSource;
  buildingType: string;
  name?: string;
  footprintAreaM2: number;
}

export interface CustomBuildingRecord {
  id: string;
  lat: number;
  lng: number;
  widthMeters: number;
  depthMeters: number;
  heightMeters: number;
  rotationDeg: number;
  name?: string;
  createdAt: number;
}

export interface CustomMassingState {
  /** Keyed by quantized lat/lng key: e.g. "13.75632,100.50184" -> heightMeters */
  heightOverrides: Record<string, number>;
  /** User-placed custom 3D massing blocks */
  customBuildings: CustomBuildingRecord[];
}

const STORAGE_KEY = 'solaria-custom-massing-v1';

/**
 * Generates a stable spatial key for a building centroid in global coordinates.
 * Precision ~1.1m (1e-5 deg) so the same building matches across zoom/pan.
 */
export function makeBuildingGeoKey(lat: number, lng: number): string {
  const rLat = Math.round(lat * 50000) / 50000;
  const rLng = Math.round(lng * 50000) / 50000;
  return `${rLat.toFixed(5)},${rLng.toFixed(5)}`;
}

export function loadCustomMassingState(): CustomMassingState {
  if (typeof window === 'undefined') {
    return { heightOverrides: {}, customBuildings: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { heightOverrides: {}, customBuildings: [] };
    const parsed = JSON.parse(raw) as Partial<CustomMassingState>;
    return {
      heightOverrides: parsed.heightOverrides ?? {},
      customBuildings: Array.isArray(parsed.customBuildings) ? parsed.customBuildings : [],
    };
  } catch {
    return { heightOverrides: {}, customBuildings: [] };
  }
}

export function saveCustomMassingState(state: CustomMassingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function setBuildingHeightOverride(geoKey: string, heightMeters: number | null): CustomMassingState {
  const state = loadCustomMassingState();
  if (heightMeters === null || !Number.isFinite(heightMeters)) {
    delete state.heightOverrides[geoKey];
  } else {
    state.heightOverrides[geoKey] = Math.max(3, Math.min(350, Math.round(heightMeters * 10) / 10));
  }
  saveCustomMassingState(state);
  return state;
}

export function upsertCustomBuilding(record: CustomBuildingRecord): CustomMassingState {
  const state = loadCustomMassingState();
  const idx = state.customBuildings.findIndex((b) => b.id === record.id);
  if (idx >= 0) {
    state.customBuildings[idx] = record;
  } else {
    state.customBuildings.push(record);
  }
  saveCustomMassingState(state);
  return state;
}

export function removeCustomBuilding(id: string): CustomMassingState {
  const state = loadCustomMassingState();
  state.customBuildings = state.customBuildings.filter((b) => b.id !== id);
  saveCustomMassingState(state);
  return state;
}

export function resetCustomMassingInBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): CustomMassingState {
  const state = loadCustomMassingState();
  for (const key of Object.keys(state.heightOverrides)) {
    const [latStr, lngStr] = key.split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (lat >= south && lat <= north && lng >= west && lng <= east) {
      delete state.heightOverrides[key];
    }
  }
  state.customBuildings = state.customBuildings.filter(
    (b) => !(b.lat >= south && b.lat <= north && b.lng >= west && b.lng <= east),
  );
  saveCustomMassingState(state);
  return state;
}

function numberProp(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Computes planar polygon area (m²) and perimeter (m) from local metric ring [x, z]
 */
export function computeMetricPolygonStats(ring: Array<[number, number]>): {
  areaM2: number;
  perimeterM: number;
  compactness: number;
  aspectRatio: number;
} {
  const n = ring.length;
  if (n < 3) {
    return { areaM2: 60, perimeterM: 32, compactness: 0.7, aspectRatio: 1 };
  }
  let signedArea2 = 0;
  let perimeter = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % n];
    signedArea2 += x0 * z1 - x1 * z0;
    perimeter += Math.hypot(x1 - x0, z1 - z0);
    if (x0 < minX) minX = x0;
    if (x0 > maxX) maxX = x0;
    if (z0 < minZ) minZ = z0;
    if (z0 > maxZ) maxZ = z0;
  }

  const areaM2 = Math.max(12, Math.abs(signedArea2) * 0.5);
  const perimeterM = Math.max(14, perimeter);
  // Polsby-Popper compactness: 4*pi*A / P^2 (1.0 = circle, 0.785 = square, <0.4 = L/U wing or elongated)
  const compactness = Math.min(1, (4 * Math.PI * areaM2) / (perimeterM * perimeterM));
  const spanX = Math.max(2, maxX - minX);
  const spanZ = Math.max(2, maxZ - minZ);
  const aspectRatio = Math.max(spanX, spanZ) / Math.min(spanX, spanZ);

  return { areaM2, perimeterM, compactness, aspectRatio };
}

/**
 * Deterministic 0..1 pseudo-random value from global coordinates so the same untagged building
 * always gets the exact same realistic estimated height across renders.
 */
function spatialHash01(lat: number, lng: number): number {
  const x = Math.sin(lat * 12789.345 + lng * 78233.197) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Smart Urban Morphology Height Estimator for Thailand & global cities.
 * Distinguishes real measured heights from OpenMapTiles' 5m/6m untagged fallback,
 * and estimates realistic heights using building tags, footprint area, shape complexity,
 * and urban density context.
 */
export function resolveSmartBuildingHeight(
  props: GeoJSON.GeoJsonProperties | null | undefined,
  metricRing: Array<[number, number]>,
  centroidLat: number,
  centroidLng: number,
  overrideHeight?: number,
): SmartHeightResult {
  const p = props ?? {};
  const stats = computeMetricPolygonStats(metricRing);
  const baseHeight = Math.max(0, numberProp(p.min_height ?? p.render_min_height));
  const rawType = String(
    p.building ?? p.class ?? p.subclass ?? p.amenity ?? p.office ?? p.shop ?? 'building',
  ).toLowerCase();
  const name =
    typeof p.name === 'string' && p.name.trim().length > 0
      ? p.name.trim()
      : typeof p['name:th'] === 'string'
        ? p['name:th'].trim()
        : typeof p['name:en'] === 'string'
          ? p['name:en'].trim()
          : undefined;

  // 1. User custom override takes highest priority
  if (typeof overrideHeight === 'number' && overrideHeight >= 2.5) {
    return {
      height: overrideHeight,
      baseHeight,
      source: 'custom',
      buildingType: rawType === 'yes' ? 'building' : rawType,
      name,
      footprintAreaM2: Math.round(stats.areaM2),
    };
  }

  // 2. Explicit height or floor count from OSM / Overture
  const explicitHeight = numberProp(p.height);
  if (explicitHeight > 6.6) {
    return {
      height: explicitHeight,
      baseHeight,
      source: 'measured',
      buildingType: rawType === 'yes' ? 'building' : rawType,
      name,
      footprintAreaM2: Math.round(stats.areaM2),
    };
  }

  const explicitFloors = numberProp(p.num_floors ?? p.levels ?? p['building:levels']);
  if (explicitFloors >= 2) {
    return {
      height: explicitFloors * METERS_PER_FLOOR,
      baseHeight,
      source: 'measured',
      buildingType: rawType === 'yes' ? 'building' : rawType,
      name,
      footprintAreaM2: Math.round(stats.areaM2),
    };
  }

  // Note: OpenMapTiles sets `render_height = 5` or `6` as a default fallback when OSM has NO height tag.
  // Only treat `render_height` as a real measured height when it is > 6.6m!
  const renderHeight = numberProp(p.render_height);
  if (renderHeight > 6.6) {
    return {
      height: renderHeight,
      baseHeight,
      source: 'measured',
      buildingType: rawType === 'yes' ? 'building' : rawType,
      name,
      footprintAreaM2: Math.round(stats.areaM2),
    };
  }

  // 3. Smart Morphological Estimation for untagged buildings
  const hRand = spatialHash01(centroidLat, centroidLng);
  const hRand2 = spatialHash01(centroidLng * 1.13, centroidLat * 0.91);
  const { areaM2, compactness, aspectRatio } = stats;

  let estimatedFloors = 3;
  let inferredType = rawType === 'yes' || rawType === 'building' ? 'residential' : rawType;

  // A. Explicit building class heuristics
  if (/condo|apartments|dormitory|hotel|residential_tower/i.test(rawType)) {
    inferredType = 'apartments';
    if (areaM2 > 750) {
      estimatedFloors = 16 + Math.round(hRand * 22); // 16–38 floors (56m–133m)
    } else if (areaM2 > 320) {
      estimatedFloors = 8 + Math.round(hRand * 12); // 8–20 floors (28m–70m)
    } else {
      estimatedFloors = 5 + Math.round(hRand * 5); // 5–10 floors
    }
  } else if (/office|commercial|tower|financial|bank/i.test(rawType)) {
    inferredType = 'office';
    if (areaM2 > 800) {
      estimatedFloors = 14 + Math.round(hRand * 24); // 14–38 floors
    } else if (areaM2 > 300) {
      estimatedFloors = 7 + Math.round(hRand * 11); // 7–18 floors
    } else {
      estimatedFloors = 4 + Math.round(hRand * 4);
    }
  } else if (/hospital|university|college|public|civic|government|school/i.test(rawType)) {
    inferredType = 'institutional';
    if (areaM2 > 600) {
      estimatedFloors = 6 + Math.round(hRand * 9); // 6–15 floors
    } else {
      estimatedFloors = 3 + Math.round(hRand * 4);
    }
  } else if (/retail|mall|department_store|supermarket/i.test(rawType)) {
    inferredType = 'commercial';
    estimatedFloors = areaM2 > 1500 ? 5 + Math.round(hRand * 6) : 3 + Math.round(hRand * 3);
  } else if (/industrial|warehouse|factory|manufacture/i.test(rawType)) {
    inferredType = 'industrial';
    estimatedFloors = 3 + Math.round(hRand * 2);
  } else if (/house|detached|bungalow|semidetached_house|hut|garage|shed|roof/i.test(rawType)) {
    inferredType = 'house';
    estimatedFloors = areaM2 < 65 ? 1.5 : 2 + (hRand > 0.7 ? 1 : 0);
  } else {
    // B. Pure Morphological Inference when OSM tag is generic (`building=yes`)
    if (areaM2 < 95) {
      // Small detached house or kiosk
      inferredType = 'house';
      estimatedFloors = 2 + (hRand > 0.65 ? 1 : 0); // 7m–10.5m
    } else if (areaM2 < 240) {
      // Shophouse row / townhome / small apartment
      inferredType = aspectRatio > 2.4 ? 'shophouse' : 'residential';
      estimatedFloors = 3 + Math.round(hRand * 2.5); // 3–5.5 floors (10.5m–19m)
    } else if (areaM2 < 520) {
      // Medium footprint: mid-rise apartment, condo, or office building
      inferredType = hRand2 > 0.45 ? 'apartments' : 'commercial';
      if (compactness > 0.52 && aspectRatio < 2.6) {
        // Tower-like floorplate
        estimatedFloors = 7 + Math.round(hRand * 13); // 7–20 floors (24.5m–70m)
      } else {
        estimatedFloors = 4 + Math.round(hRand * 6); // 4–10 floors (14m–35m)
      }
    } else if (areaM2 < 1800) {
      // Large floorplate: high-rise condo tower, hotel, or office building
      if (compactness > 0.45 && aspectRatio < 3.0) {
        inferredType = hRand2 > 0.4 ? 'condominium' : 'office';
        estimatedFloors = 12 + Math.round(hRand * 22); // 12–34 floors (42m–119m)
      } else {
        // Multi-wing apartment, school, or commercial building
        inferredType = 'apartments';
        estimatedFloors = 6 + Math.round(hRand * 10); // 6–16 floors (21m–56m)
      }
    } else {
      // Mega footprint (> 1800 m²): podium/mall/complex or industrial
      inferredType = 'commercial';
      estimatedFloors = 6 + Math.round(hRand * 12); // 6–18 floors (21m–63m)
    }
  }

  const estimatedHeight = Math.max(6, Math.round(estimatedFloors * METERS_PER_FLOOR * 10) / 10);

  return {
    height: estimatedHeight,
    baseHeight,
    source: 'estimated',
    buildingType: inferredType,
    name,
    footprintAreaM2: Math.round(areaM2),
  };
}

// --- Live OSM Overpass Enrichment Cache for 3D Studio Slices ---
export interface OsmEnrichedBuilding {
  id: string;
  ring: Array<[number, number]>; // [lng, lat]
  centroid: [number, number]; // [lng, lat]
  properties: Record<string, string | number>;
}

const overpassCache = new Map<string, OsmEnrichedBuilding[]>();

/**
 * Fetches rich OSM building footprints and tags (`building`, `building:levels`, `height`, `name`)
 * inside a bounding box from Overpass API with a fast timeout and in-memory cache.
 * This fills in missing buildings and stripped OSM tags that MapTiler's base tiles omit.
 */
export async function fetchOsmBuildingsInBox(
  west: number,
  south: number,
  east: number,
  north: number,
): Promise<OsmEnrichedBuilding[]> {
  const key = `${south.toFixed(3)},${west.toFixed(3)},${north.toFixed(3)},${east.toFixed(3)}`;
  const cached = overpassCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2400);

  try {
    const bbox = `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`;
    const query = `[out:json][timeout:3];(way["building"](${bbox}););out body geom qt 250;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      elements?: Array<{
        id: number;
        tags?: Record<string, string>;
        geometry?: Array<{ lat: number; lon: number }>;
      }>;
    };

    const out: OsmEnrichedBuilding[] = [];
    for (const el of data.elements ?? []) {
      if (!el.geometry || el.geometry.length < 3) continue;
      const ring: Array<[number, number]> = [];
      let sumLng = 0;
      let sumLat = 0;
      for (const pt of el.geometry) {
        ring.push([pt.lon, pt.lat]);
        sumLng += pt.lon;
        sumLat += pt.lat;
      }
      if (ring.length < 3) continue;
      out.push({
        id: `osm-${el.id}`,
        ring,
        centroid: [sumLng / ring.length, sumLat / ring.length],
        properties: el.tags ?? {},
      });
    }

    overpassCache.set(key, out);
    return out;
  } catch {
    clearTimeout(timer);
    return [];
  }
}
