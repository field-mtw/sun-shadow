import type { Map as MapLibreMap } from 'maplibre-gl';
import { OVERTURE_BUILDINGS_LAYER, OVERTURE_BUILDINGS_SOURCE_ID } from './constants';
import { buildHeightGrid, sampleHeight, type HeightGrid } from './terrarium';
import { getSunPosition, getSunTimes } from './sun-engine';
import type { MapWind } from './wind-vector';
import {
  fetchOsmBuildingsInBox,
  loadCustomMassingState,
  makeBuildingGeoKey,
  resolveSmartBuildingHeight,
  type BuildingHeightSource,
} from './smart-height';

export type StudioBoxSize = 200 | 350 | 500;

export interface ClayBuilding {
  id: string;
  /** Global coordinate key for persistence of height overrides */
  geoKey: string;
  lat: number;
  lng: number;
  /** Local metric coordinates [x (East+), z (South+)] inside [-half, +half] */
  footprint: Array<[number, number]>;
  centroid: [number, number];
  radius: number;
  height: number;
  defaultHeight: number;
  baseHeight: number;
  heightSource: BuildingHeightSource;
  buildingType: string;
  name?: string;
  footprintAreaM2: number;
  isCustomAdded?: boolean;
  customWidth?: number;
  customDepth?: number;
  customRotationDeg?: number;
  groundElevation: number;
  roofSunHours: number;
  /** Sun hours for each edge i -> (i+1) of footprint */
  wallSunHours: number[];
}

export interface ClayRoad {
  points: Array<[number, number]>;
  kind: 'major' | 'minor';
}

export interface ClayContour {
  elevation: number;
  /** Pairs of [x1, z1, x2, z2] segments in local meters */
  segments: number[];
}

export interface SiteScorecardData {
  overallScore: number;
  afternoonShadeScore: number;
  windCorridorScore: number;
  solarPotentialScore: number;
  avgRoofSunHours: number;
  estimatedKwhPerKwp: number;
  buildingCount: number;
  maxBuildingHeight: number;
  elevationRelief: number;
}

export interface ClayAreaSlice {
  centerLat: number;
  centerLng: number;
  sizeMeters: StudioBoxSize;
  terrain: {
    cols: number;
    rows: number;
    /** Relative height in meters above minElevation (size = cols * rows) */
    heights: Float32Array;
    /** Direct sun hours (0..12+) per terrain vertex (size = cols * rows) */
    groundSunHours: Float32Array;
    minElevation: number;
    maxElevation: number;
  };
  buildings: ClayBuilding[];
  roads: ClayRoad[];
  contours: ClayContour[];
  scorecard: SiteScorecardData;
}

const MAX_STUDIO_BUILDINGS = 240;
const TERRAIN_GRID_RES = 44;

function pointInPolygon2D(px: number, pz: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Marching squares contour segment extractor on the normalized terrain height grid.
 */
function buildContours(
  heights: Float32Array,
  cols: number,
  rows: number,
  sizeMeters: number,
  relief: number,
): ClayContour[] {
  if (relief < 2.5) return [];
  const step = relief > 80 ? 15 : relief > 35 ? 8 : relief > 12 ? 4 : 2;
  const half = sizeMeters / 2;
  const contours: ClayContour[] = [];

  for (let level = step; level < relief; level += step) {
    if (contours.length >= 10) break;
    const segments: number[] = [];

    for (let r = 0; r < rows - 1; r++) {
      const z0 = -half + (r / (rows - 1)) * sizeMeters;
      const z1 = -half + ((r + 1) / (rows - 1)) * sizeMeters;
      for (let c = 0; c < cols - 1; c++) {
        const x0 = -half + (c / (cols - 1)) * sizeMeters;
        const x1 = -half + ((c + 1) / (cols - 1)) * sizeMeters;

        const h00 = heights[r * cols + c];
        const h10 = heights[r * cols + (c + 1)];
        const h11 = heights[(r + 1) * cols + (c + 1)];
        const h01 = heights[(r + 1) * cols + c];

        const mask =
          (h00 >= level ? 1 : 0) |
          (h10 >= level ? 2 : 0) |
          (h11 >= level ? 4 : 0) |
          (h01 >= level ? 8 : 0);
        if (mask === 0 || mask === 15) continue;

        const interp = (ha: number, hb: number) => {
          const denom = hb - ha;
          return Math.abs(denom) < 1e-5 ? 0.5 : Math.max(0, Math.min(1, (level - ha) / denom));
        };

        const top: [number, number] = [x0 + interp(h00, h10) * (x1 - x0), z0];
        const right: [number, number] = [x1, z0 + interp(h10, h11) * (z1 - z0)];
        const bottom: [number, number] = [x0 + interp(h01, h11) * (x1 - x0), z1];
        const left: [number, number] = [x0, z0 + interp(h00, h01) * (z1 - z0)];

        const pushSeg = (a: [number, number], b: [number, number]) => {
          segments.push(a[0], a[1], b[0], b[1]);
        };

        switch (mask) {
          case 1:
          case 14:
            pushSeg(left, top);
            break;
          case 2:
          case 13:
            pushSeg(top, right);
            break;
          case 3:
          case 12:
            pushSeg(left, right);
            break;
          case 4:
          case 11:
            pushSeg(right, bottom);
            break;
          case 6:
          case 9:
            pushSeg(top, bottom);
            break;
          case 7:
          case 8:
            pushSeg(left, bottom);
            break;
          case 5:
            pushSeg(left, bottom);
            pushSeg(top, right);
            break;
          case 10:
            pushSeg(left, top);
            pushSeg(bottom, right);
            break;
          default:
            break;
        }
      }
    }

    if (segments.length > 0) {
      contours.push({ elevation: level, segments });
    }
  }

  return contours;
}

/**
 * Computes cumulative daily sunlight hours on ground cells, building roofs, and building walls,
 * plus the Site Comfort & Breeze Scorecard.
 */
export function computeSolarAndScorecard(
  buildings: ClayBuilding[],
  terrainHeights: Float32Array,
  cols: number,
  rows: number,
  sizeMeters: StudioBoxSize,
  centerLat: number,
  centerLng: number,
  date: Date,
  wind?: MapWind | null,
  elevationRelief = 0,
): {
  groundSunHours: Float32Array;
  scorecard: SiteScorecardData;
} {
  const times = getSunTimes(date, centerLat, centerLng);
  const srMs = times.sunrise.getTime();
  const ssMs = times.sunset.getTime();
  const stepMinutes = 30;
  const stepHours = stepMinutes / 60;
  const stepMs = stepMinutes * 60 * 1000;

  interface SunSample {
    dx: number;
    dy: number;
    dz: number;
    tanAlt: number;
    isAfternoon: boolean;
  }

  const samples: SunSample[] = [];
  for (let t = srMs + stepMs * 0.4; t < ssMs; t += stepMs) {
    const d = new Date(t);
    const pos = getSunPosition(d, centerLat, centerLng);
    if (pos.altitudeDeg <= 3) continue;
    const azRad = (pos.compassAzimuthDeg * Math.PI) / 180;
    const altRad = (pos.altitudeDeg * Math.PI) / 180;
    // Direction vector pointing TOWARD the sun in local metric coords:
    // +X = East = sin(az), -Z = North = cos(az) => Z = -cos(az)
    const cosAlt = Math.cos(altRad);
    const dx = Math.sin(azRad) * cosAlt;
    const dy = Math.sin(altRad);
    const dz = -Math.cos(azRad) * cosAlt;
    const hr = d.getHours() + d.getMinutes() / 60;
    samples.push({
      dx,
      dy,
      dz,
      tanAlt: Math.tan(altRad),
      isAfternoon: hr >= 13 && hr <= 16.5,
    });
  }

  const totalPossibleHours = Math.max(1, samples.length * stepHours);

  // Precompute building AABBs, global maxRoofY, and a 16x16 2D spatial grid for O(1) ray-marching lookups
  const nBld = buildings.length;
  const bMinX = new Float32Array(nBld);
  const bMaxX = new Float32Array(nBld);
  const bMinZ = new Float32Array(nBld);
  const bMaxZ = new Float32Array(nBld);
  const bTopY = new Float32Array(nBld);
  let maxSceneRoofY = -Infinity;

  const GRID_DIM = 16;
  const gridHalf = sizeMeters * 0.58;
  const gridSpan = gridHalf * 2;
  const invCellSize = GRID_DIM / gridSpan;
  const gridCells: number[][] = Array.from({ length: GRID_DIM * GRID_DIM }, () => []);
  const cellMaxRoofY = new Float32Array(GRID_DIM * GRID_DIM);

  for (let i = 0; i < nBld; i++) {
    const b = buildings[i];
    const topY = b.groundElevation + b.height;
    bTopY[i] = topY;
    if (topY > maxSceneRoofY) maxSceneRoofY = topY;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [vx, vz] of b.footprint) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    bMinX[i] = minX;
    bMaxX[i] = maxX;
    bMinZ[i] = minZ;
    bMaxZ[i] = maxZ;

    const gx0 = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((minX + gridHalf) * invCellSize)));
    const gx1 = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((maxX + gridHalf) * invCellSize)));
    const gz0 = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((minZ + gridHalf) * invCellSize)));
    const gz1 = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((maxZ + gridHalf) * invCellSize)));

    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cIdx = gz * GRID_DIM + gx;
        gridCells[cIdx].push(i);
        if (topY > cellMaxRoofY[cIdx]) cellMaxRoofY[cIdx] = topY;
      }
    }
  }

  // Helper: check if a 3D ray from (ox, oy, oz) toward the sun is blocked by any building
  const isBlockedByBuilding = (
    ox: number,
    oy: number,
    oz: number,
    sample: SunSample,
    ignoreBuildingIdx: number,
  ): boolean => {
    if (nBld === 0 || oy >= maxSceneRoofY) return false;
    const maxDist = Math.min(sizeMeters * 0.9, 260);
    const marchStep = 8;

    for (let dist = marchStep; dist <= maxDist; dist += marchStep) {
      const ry = oy + sample.dy * dist;
      // Since sample.dy > 0, once the ray climbs above the tallest building in the scene, it can never hit anything
      if (ry >= maxSceneRoofY) break;

      const rx = ox + sample.dx * dist;
      const rz = oz + sample.dz * dist;
      if (rx < -gridHalf || rx > gridHalf || rz < -gridHalf || rz > gridHalf) break;

      const gx = (rx + gridHalf) * invCellSize;
      const gz = (rz + gridHalf) * invCellSize;
      const cIdx = (gz | 0) * GRID_DIM + (gx | 0);
      if (ry >= cellMaxRoofY[cIdx]) continue;

      const bucket = gridCells[cIdx];
      for (let k = 0; k < bucket.length; k++) {
        const bIdx = bucket[k];
        if (bIdx === ignoreBuildingIdx) continue;
        if (ry >= bTopY[bIdx]) continue;
        if (rx < bMinX[bIdx] || rx > bMaxX[bIdx] || rz < bMinZ[bIdx] || rz > bMaxZ[bIdx]) continue;
        if (pointInPolygon2D(rx, rz, buildings[bIdx].footprint)) {
          return true;
        }
      }
    }
    return false;
  };

  // 1. Building roof & wall solar hours
  let sumRoofHours = 0;
  for (let bIdx = 0; bIdx < buildings.length; bIdx++) {
    const b = buildings[bIdx];
    const roofY = b.groundElevation + b.height + 0.2;
    let roofHits = 0;
    for (const s of samples) {
      if (!isBlockedByBuilding(b.centroid[0], roofY, b.centroid[1], s, bIdx)) {
        roofHits++;
      }
    }
    b.roofSunHours = roofHits * stepHours;
    sumRoofHours += b.roofSunHours;

    const wallHours: number[] = [];
    const ring = b.footprint;
    const midY = b.groundElevation + b.baseHeight + (b.height - b.baseHeight) * 0.55;
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[i];
      const p1 = ring[(i + 1) % ring.length];
      const ex = p1[0] - p0[0];
      const ez = p1[1] - p0[1];
      const len = Math.hypot(ex, ez) || 1;
      // Outward normal (assuming CCW or CW; check against centroid)
      let nx = ez / len;
      let nz = -ex / len;
      const mx = (p0[0] + p1[0]) * 0.5;
      const mz = (p0[1] + p1[1]) * 0.5;
      if (nx * (mx - b.centroid[0]) + nz * (mz - b.centroid[1]) < 0) {
        nx = -nx;
        nz = -nz;
      }

      let wallHits = 0;
      for (const s of samples) {
        const dot = nx * s.dx + nz * s.dz;
        if (dot <= 0.05) continue;
        if (!isBlockedByBuilding(mx + nx * 1.5, midY, mz + nz * 1.5, s, bIdx)) {
          wallHits++;
        }
      }
      wallHours.push(wallHits * stepHours);
    }
    b.wallSunHours = wallHours;
  }

  // 2. Ground solar heatmap grid (cols x rows)
  const groundSunHours = new Float32Array(cols * rows);
  const half = sizeMeters / 2;
  let afternoonTotalChecks = 0;
  let afternoonShadedChecks = 0;

  for (let r = 0; r < rows; r++) {
    const gz = -half + (r / (rows - 1)) * sizeMeters;
    for (let c = 0; c < cols; c++) {
      const gx = -half + (c / (cols - 1)) * sizeMeters;
      const idx = r * cols + c;
      const gy = terrainHeights[idx] + 0.3;

      let hits = 0;
      for (const s of samples) {
        const blocked = isBlockedByBuilding(gx, gy, gz, s, -1);
        if (!blocked) {
          hits++;
        }
        if (s.isAfternoon) {
          afternoonTotalChecks++;
          if (blocked) afternoonShadedChecks++;
        }
      }
      groundSunHours[idx] = hits * stepHours;
    }
  }

  // 3. Compute Site Comfort & Breeze Scorecard
  const afternoonShadeRatio =
    afternoonTotalChecks > 0 ? afternoonShadedChecks / afternoonTotalChecks : 0.25;
  // Ideal afternoon shade for tropical urban comfort is ~35%–75%
  const afternoonShadeScore = Math.round(
    Math.min(100, Math.max(25, 30 + afternoonShadeRatio * 95)),
  );

  // Wind corridor score: evaluate building coverage ratio & alignment with wind
  let footprintArea = 0;
  let maxBuildingHeight = 0;
  for (const b of buildings) {
    if (b.height > maxBuildingHeight) maxBuildingHeight = b.height;
    footprintArea += Math.PI * (b.radius * 0.68) ** 2;
  }
  const siteArea = sizeMeters * sizeMeters;
  const coverageRatio = Math.min(0.85, footprintArea / siteArea);
  const windSpeedFactor = wind ? Math.min(1, wind.speedKmh / 18) : 0.55;
  const opennessScore = (1 - coverageRatio * 0.85) * 100;
  const windCorridorScore = Math.round(
    Math.min(98, Math.max(32, opennessScore * 0.65 + windSpeedFactor * 35)),
  );

  const avgRoofSunHours =
    buildings.length > 0
      ? sumRoofHours / buildings.length
      : totalPossibleHours * 0.82;
  const solarPotentialScore = Math.round(
    Math.min(99, Math.max(35, (avgRoofSunHours / Math.max(8, totalPossibleHours)) * 100)),
  );
  // Standard PV yield in Thailand ~ 0.78 performance ratio * peak sun hours
  const estimatedKwhPerKwp = Number((avgRoofSunHours * 0.42).toFixed(1));

  const overallScore = Math.round(
    afternoonShadeScore * 0.38 + windCorridorScore * 0.32 + solarPotentialScore * 0.3,
  );

  return {
    groundSunHours,
    scorecard: {
      overallScore,
      afternoonShadeScore,
      windCorridorScore,
      solarPotentialScore,
      avgRoofSunHours: Number(avgRoofSunHours.toFixed(1)),
      estimatedKwhPerKwp,
      buildingCount: buildings.length,
      maxBuildingHeight: Math.round(maxBuildingHeight),
      elevationRelief: Math.round(elevationRelief),
    },
  };
}

/**
 * Extracts a bounded square slice (200m / 350m / 500m) around the map center
 * including 3D building footprints, etched road vectors, and AWS Terrarium DEM heights.
 */
export async function extractClayAreaSlice(
  map: MapLibreMap,
  sizeMeters: StudioBoxSize,
  date: Date,
  wind?: MapWind | null,
): Promise<ClayAreaSlice> {
  const center = map.getCenter();
  const centerLat = center.lat;
  const centerLng = center.lng;

  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));

  const half = sizeMeters / 2;
  const dLat = half / metersPerDegLat;
  const dLng = half / metersPerDegLng;

  const west = centerLng - dLng;
  const east = centerLng + dLng;
  const south = centerLat - dLat;
  const north = centerLat + dLat;

  const toLocalXZ = (lng: number, lat: number): [number, number] => [
    (lng - centerLng) * metersPerDegLng,
    // +Z is South so that North is -Z in Three.js right-handed space
    (centerLat - lat) * metersPerDegLat,
  ];

  // 1. Build DEM height grid for the bounding box
  let demGrid: HeightGrid | null = null;
  try {
    demGrid = await buildHeightGrid(west - dLng * 0.5, south - dLat * 0.5, east + dLng * 0.5, north + dLat * 0.5, 13);
  } catch {
    demGrid = null;
  }

  const cols = TERRAIN_GRID_RES;
  const rows = TERRAIN_GRID_RES;
  const rawHeights = new Float32Array(cols * rows);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let r = 0; r < rows; r++) {
    const lat = north - (r / (rows - 1)) * (north - south);
    for (let c = 0; c < cols; c++) {
      const lng = west + (c / (cols - 1)) * (east - west);
      const h = demGrid ? sampleHeight(demGrid, lng, lat) : 0;
      const safeH = Number.isFinite(h) ? h : 0;
      rawHeights[r * cols + c] = safeH;
      if (safeH < minElev) minElev = safeH;
      if (safeH > maxElev) maxElev = safeH;
    }
  }
  if (!Number.isFinite(minElev)) {
    minElev = 0;
    maxElev = 0;
  }

  const heights = new Float32Array(cols * rows);
  for (let i = 0; i < rawHeights.length; i++) {
    heights[i] = Math.max(0, rawHeights[i] - minElev);
  }

  const sampleLocalGround = (x: number, z: number): number => {
    const u = Math.max(0, Math.min(1, (x + half) / sizeMeters));
    const v = Math.max(0, Math.min(1, (z + half) / sizeMeters));
    const c = Math.min(cols - 1, Math.floor(u * (cols - 1)));
    const r = Math.min(rows - 1, Math.floor(v * (rows - 1)));
    return heights[r * cols + c] ?? 0;
  };

  // 2. Extract Building Footprints within the bounding box
  const styleLayers = map.getStyle()?.layers ?? [];
  let baseBuildingSource = '';
  let baseBuildingSourceLayer = 'building';

  for (const layer of styleLayers) {
    if (
      (layer.type === 'fill-extrusion' || (layer.type === 'fill' && /building/i.test(layer.id))) &&
      'source' in layer &&
      typeof layer.source === 'string'
    ) {
      baseBuildingSource = layer.source;
      if ('source-layer' in layer && typeof layer['source-layer'] === 'string') {
        baseBuildingSourceLayer = layer['source-layer'];
      }
      break;
    }
  }

  const querySourceSafe = (sourceId: string, layerNames: string[]) => {
    if (!sourceId || !map.getSource(sourceId)) return [] as GeoJSON.Feature[];
    for (const sourceLayer of layerNames) {
      try {
        const res = map.querySourceFeatures(sourceId, { sourceLayer });
        if (res.length > 0) return res;
      } catch {
        // ignore missing source layer
      }
    }
    return [] as GeoJSON.Feature[];
  };

  const rawFeatures: GeoJSON.Feature[] = [
    ...querySourceSafe(baseBuildingSource, [baseBuildingSourceLayer, 'building']),
    ...querySourceSafe(OVERTURE_BUILDINGS_SOURCE_ID, [OVERTURE_BUILDINGS_LAYER, 'buildings']),
  ];

  // Fallback to rendered features if source query returned empty
  if (rawFeatures.length === 0) {
    try {
      const rendered = map.queryRenderedFeatures();
      for (const f of rendered) {
        if (
          f.layer.type === 'fill-extrusion' ||
          /building/i.test(f.layer.id) ||
          /building/i.test(f.sourceLayer ?? '')
        ) {
          rawFeatures.push(f);
        }
      }
    } catch {
      // ignore
    }
  }

  const seenKeys = new Map<string, number>();
  const buildings: ClayBuilding[] = [];
  const margin = half * 1.06;
  const customMassing = loadCustomMassingState();

  // Also fetch rich OSM Overpass building tags & missing footprints in parallel (fast cached)
  const osmEnriched = await fetchOsmBuildingsInBox(west, south, east, north);

  const ingestPolygon = (
    outer: GeoJSON.Position[],
    props: GeoJSON.GeoJsonProperties | null | undefined,
  ) => {
    if (!outer || outer.length < 3) return;
    const localRing: Array<[number, number]> = [];
    let sumX = 0;
    let sumZ = 0;
    let sumLng = 0;
    let sumLat = 0;

    for (let i = 0; i < outer.length; i++) {
      const pt = outer[i];
      if (typeof pt[0] !== 'number' || typeof pt[1] !== 'number') continue;
      if (
        i === outer.length - 1 &&
        localRing.length > 0 &&
        Math.abs(pt[0] - outer[0][0]) < 1e-7 &&
        Math.abs(pt[1] - outer[0][1]) < 1e-7
      ) {
        continue;
      }
      const [lx, lz] = toLocalXZ(pt[0], pt[1]);
      localRing.push([lx, lz]);
      sumX += lx;
      sumZ += lz;
      sumLng += pt[0];
      sumLat += pt[1];
    }

    if (localRing.length < 3) return;
    const cx = sumX / localRing.length;
    const cz = sumZ / localRing.length;
    if (Math.abs(cx) > margin || Math.abs(cz) > margin) return;

    const cLng = sumLng / localRing.length;
    const cLat = sumLat / localRing.length;
    const geoKey = makeBuildingGeoKey(cLat, cLng);
    const overrideH = customMassing.heightOverrides[geoKey];

    const defaultSmart = resolveSmartBuildingHeight(props, localRing, cLat, cLng, undefined);
    const smart =
      overrideH !== undefined
        ? resolveSmartBuildingHeight(props, localRing, cLat, cLng, overrideH)
        : defaultSmart;

    // Deduplicate by quantized local centroid (~2m grid)
    const key = `${Math.round(cx * 0.4)},${Math.round(cz * 0.4)}`;
    const existingIdx = seenKeys.get(key);
    if (existingIdx !== undefined) {
      const existing = buildings[existingIdx];
      // Prefer custom override > measured height > richer tags / taller height
      if (
        smart.source === 'custom' ||
        (smart.source === 'measured' && existing.heightSource !== 'custom') ||
        (smart.height > existing.height && existing.heightSource !== 'custom')
      ) {
        existing.height = smart.height;
        existing.defaultHeight = defaultSmart.height;
        existing.heightSource = smart.source;
      }
      if (smart.name && !existing.name) existing.name = smart.name;
      if (smart.buildingType !== 'residential' && existing.buildingType === 'residential') {
        existing.buildingType = smart.buildingType;
      }
      return;
    }

    let maxR = 2;
    for (const [vx, vz] of localRing) {
      const d = Math.hypot(vx - cx, vz - cz);
      if (d > maxR) maxR = d;
    }

    seenKeys.set(key, buildings.length);
    buildings.push({
      id: `b-${buildings.length}`,
      geoKey,
      lat: cLat,
      lng: cLng,
      footprint: localRing,
      centroid: [cx, cz],
      radius: maxR,
      height: smart.height,
      defaultHeight: defaultSmart.height,
      baseHeight: smart.baseHeight,
      heightSource: smart.source,
      buildingType: smart.buildingType,
      name: smart.name,
      footprintAreaM2: smart.footprintAreaM2,
      groundElevation: sampleLocalGround(cx, cz),
      roofSunHours: 0,
      wallSunHours: [],
    });
  };

  for (const feature of rawFeatures) {
    const geom = feature.geometry;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      ingestPolygon(poly[0] ?? [], feature.properties);
    }
  }

  for (const osmB of osmEnriched) {
    ingestPolygon(osmB.ring, osmB.properties);
  }

  // Sort tallest first and cap at MAX_STUDIO_BUILDINGS
  buildings.sort((a, b) => b.height - a.height);
  if (buildings.length > MAX_STUDIO_BUILDINGS) {
    buildings.length = MAX_STUDIO_BUILDINGS;
  }

  // Inject user-placed custom buildings inside the bounding box
  for (const cb of customMassing.customBuildings) {
    const [cx, cz] = toLocalXZ(cb.lng, cb.lat);
    if (Math.abs(cx) > margin || Math.abs(cz) > margin) continue;
    const hw = cb.widthMeters / 2;
    const hd = cb.depthMeters / 2;
    const rad = (cb.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const corners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    const localRing: Array<[number, number]> = corners.map(([lx, lz]) => [
      cx + lx * cosR - lz * sinR,
      cz + lx * sinR + lz * cosR,
    ]);
    buildings.unshift({
      id: cb.id,
      geoKey: makeBuildingGeoKey(cb.lat, cb.lng),
      lat: cb.lat,
      lng: cb.lng,
      footprint: localRing,
      centroid: [cx, cz],
      radius: Math.hypot(hw, hd),
      height: cb.heightMeters,
      defaultHeight: cb.heightMeters,
      baseHeight: 0,
      heightSource: 'custom',
      buildingType: 'custom',
      name: cb.name,
      footprintAreaM2: Math.round(cb.widthMeters * cb.depthMeters),
      isCustomAdded: true,
      customWidth: cb.widthMeters,
      customDepth: cb.depthMeters,
      customRotationDeg: cb.rotationDeg,
      groundElevation: sampleLocalGround(cx, cz),
      roofSunHours: 0,
      wallSunHours: [],
    });
  }

  // 3. Extract Etched Road Vectors within the box
  const roads: ClayRoad[] = [];
  if (baseBuildingSource) {
    const roadFeatures = querySourceSafe(baseBuildingSource, ['transportation', 'road']);
    const seenRoadKeys = new Set<string>();

    for (const rf of roadFeatures) {
      if (roads.length >= 160) break;
      const g = rf.geometry;
      if (!g) continue;
      const lines =
        g.type === 'LineString'
          ? [g.coordinates]
          : g.type === 'MultiLineString'
            ? g.coordinates
            : [];
      const roadClass = String(rf.properties?.class ?? 'minor');
      const kind: 'major' | 'minor' =
        /motorway|trunk|primary|secondary|tertiary/i.test(roadClass) ? 'major' : 'minor';

      for (const line of lines) {
        const clipped: Array<[number, number]> = [];
        for (const pt of line) {
          if (typeof pt[0] !== 'number' || typeof pt[1] !== 'number') continue;
          const [lx, lz] = toLocalXZ(pt[0], pt[1]);
          if (Math.abs(lx) <= half * 1.02 && Math.abs(lz) <= half * 1.02) {
            clipped.push([lx, lz]);
          } else if (clipped.length >= 2) {
            break;
          }
        }
        if (clipped.length >= 2) {
          const rKey = `${Math.round(clipped[0][0])}:${Math.round(clipped[0][1])}:${Math.round(clipped[clipped.length - 1][0])}`;
          if (!seenRoadKeys.has(rKey)) {
            seenRoadKeys.add(rKey);
            roads.push({ points: clipped, kind });
          }
        }
      }
    }
  }

  const relief = Math.max(0, maxElev - minElev);
  const contours = buildContours(heights, cols, rows, sizeMeters, relief);

  const { groundSunHours, scorecard } = computeSolarAndScorecard(
    buildings,
    heights,
    cols,
    rows,
    sizeMeters,
    centerLat,
    centerLng,
    date,
    wind,
    relief,
  );

  return {
    centerLat,
    centerLng,
    sizeMeters,
    terrain: {
      cols,
      rows,
      heights,
      groundSunHours,
      minElevation: minElev,
      maxElevation: maxElev,
    },
    buildings,
    roads,
    contours,
    scorecard,
  };
}

/**
 * Synchronously updates a ClayAreaSlice after the user modifies building heights
 * or adds/edits/deletes custom massing blocks in the 3D Studio, without re-fetching DEM tiles.
 */
export function recomputeSliceMassing(
  slice: ClayAreaSlice,
  date: Date,
  wind?: MapWind | null,
): ClayAreaSlice {
  const customMassing = loadCustomMassingState();
  const { centerLat, centerLng, sizeMeters } = slice;
  const half = sizeMeters / 2;
  const margin = half * 1.06;
  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const { cols, rows, heights, minElevation, maxElevation } = slice.terrain;

  const sampleLocalGround = (x: number, z: number): number => {
    const u = Math.max(0, Math.min(1, (x + half) / sizeMeters));
    const v = Math.max(0, Math.min(1, (z + half) / sizeMeters));
    const c = Math.min(cols - 1, Math.floor(u * (cols - 1)));
    const r = Math.min(rows - 1, Math.floor(v * (rows - 1)));
    return heights[r * cols + c] ?? 0;
  };

  // Keep map-extracted buildings and apply latest heightOverrides
  const updatedBuildings: ClayBuilding[] = [];
  for (const b of slice.buildings) {
    if (b.isCustomAdded) continue;
    const overrideH = customMassing.heightOverrides[b.geoKey];
    const hasOverride = typeof overrideH === 'number' && overrideH >= 2.5;
    updatedBuildings.push({
      ...b,
      height: hasOverride ? overrideH : b.defaultHeight,
      heightSource: hasOverride ? 'custom' : b.heightSource === 'custom' ? 'estimated' : b.heightSource,
    });
  }

  // Add current custom buildings in bounds
  for (const cb of customMassing.customBuildings) {
    const cx = (cb.lng - centerLng) * metersPerDegLng;
    const cz = (centerLat - cb.lat) * metersPerDegLat;
    if (Math.abs(cx) > margin || Math.abs(cz) > margin) continue;
    const hw = cb.widthMeters / 2;
    const hd = cb.depthMeters / 2;
    const rad = (cb.rotationDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const corners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    const localRing: Array<[number, number]> = corners.map(([lx, lz]) => [
      cx + lx * cosR - lz * sinR,
      cz + lx * sinR + lz * cosR,
    ]);
    updatedBuildings.unshift({
      id: cb.id,
      geoKey: makeBuildingGeoKey(cb.lat, cb.lng),
      lat: cb.lat,
      lng: cb.lng,
      footprint: localRing,
      centroid: [cx, cz],
      radius: Math.hypot(hw, hd),
      height: cb.heightMeters,
      defaultHeight: cb.heightMeters,
      baseHeight: 0,
      heightSource: 'custom',
      buildingType: 'custom',
      name: cb.name,
      footprintAreaM2: Math.round(cb.widthMeters * cb.depthMeters),
      isCustomAdded: true,
      customWidth: cb.widthMeters,
      customDepth: cb.depthMeters,
      customRotationDeg: cb.rotationDeg,
      groundElevation: sampleLocalGround(cx, cz),
      roofSunHours: 0,
      wallSunHours: [],
    });
  }

  const relief = Math.max(0, maxElevation - minElevation);
  const { groundSunHours, scorecard } = computeSolarAndScorecard(
    updatedBuildings,
    heights,
    cols,
    rows,
    sizeMeters,
    centerLat,
    centerLng,
    date,
    wind,
    relief,
  );

  return {
    ...slice,
    terrain: {
      ...slice.terrain,
      groundSunHours,
    },
    buildings: updatedBuildings,
    scorecard,
  };
}

