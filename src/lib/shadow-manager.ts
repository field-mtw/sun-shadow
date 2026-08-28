import ShadeMap from 'mapbox-gl-shadow-simulator';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { SHADOW_COLOR, SHADOW_OPACITY, TERRARIUM_TERRAIN_SOURCE } from './constants';

const BUILDING_SOURCE_ID = 'maptiler_planet';
const BUILDING_SOURCE_LAYER = 'building';
const DEFAULT_BUILDING_HEIGHT_M = 8;

function waitUntilMapLoaded(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => {
    const onRender = () => {
      if (!map.loaded()) return;
      map.off('render', onRender);
      resolve();
    };
    map.on('render', onRender);
    onRender();
  });
}

function collectBuildingFeatures(map: MapLibreMap) {
  if (map.getZoom() < 13 || !map.getSource(BUILDING_SOURCE_ID)) return [];

  let features: ReturnType<MapLibreMap['querySourceFeatures']> = [];
  try {
    features = map.querySourceFeatures(BUILDING_SOURCE_ID, {
      sourceLayer: BUILDING_SOURCE_LAYER,
    });
  } catch {
    return [];
  }

  const buildings = features.filter((feature) => {
    const type = feature.geometry?.type;
    return type === 'Polygon' || type === 'MultiPolygon';
  });

  for (const feature of buildings) {
    const props = feature.properties ?? {};
    const height = Number(props.render_height ?? props.height ?? 0);
    props.height = height > 0 ? height : DEFAULT_BUILDING_HEIGHT_M;
    feature.properties = props;
  }

  buildings.sort((a, b) => (a.properties?.height ?? 0) - (b.properties?.height ?? 0));
  return buildings;
}

type ShadeTexture = {
  texture: WebGLTexture | null;
  update: (image: unknown, options?: unknown, position?: unknown) => void;
  bind?: (filter: number, wrap: number) => void;
  __sunshadowPatched?: boolean;
};

type CanvasLikeSource = {
  type?: string;
  canvas?: HTMLCanvasElement;
  tiles?: Record<string, { state: string }>;
  texture?: ShadeTexture;
  prepare?: () => void;
  setCoordinates?: (coordinates: number[][]) => void;
};

function patchTextureUpdate(texture: ShadeTexture): void {
  if (texture.__sunshadowPatched) return;
  const originalUpdate = texture.update.bind(texture);
  texture.update = (image: unknown, options?: unknown, position?: unknown) => {
    if (
      image &&
      typeof image === 'object' &&
      'width' in image &&
      'height' in image &&
      (image as { data?: unknown }).data === undefined
    ) {
      image = {
        width: (image as { width: number }).width,
        height: (image as { height: number }).height,
        data: null,
      };
    }
    return originalUpdate(image, options, position);
  };
  texture.__sunshadowPatched = true;
}

function makeFallbackTexture(map: MapLibreMap, canvas?: HTMLCanvasElement): ShadeTexture {
  const gl = map.painter.context.gl;
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

  const texture: ShadeTexture = {
    texture: handle,
    update(image: unknown) {
      const width =
        image && typeof image === 'object' && 'width' in image
          ? Number((image as { width: number }).width)
          : canvas?.width || 1;
      const height =
        image && typeof image === 'object' && 'height' in image
          ? Number((image as { height: number }).height)
          : canvas?.height || 1;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      const data =
        image && typeof image === 'object' && 'data' in image
          ? ((image as { data?: ArrayBufferView | null }).data ?? null)
          : image instanceof HTMLCanvasElement
            ? image
            : null;
      if (data instanceof HTMLCanvasElement) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width || 1, height || 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    },
    bind(filter: number, wrap: number) {
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    },
  };
  patchTextureUpdate(texture);
  return texture;
}

function ensureCanvasTexture(map: MapLibreMap, source: CanvasLikeSource | undefined): void {
  if (!source) return;
  if (source.texture?.update) {
    patchTextureUpdate(source.texture);
    return;
  }
  if (!map.painter?.context) return;

  try {
    source.tiles ||= {};
    if (Object.keys(source.tiles).length === 0) {
      source.tiles['0'] = { state: 'unloaded' };
    }
    source.prepare?.();
  } catch {
    // prepare can throw if the style is mid-reload
  }

  if (source.texture?.update) {
    patchTextureUpdate(source.texture);
    return;
  }
  source.texture = makeFallbackTexture(map, source.canvas);
}

function patchCanvasTextureForShadeMap(map: MapLibreMap): void {
  const originalAddSource = map.addSource.bind(map);
  const originalGetSource = map.getSource.bind(map);

  const lazyCanvasSource = (id: string): CanvasLikeSource | undefined => {
    let source = originalGetSource(id) as CanvasLikeSource | undefined;
    if (source) {
      ensureCanvasTexture(map, source);
      return source;
    }
    if (!id.startsWith('canvas-source') || !map.painter?.context) return source;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const bounds = map.getBounds();
      originalAddSource(id, {
        type: 'canvas',
        canvas,
        animate: false,
        coordinates: [
          [bounds.getWest(), bounds.getNorth()],
          [bounds.getEast(), bounds.getNorth()],
          [bounds.getEast(), bounds.getSouth()],
          [bounds.getWest(), bounds.getSouth()],
        ],
      });
    } catch {
      // style may already have this id, or is not ready
    }
    source = originalGetSource(id) as CanvasLikeSource | undefined;
    ensureCanvasTexture(map, source);
    return source;
  };

  map.getSource = ((id: string) => {
    const source = originalGetSource(id) as CanvasLikeSource | undefined;
    if (source?.canvas || source?.type === 'canvas' || String(id).startsWith('canvas-source')) {
      return lazyCanvasSource(id) ?? source;
    }
    return source;
  }) as MapLibreMap['getSource'];

  map.addSource = ((id: string, spec: Parameters<MapLibreMap['addSource']>[1]) => {
    const existing = originalGetSource(id) as CanvasLikeSource | undefined;
    if (existing && (spec as { type?: string }).type === 'canvas') {
      const canvas = (spec as { canvas?: HTMLCanvasElement }).canvas;
      if (canvas) existing.canvas = canvas;
      const coordinates = (spec as { coordinates?: number[][] }).coordinates;
      if (coordinates && typeof existing.setCoordinates === 'function') {
        existing.setCoordinates(coordinates);
      }
      ensureCanvasTexture(map, existing);
      return map;
    }
    const result = originalAddSource(id, spec);
    if ((spec as { type?: string }).type === 'canvas') {
      ensureCanvasTexture(map, originalGetSource(id) as CanvasLikeSource);
    }
    return result;
  }) as MapLibreMap['addSource'];
}

const DEFAULT_SHADEMAP_KEY =
  'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InRwcGlvdHJvd3NraUBzaGFkZW1hcC5hcHAiLCJjcmVhdGVkIjoxNjYyNDkzMDY2Nzk0LCJpYXQiOjE2NjI0OTMwNjZ9.ovCrLTYsdKFTF6TW3DuODxCaAtGQ3qhcmqj3DWcol5g';

function getShadeMapKey(): string {
  return process.env.NEXT_PUBLIC_SHADEMAP_KEY || DEFAULT_SHADEMAP_KEY;
}

export class ShadowManager {
  private map: MapLibreMap | null = null;
  private shadeMap: ShadeMap | null = null;
  private datetime = new Date();
  private timeRaf = 0;

  public initialize(map: MapLibreMap, datetime: Date): void {
    this.destroy();
    this.map = map;
    this.datetime = datetime;

    const apiKey = getShadeMapKey();
    if (!apiKey) {
      console.warn(
        '[SolariaScope] Missing NEXT_PUBLIC_SHADEMAP_KEY. Get a free localhost key at https://shademap.app/about/',
      );
      return;
    }

    if (!map.painter?.context) {
      requestAnimationFrame(() => {
        if (this.map === map) this.initialize(map, datetime);
      });
      return;
    }

    try {
      patchCanvasTextureForShadeMap(map);
      this.shadeMap = new ShadeMap({
        apiKey,
        date: datetime,
        color: SHADOW_COLOR,
        opacity: SHADOW_OPACITY,
        terrainSource: TERRARIUM_TERRAIN_SOURCE,
        getFeatures: async () => {
          await waitUntilMapLoaded(map);
          return collectBuildingFeatures(map) as never;
        },
      }).addTo(map as never);
    } catch (error) {
      console.error('[SolariaScope] ShadeMap failed to initialize:', error);
      this.shadeMap = null;
    }
  }

  public updateDateTime(date: Date): void {
    this.datetime = date;
    if (this.timeRaf) return;
    this.timeRaf = requestAnimationFrame(() => {
      this.timeRaf = 0;
      try {
        this.shadeMap?.setDate(this.datetime);
      } catch (error) {
        console.warn('[SolariaScope] Failed to update ShadeMap date:', error);
      }
    });
  }

  public destroy(): void {
    if (this.timeRaf) {
      cancelAnimationFrame(this.timeRaf);
      this.timeRaf = 0;
    }
    if (this.shadeMap) {
      try {
        this.shadeMap.remove();
      } catch {
        // map may already be removed
      }
      this.shadeMap = null;
    }
    this.map = null;
  }

  public isInitialized(): boolean {
    return this.shadeMap !== null;
  }
}
