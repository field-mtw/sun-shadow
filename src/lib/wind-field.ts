import type { MapWind } from '@/lib/wind-vector';
import { OPEN_METEO_ARCHIVE_URL } from '@/lib/constants';
import { openMeteoJson } from '@/lib/open-meteo';
import { pad2 } from '@/lib/sun-engine';

const GRID = 3;
const MIN_SPAN_DEG = 1.6;

export type WindBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type WindField = WindBounds & {
  cols: number;
  rows: number;
  /** Eastward air flow, m/s. */
  u: Float32Array;
  /** Northward air flow, m/s. */
  v: Float32Array;
};

export type GeoPoint = { lng: number; lat: number };
export type GeoStream = { pts: GeoPoint[]; phase: number };

const fieldCache = new Map<string, WindField>();
const inflight = new Map<string, Promise<WindField | null>>();

function quantize(value: number, step = 0.2): number {
  return Math.round(value / step) * step;
}

function metersPerDegLat(): number {
  return 110540;
}

function metersPerDegLng(lat: number): number {
  return 111320 * Math.max(0.15, Math.cos((lat * Math.PI) / 180));
}

function offsetPoint(pt: GeoPoint, east: number, north: number, meters: number): GeoPoint {
  return {
    lng: pt.lng + (east * meters) / metersPerDegLng(pt.lat),
    lat: pt.lat + (north * meters) / metersPerDegLat(),
  };
}

function distM(a: GeoPoint, b: GeoPoint): number {
  const lat = (a.lat + b.lat) / 2;
  const dx = (b.lng - a.lng) * metersPerDegLng(lat);
  const dy = (b.lat - a.lat) * metersPerDegLat();
  return Math.hypot(dx, dy);
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function inside(pt: GeoPoint, b: WindBounds, pad = 0): boolean {
  const w = (b.east - b.west) * pad;
  const h = (b.north - b.south) * pad;
  return pt.lng >= b.west - w && pt.lng <= b.east + w && pt.lat >= b.south - h && pt.lat <= b.north + h;
}

function padBounds(b: WindBounds, t: number): WindBounds {
  const w = b.east - b.west;
  const h = b.north - b.south;
  return {
    west: b.west - w * t,
    east: b.east + w * t,
    south: b.south - h * t,
    north: b.north + h * t,
  };
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(last)}`,
  };
}

function cacheKey(extent: WindBounds, month: number, year: number): string {
  return `${year}-${month}-${extent.west.toFixed(2)}:${extent.south.toFixed(2)}:${extent.east.toFixed(2)}:${extent.north.toFixed(2)}`;
}

export function extentForView(view: WindBounds): WindBounds {
  const clng = (view.west + view.east) / 2;
  const clat = (view.south + view.north) / 2;
  const w = Math.max((view.east - view.west) * 1.4, MIN_SPAN_DEG);
  const h = Math.max((view.north - view.south) * 1.4, MIN_SPAN_DEG);
  return {
    west: quantize(clng - w / 2),
    south: quantize(clat - h / 2),
    east: quantize(clng + w / 2),
    north: quantize(clat + h / 2),
  };
}

export function uniformFieldFromWind(wind: MapWind, extent: WindBounds): WindField {
  const rad = (wind.towardDeg * Math.PI) / 180;
  const mps = Math.max(wind.speedKmh, 0.8) / 3.6;
  const ue = mps * Math.sin(rad);
  const vn = mps * Math.cos(rad);
  return {
    ...extent,
    cols: 2,
    rows: 2,
    u: new Float32Array(4).fill(ue),
    v: new Float32Array(4).fill(vn),
  };
}

function vectorMeanDaily(daily: {
  wind_speed_10m_max?: (number | null)[];
  wind_direction_10m_dominant?: (number | null)[];
} | undefined): { u: number; v: number } | null {
  const speeds = daily?.wind_speed_10m_max;
  const dirs = daily?.wind_direction_10m_dominant;
  if (!speeds || !dirs) return null;

  let su = 0;
  let sv = 0;
  let n = 0;
  for (let i = 0; i < speeds.length; i++) {
    const spd = speeds[i];
    const dir = dirs[i];
    if (spd == null || dir == null) continue;
    const mps = spd / 3.6;
    const rad = (dir * Math.PI) / 180;
    su += -mps * Math.sin(rad);
    sv += -mps * Math.cos(rad);
    n += 1;
  }
  if (!n) return null;
  return { u: su / n, v: sv / n };
}

function fillHoles(u: Float32Array, v: Float32Array): boolean {
  let su = 0;
  let sv = 0;
  let n = 0;
  for (let i = 0; i < u.length; i++) {
    if (Number.isFinite(u[i]) && Number.isFinite(v[i])) {
      su += u[i];
      sv += v[i];
      n += 1;
    }
  }
  if (!n) return false;
  const mu = su / n;
  const mv = sv / n;
  for (let i = 0; i < u.length; i++) {
    if (!Number.isFinite(u[i]) || !Number.isFinite(v[i])) {
      u[i] = mu;
      v[i] = mv;
    }
  }
  return true;
}

type ArchiveItem = {
  daily?: {
    wind_speed_10m_max?: (number | null)[];
    wind_direction_10m_dominant?: (number | null)[];
  };
};

async function fetchGrid(extent: WindBounds, month: number, year: number): Promise<WindField | null> {
  const { start, end } = monthRange(year, month);
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let row = 0; row < GRID; row++) {
    const lat = extent.south + ((extent.north - extent.south) * row) / (GRID - 1);
    for (let col = 0; col < GRID; col++) {
      const lng = extent.west + ((extent.east - extent.west) * col) / (GRID - 1);
      lats.push(lat);
      lngs.push(lng);
    }
  }

  const url =
    `${OPEN_METEO_ARCHIVE_URL}?latitude=${lats.join(',')}&longitude=${lngs.join(',')}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=wind_speed_10m_max,wind_direction_10m_dominant&timezone=UTC`;

  const payload = await openMeteoJson<ArchiveItem | ArchiveItem[]>(url);
  if (!payload) return null;
  const items = Array.isArray(payload) ? payload : [payload];

  const u = new Float32Array(GRID * GRID);
  const v = new Float32Array(GRID * GRID);
  u.fill(Number.NaN);
  v.fill(Number.NaN);

  for (let i = 0; i < items.length && i < GRID * GRID; i++) {
    const uv = vectorMeanDaily(items[i]?.daily);
    if (!uv) continue;
    u[i] = uv.u;
    v[i] = uv.v;
  }

  if (!fillHoles(u, v)) return null;

  return {
    ...extent,
    cols: GRID,
    rows: GRID,
    u,
    v,
  };
}

export async function getMonthlyWindField(
  extent: WindBounds,
  month: number,
  year: number = new Date().getFullYear() - 1,
): Promise<WindField | null> {
  const key = cacheKey(extent, month, year);
  const cached = fieldCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchGrid(extent, month, year)
    .then((field) => {
      if (field) {
        fieldCache.set(key, field);
        if (fieldCache.size > 16) {
          const oldest = fieldCache.keys().next().value;
          if (oldest) fieldCache.delete(oldest);
        }
      }
      return field;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function sampleField(field: WindField, lng: number, lat: number): { u: number; v: number } | null {
  const { west, south, east, north, cols, rows, u, v } = field;
  if (east === west || north === south) return null;
  if (lng < west || lng > east || lat < south || lat > north) return null;

  const x = ((lng - west) / (east - west)) * (cols - 1);
  const y = ((lat - south) / (north - south)) * (rows - 1);
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(y)));
  const x1 = Math.min(x0 + 1, cols - 1);
  const y1 = Math.min(y0 + 1, rows - 1);
  const tx = x - x0;
  const ty = y - y0;
  const idx = (col: number, row: number) => row * cols + col;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return {
    u: lerp(lerp(u[idx(x0, y0)], u[idx(x1, y0)], tx), lerp(u[idx(x0, y1)], u[idx(x1, y1)], tx), ty),
    v: lerp(lerp(v[idx(x0, y0)], v[idx(x1, y0)], tx), lerp(v[idx(x0, y1)], v[idx(x1, y1)], tx), ty),
  };
}

function meanVector(field: WindField): { u: number; v: number } {
  let su = 0;
  let sv = 0;
  for (let i = 0; i < field.u.length; i++) {
    su += field.u[i];
    sv += field.v[i];
  }
  const n = Math.max(1, field.u.length);
  return { u: su / n, v: sv / n };
}

function probeView(field: WindField, view: WindBounds): { u: number; v: number }[] {
  const midLng = (view.west + view.east) / 2;
  const midLat = (view.south + view.north) / 2;
  const coords: [number, number][] = [
    [view.west, view.south],
    [view.east, view.south],
    [view.west, view.north],
    [view.east, view.north],
    [midLng, midLat],
    [midLng, view.south],
    [midLng, view.north],
    [view.west, midLat],
    [view.east, midLat],
  ];
  const samples: { u: number; v: number }[] = [];
  for (const [lng, lat] of coords) {
    const sample = sampleField(field, lng, lat);
    if (sample) samples.push(sample);
  }
  return samples;
}

function visualizationGain(samples: { u: number; v: number }[], mean: { u: number; v: number }): number {
  const meanAng = Math.atan2(mean.u, mean.v);
  let maxDev = 0;
  for (const sample of samples) {
    maxDev = Math.max(maxDev, angDiff(Math.atan2(sample.u, sample.v), meanAng));
  }
  if (maxDev < 0.02) return 1;
  return Math.max(1, Math.min(3, (16 * Math.PI) / 180 / maxDev));
}

function sampleEnhanced(
  field: WindField,
  lng: number,
  lat: number,
  mean: { u: number; v: number },
  gain: number,
): { u: number; v: number } | null {
  const s = sampleField(field, lng, lat);
  if (!s) return null;
  return {
    u: mean.u + gain * (s.u - mean.u),
    v: mean.v + gain * (s.v - mean.v),
  };
}

function rk2(
  pt: GeoPoint,
  field: WindField,
  mean: { u: number; v: number },
  gain: number,
  stepM: number,
): GeoPoint | null {
  const s1 = sampleEnhanced(field, pt.lng, pt.lat, mean, gain);
  if (!s1) return null;
  const mag1 = Math.hypot(s1.u, s1.v);
  if (mag1 < 1e-5) return null;
  const mid = offsetPoint(pt, s1.u / mag1, s1.v / mag1, stepM * 0.5);
  const s2 = sampleEnhanced(field, mid.lng, mid.lat, mean, gain) ?? s1;
  const mag2 = Math.hypot(s2.u, s2.v);
  if (mag2 < 1e-5) return null;
  return offsetPoint(pt, s2.u / mag2, s2.v / mag2, stepM);
}

function integrate(
  seed: GeoPoint,
  direction: 1 | -1,
  field: WindField,
  mean: { u: number; v: number },
  gain: number,
  stepM: number,
  limit: WindBounds,
): GeoPoint[] {
  const pts: GeoPoint[] = [];
  let pt = seed;
  for (let i = 0; i < 72; i++) {
    const next = rk2(pt, field, mean, gain, stepM * direction);
    if (!next || !inside(next, field) || !inside(next, limit)) break;
    if (distM(pt, next) < 1) break;
    pts.push(next);
    pt = next;
  }
  return pts;
}

function headingChange(pts: GeoPoint[]): number {
  if (pts.length < 3) return 0;
  let turn = 0;
  let prev = Math.atan2(pts[1].lng - pts[0].lng, pts[1].lat - pts[0].lat);
  for (let i = 2; i < pts.length; i++) {
    const ang = Math.atan2(pts[i].lng - pts[i - 1].lng, pts[i].lat - pts[i - 1].lat);
    turn += angDiff(ang, prev);
    prev = ang;
  }
  return turn;
}

function applyMeander(pts: GeoPoint[], amplitudeM: number, wavelengthM: number, phase: number): GeoPoint[] {
  const n = pts.length;
  if (n < 3 || amplitudeM <= 1 || wavelengthM <= 1) return pts;

  const dist = new Float64Array(n);
  for (let i = 1; i < n; i++) dist[i] = dist[i - 1] + distM(pts[i - 1], pts[i]);
  const total = dist[n - 1];
  if (total < 10) return pts;

  const out: GeoPoint[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const east = (pts[i1].lng - pts[i0].lng) * metersPerDegLng(pts[i].lat);
    const north = (pts[i1].lat - pts[i0].lat) * metersPerDegLat();
    const len = Math.hypot(east, north) || 1;
    const fade = Math.sin((dist[i] / total) * Math.PI);
    const off = amplitudeM * fade * Math.sin((Math.PI * 2 * dist[i]) / wavelengthM + phase);
    out.push(offsetPoint(pts[i], -north / len, east / len, off));
  }
  return out;
}

function chaikin(pts: GeoPoint[]): GeoPoint[] {
  if (pts.length < 3) return pts;
  const out: GeoPoint[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({
      lng: a.lng * 0.75 + b.lng * 0.25,
      lat: a.lat * 0.75 + b.lat * 0.25,
    });
    out.push({
      lng: a.lng * 0.25 + b.lng * 0.75,
      lat: a.lat * 0.25 + b.lat * 0.75,
    });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function viewNeedsRetrace(
  prev: WindBounds | null,
  next: WindBounds,
  prevZoom: number,
  nextZoom: number,
): boolean {
  if (!prev) return true;
  if (Math.abs(nextZoom - prevZoom) > 0.35) return true;
  const pw = Math.max(prev.east - prev.west, 1e-8);
  const ph = Math.max(prev.north - prev.south, 1e-8);
  const pcx = (prev.west + prev.east) / 2;
  const pcy = (prev.south + prev.north) / 2;
  const ncx = (next.west + next.east) / 2;
  const ncy = (next.south + next.north) / 2;
  if (Math.abs(ncx - pcx) > pw * 0.2) return true;
  if (Math.abs(ncy - pcy) > ph * 0.2) return true;
  const nw = next.east - next.west;
  const nh = next.north - next.south;
  if (nw > pw * 1.22 || nw < pw * 0.82) return true;
  if (nh > ph * 1.22 || nh < ph * 0.82) return true;
  return false;
}

export function traceStreamlines(field: WindField, view: WindBounds, count = 12): GeoStream[] {
  const samples = probeView(field, view);
  const mean = samples.length
    ? {
        u: samples.reduce((sum, sample) => sum + sample.u, 0) / samples.length,
        v: samples.reduce((sum, sample) => sum + sample.v, 0) / samples.length,
      }
    : meanVector(field);
  const mag = Math.hypot(mean.u, mean.v);
  if (mag < 1e-5) return [];

  const gain = visualizationGain(samples, mean);
  const ux = mean.u / mag;
  const vy = mean.v / mag;
  const px = -vy;
  const py = ux;
  const mid: GeoPoint = {
    lng: (view.west + view.east) / 2,
    lat: (view.south + view.north) / 2,
  };
  const widthM = (view.east - view.west) * metersPerDegLng(mid.lat);
  const heightM = (view.north - view.south) * metersPerDegLat();
  const spanM = Math.max(800, Math.hypot(widthM, heightM));
  const stepM = Math.max(spanM / 52, 180);
  const limit = padBounds(view, 0.42);
  const streams: GeoStream[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count - 0.5;
    const seed = offsetPoint(mid, px, py, t * spanM * 0.9);
    if (!inside(seed, field, 0.02)) continue;

    const fwd = integrate(seed, 1, field, mean, gain, stepM, limit);
    const back = integrate(seed, -1, field, mean, gain, stepM, limit);
    const pts = [...back.reverse(), seed, ...fwd];
    if (pts.length < 8) continue;

    const turn = headingChange(pts);
    const meanderScale = 0.18 + 0.82 * (1 - Math.min(1, turn / ((12 * Math.PI) / 180)));
    const curved = applyMeander(pts, spanM * 0.032 * meanderScale, spanM * 0.74, 0.55);
    streams.push({
      pts: chaikin(curved),
      phase: (i * 0.17) % 1,
    });
  }

  return streams;
}
