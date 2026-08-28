const TILE = 256;
const MAX_CACHE = 72;

export type HeightGrid = {
  west: number;
  south: number;
  east: number;
  north: number;
  z: number;
  cols: number;
  rows: number;
  data: Float32Array;
  min: number;
  max: number;
};

const tileCache = new Map<string, Float32Array>();
let decodeCanvas: HTMLCanvasElement | null = null;

function cacheSet(key: string, value: Float32Array): void {
  if (tileCache.has(key)) tileCache.delete(key);
  tileCache.set(key, value);
  while (tileCache.size > MAX_CACHE) {
    const first = tileCache.keys().next().value;
    if (first === undefined) break;
    tileCache.delete(first);
  }
}

export function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const clamped = Math.min(85.051129, Math.max(-85.051129, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

function wrapTileX(x: number, z: number): number {
  const n = 2 ** z;
  return ((x % n) + n) % n;
}

function tileUrl(z: number, x: number, y: number): string {
  return `/api/terrarium/${z}/${wrapTileX(x, z)}/${y}`;
}

function getDecodeContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!decodeCanvas) decodeCanvas = document.createElement('canvas');
  return decodeCanvas.getContext('2d', { willReadFrequently: true });
}

function decodeTerrarium(pixels: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = pixels[o] * 256 + pixels[o + 1] + pixels[o + 2] / 256 - 32768;
  }
  return out;
}

async function loadTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const max = 2 ** z;
  if (y < 0 || y >= max) return null;
  const wx = wrapTileX(x, z);
  const key = `${z}/${wx}/${y}`;
  const hit = tileCache.get(key);
  if (hit) {
    cacheSet(key, hit);
    return hit;
  }
  try {
    const res = await fetch(tileUrl(z, wx, y));
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const ctx = getDecodeContext();
    if (!ctx || !decodeCanvas) {
      bitmap.close();
      return null;
    }
    decodeCanvas.width = bitmap.width;
    decodeCanvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    const heights = decodeTerrarium(img.data, img.width, img.height);
    cacheSet(key, heights);
    return heights;
  } catch {
    return null;
  }
}

export async function buildHeightGrid(
  west: number,
  south: number,
  east: number,
  north: number,
  z: number,
): Promise<HeightGrid | null> {
  const zoom = Math.max(1, Math.min(15, z));
  const max = 2 ** zoom - 1;
  let x0 = lngToTileX(west, zoom);
  let x1 = lngToTileX(east, zoom);
  const y0 = Math.max(0, latToTileY(north, zoom));
  const y1 = Math.min(max, latToTileY(south, zoom));
  if (x1 < x0) x1 = x0;
  const tilesX = x1 - x0 + 1;
  const tilesY = y1 - y0 + 1;
  if (tilesX * tilesY > 36) return null;

  const jobs: Array<Promise<Float32Array | null>> = [];
  const coords: Array<[number, number]> = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      coords.push([tx, ty]);
      jobs.push(loadTile(zoom, tx, ty));
    }
  }
  const tiles = await Promise.all(jobs);

  const cols = tilesX * TILE;
  const rows = tilesY * TILE;
  const data = new Float32Array(cols * rows);
  data.fill(Number.NaN);

  tiles.forEach((tile, index) => {
    if (!tile) return;
    const [tx, ty] = coords[index];
    const ox = (tx - x0) * TILE;
    const oy = (ty - y0) * TILE;
    const srcW = Math.min(TILE, Math.floor(Math.sqrt(tile.length)));
    for (let row = 0; row < srcW; row++) {
      const dest = (oy + row) * cols + ox;
      data.set(tile.subarray(row * srcW, row * srcW + srcW), dest);
    }
  });

  let min = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const h = data[i];
    if (!Number.isFinite(h)) continue;
    if (h < min) min = h;
    if (h > maxH) maxH = h;
  }
  if (!Number.isFinite(min)) return null;

  const n = 2 ** zoom;
  return {
    west: (x0 / n) * 360 - 180,
    east: ((x1 + 1) / n) * 360 - 180,
    north: tileYToLat(y0, zoom),
    south: tileYToLat(y1 + 1, zoom),
    z: zoom,
    cols,
    rows,
    data,
    min,
    max: maxH,
  };
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function sampleHeight(grid: HeightGrid, lng: number, lat: number): number {
  const x = ((lng - grid.west) / (grid.east - grid.west)) * (grid.cols - 1);
  const y = ((grid.north - lat) / (grid.north - grid.south)) * (grid.rows - 1);
  if (x < 0 || y < 0 || x > grid.cols - 1 || y > grid.rows - 1) return Number.NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const h00 = grid.data[y0 * grid.cols + x0];
  const h10 = grid.data[y0 * grid.cols + x1];
  const h01 = grid.data[y1 * grid.cols + x0];
  const h11 = grid.data[y1 * grid.cols + x1];
  if (![h00, h10, h01, h11].every(Number.isFinite)) return h00;
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
}

export function metersPerPixel(grid: HeightGrid, lat: number): number {
  const metersPerDegLng = 111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return (Math.abs(grid.east - grid.west) * metersPerDegLng) / Math.max(1, grid.cols - 1);
}

export function downsampleGrid(grid: HeightGrid, maxDim: number): HeightGrid {
  const scale = Math.max(grid.cols, grid.rows) / maxDim;
  if (scale <= 1.15) return grid;
  const cols = Math.max(48, Math.round(grid.cols / scale));
  const rows = Math.max(48, Math.round(grid.rows / scale));
  const data = new Float32Array(cols * rows);
  const srcW = grid.cols;
  const srcH = grid.rows;
  const srcData = grid.data;
  const invCols = 1 / Math.max(1, cols - 1);
  const invRows = 1 / Math.max(1, rows - 1);
  const maxSrcX = srcW - 1;
  const maxSrcY = srcH - 1;
  for (let y = 0; y < rows; y++) {
    const srcY = (y * invRows) * maxSrcY;
    const y0 = srcY | 0;
    const y1 = y0 < maxSrcY ? y0 + 1 : maxSrcY;
    const fy = srcY - y0;
    const ify = 1 - fy;
    const rowOff0 = y0 * srcW;
    const rowOff1 = y1 * srcW;
    const dstRow = y * cols;
    for (let x = 0; x < cols; x++) {
      const srcX = (x * invCols) * maxSrcX;
      const x0 = srcX | 0;
      const x1 = x0 < maxSrcX ? x0 + 1 : maxSrcX;
      const fx = srcX - x0;
      const h00 = srcData[rowOff0 + x0];
      // Fast NaN check: NaN !== NaN
      if (h00 !== h00) {
        data[dstRow + x] = h00;
      } else {
        const h10 = srcData[rowOff0 + x1];
        const h01 = srcData[rowOff1 + x0];
        const h11 = srcData[rowOff1 + x1];
        data[dstRow + x] =
          h00 * (1 - fx) * ify +
          (h10 === h10 ? h10 : h00) * fx * ify +
          (h01 === h01 ? h01 : h00) * (1 - fx) * fy +
          (h11 === h11 ? h11 : h00) * fx * fy;
      }
    }
  }
  return { ...grid, cols, rows, data };
}
