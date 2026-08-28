import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
  type MapSourceDataEvent,
} from 'maplibre-gl';
import { getSkyLighting } from './sun-engine';
import {
  METERS_PER_FLOOR,
  OVERTURE_BUILDINGS_LAYER,
  OVERTURE_BUILDINGS_PMTILES_URL,
  OVERTURE_BUILDINGS_SOURCE_ID,
  TERRARIUM_MAXZOOM,
  TERRARIUM_SOURCE_ID,
  TERRARIUM_TILE_URL,
} from './constants';
import { buildHeightGrid, downsampleGrid, type HeightGrid } from './terrarium';
import { TERRAIN_UMBRA_ID, TerrainShadowLayer, castTerrainMask } from './terrain-shadow-layer';

const BUILDING_3D_ID = 'solaria-buildings-3d';
const UMBRA_LAYER_ID = 'solaria-umbra';
const NIGHT_WASH_SOURCE_ID = 'solaria-night-wash-source';
const NIGHT_WASH_LAYER_ID = 'solaria-night-wash';
const TERRARIUM_HILLSHADE_ID = 'solaria-terrarium-hillshade';
const MIN_SHADOW_ZOOM = 13.2;
const MIN_TERRAIN_SHADOW_ZOOM = 8;
const MAX_BUILDINGS = 500;
const MAX_SHADOW_M = 280;
const MIN_SHADOW_M = 6;
const GRID = 28;
const VIEW_PAD_DEG = 0.03;

type LngLat = [number, number];
type BuildingFootprint = { ring: LngLat[]; height: number };

function copyRing(ring: GeoJSON.Position[], centerLng: number): LngLat[] {
  const out: LngLat[] = [];
  for (const pos of ring) {
    if (typeof pos[0] !== 'number' || typeof pos[1] !== 'number') continue;
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    let lng = pos[0];
    while (lng - centerLng > 180) lng -= 360;
    while (lng - centerLng < -180) lng += 360;
    out.push([lng, pos[1]]);
  }
  return out;
}

function ringHitsView(ring: LngLat[], west: number, south: number, east: number, north: number): boolean {
  for (const [lng, lat] of ring) {
    if (lng >= west && lng <= east && lat >= south && lat <= north) return true;
  }
  return false;
}

function numberProp(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Footprint height in meters: measured height, else floors, else OpenMapTiles estimate. */
function buildingHeight(props: GeoJSON.GeoJsonProperties | null): number {
  const p = props ?? {};
  const height = numberProp(p.height);
  if (height > 1) return height;
  const floors = numberProp(p.num_floors ?? p.levels ?? p['building:levels']);
  if (floors > 0) return floors * METERS_PER_FLOOR;
  const renderHeight = numberProp(p.render_height);
  if (renderHeight > 1) return renderHeight;
  return 10;
}

function sampleBuildings(found: BuildingFootprint[]): BuildingFootprint[] {
  if (found.length <= MAX_BUILDINGS) return found;
  found.sort((a, b) => b.height - a.height);
  const picked: BuildingFootprint[] = [];
  const used = new Set<number>();
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let i = 0; i < found.length; i++) {
    const lng = found[i].ring[0][0];
    const lat = found[i].ring[0][1];
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  const spanX = Math.max(1e-8, east - west);
  const spanY = Math.max(1e-8, north - south);
  const cells = new Set<string>();

  for (let i = 0; i < found.length && picked.length < MAX_BUILDINGS; i++) {
    const [lng, lat] = found[i].ring[0];
    const key = `${((lng - west) / spanX * GRID) | 0}:${((lat - south) / spanY * GRID) | 0}`;
    if (cells.has(key)) continue;
    cells.add(key);
    used.add(i);
    picked.push(found[i]);
  }
  for (let i = 0; i < found.length && picked.length < MAX_BUILDINGS; i++) {
    if (used.has(i)) continue;
    picked.push(found[i]);
  }
  return picked;
}


// --- Gradient shadow shader: per-vertex fade attribute for smooth penumbra ---
const VERT_SRC = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
in float a_fade;
out float v_fade;
void main() {
  v_fade = a_fade;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec4 u_umbraColor;
uniform vec4 u_penumbraColor;
in float v_fade;
out vec4 fragColor;
void main() {
  float t = smoothstep(0.0, 1.0, v_fade);
  fragColor = mix(u_umbraColor, u_penumbraColor, t);
}`;

function compileProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vert = gl.createShader(gl.VERTEX_SHADER);
  const frag = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vert || !frag) return null;
  gl.shaderSource(vert, VERT_SRC);
  gl.compileShader(vert);
  gl.shaderSource(frag, FRAG_SRC);
  gl.compileShader(frag);
  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS) || !gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Triangulate shadow polygon from footprint ring + projected ring.
 * Each triangle gets per-vertex fade: 0 = footprint (umbra core), 1 = projected tip (penumbra edge).
 * Pushes interleaved [x, y, fade] directly into the output array for zero-copy performance.
 */
function pushShadowPoly(
  out: number[],
  ring: LngLat[],
  n: number,
  dLng: number,
  dLat: number,
  fadeFactor: number,
): void {
  if (n < 3) return;

  // Compute mercator offset once from a reference point, apply to all vertices.
  // This avoids calling MercatorCoordinate.fromLngLat() twice per vertex.
  const refMerc = MercatorCoordinate.fromLngLat({ lng: ring[0][0], lat: ring[0][1] });
  const refProjMerc = MercatorCoordinate.fromLngLat({ lng: ring[0][0] + dLng, lat: ring[0][1] + dLat });
  const dmx = refProjMerc.x - refMerc.x;
  const dmy = refProjMerc.y - refMerc.y;

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  fx[0] = refMerc.x;
  fy[0] = refMerc.y;
  px[0] = refProjMerc.x;
  py[0] = refProjMerc.y;
  for (let i = 1; i < n; i++) {
    const merc = MercatorCoordinate.fromLngLat({ lng: ring[i][0], lat: ring[i][1] });
    fx[i] = merc.x;
    fy[i] = merc.y;
    px[i] = merc.x + dmx;
    py[i] = merc.y + dmy;
  }

  // Wall quads: footprint edge → projected edge (2 triangles each)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(fx[i], fy[i], 0, fx[j], fy[j], 0, px[i], py[i], fadeFactor);
    out.push(fx[j], fy[j], 0, px[j], py[j], fadeFactor, px[i], py[i], fadeFactor);
  }
  // Projected cap (far end of shadow) — fan triangulation
  for (let i = 1; i < n - 1; i++) {
    out.push(px[0], py[0], fadeFactor, px[i], py[i], fadeFactor, px[i + 1], py[i + 1], fadeFactor);
  }
  // Footprint cap (building base, fully dark) — fan triangulation
  for (let i = 1; i < n - 1; i++) {
    out.push(fx[0], fy[0], 0, fx[i], fy[i], 0, fx[i + 1], fy[i + 1], 0);
  }
}

class UmbraLayer implements CustomLayerInterface {
  id = UMBRA_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '2d' as const;

  // Interleaved [x, y, fade] per vertex
  vertices: ArrayBufferView = new Float32Array(0);
  vertexCount = 0;
  umbraColor: [number, number, number, number] = [0, 0, 0, 0];
  penumbraColor: [number, number, number, number] = [0, 0, 0, 0];
  private dirty = false;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private aPos = 0;
  private aFade = 0;
  private uMatrix: WebGLUniformLocation | null = null;
  private uUmbraColor: WebGLUniformLocation | null = null;
  private uPenumbraColor: WebGLUniformLocation | null = null;
  private matrix32 = new Float32Array(16);

  setGeometry(
    verts: Float32Array,
    penumbraColor: [number, number, number, number],
    umbraColor: [number, number, number, number],
  ): void {
    this.vertices = verts;
    this.vertexCount = verts.length / 3; // stride = 3 (x, y, fade)
    this.penumbraColor = penumbraColor;
    this.umbraColor = umbraColor;
    this.dirty = true;
  }

  onAdd(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.program = compileProgram(gl);
    if (!this.program) return;
    this.aPos = gl.getAttribLocation(this.program, 'a_pos');
    this.aFade = gl.getAttribLocation(this.program, 'a_fade');
    this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    this.uUmbraColor = gl.getUniformLocation(this.program, 'u_umbraColor');
    this.uPenumbraColor = gl.getUniformLocation(this.program, 'u_penumbraColor');
    this.buffer = gl.createBuffer();
    this.dirty = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.buffer = null;
    this.program = null;
    this.gl = null;
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.program || !this.buffer || this.vertexCount < 3) return;
    if (this.umbraColor[3] <= 0.01 && this.penumbraColor[3] <= 0.01) return;

    if (this.dirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.DYNAMIC_DRAW);
      this.dirty = false;
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    // Stride = 12 bytes (3 floats × 4 bytes)
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(this.aFade);
    gl.vertexAttribPointer(this.aFade, 1, gl.FLOAT, false, 12, 8);
    this.matrix32.set(options.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>);
    gl.uniformMatrix4fv(this.uMatrix, false, this.matrix32);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniform4f(
      this.uUmbraColor,
      this.umbraColor[0], this.umbraColor[1], this.umbraColor[2], this.umbraColor[3],
    );
    gl.uniform4f(
      this.uPenumbraColor,
      this.penumbraColor[0], this.penumbraColor[1], this.penumbraColor[2], this.penumbraColor[3],
    );
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aFade);
  }
}

export class ShadowManager {
  private map: MapLibreMap | null = null;
  private datetime = new Date();
  private ready = false;
  private needsRefresh = false;
  private buildings: BuildingFootprint[] = [];
  private buildingSource = '';
  private buildingSourceLayer = 'building';
  private fallbackBuildingSource = '';
  private fallbackBuildingSourceLayer = 'building';
  private buildingLayerIds: string[] = [];
  private overtureLayerNames = [OVERTURE_BUILDINGS_LAYER, 'buildings'];
  private umbra = new UmbraLayer();
  private terrainUmbra = new TerrainShadowLayer();
  private demGrid: HeightGrid | null = null;
  private demKey = '';
  private terrainGen = 0;
  private terrainDebounce = 0;

  public initialize(map: MapLibreMap, datetime: Date): void {
    this.destroy();
    this.map = map;
    this.datetime = datetime;
    if (map.isStyleLoaded()) this.onStyleReady();
    else map.once('load', () => this.onStyleReady());
  }

  private onStyleReady(): void {
    if (!this.map) return;
    this.ready = true;
    this.resolveBuildingSource();
    this.setupOvertureBuildings();
    this.setupTerrarium();
    this.setupBuildings3D();
    this.setupUmbraLayer();
    this.setupTerrainUmbraLayer();
    this.setupNightWash();
    this.map.on('moveend', this.markDirty);
    this.map.on('zoomend', this.markDirty);
    this.map.on('resize', this.markDirty);
    this.map.on('sourcedata', this.onSourceData);
    this.map.on('idle', this.scheduleIdle);
    this.updateLighting();
    this.needsRefresh = true;
  }

  private markDirty = () => {
    this.needsRefresh = true;
  };

  private onSourceData = (event: MapSourceDataEvent) => {
    if (!this.ready || !event.isSourceLoaded) return;
    if (
      event.sourceId !== this.buildingSource &&
      event.sourceId !== this.fallbackBuildingSource
    ) {
      return;
    }
    this.needsRefresh = true;
    this.scheduleIdle();
  };

  /** Batch rapid idle/moveend events into a single rebuild via rAF */
  private idleRaf = 0;
  private scheduleIdle = () => {
    if (this.idleRaf) return;
    this.idleRaf = requestAnimationFrame(() => {
      this.idleRaf = 0;
      this.onIdle();
    });
  };

  private onIdle = () => {
    if (!this.ready || !this.needsRefresh) return;
    this.needsRefresh = false;
    this.refreshBuildings();
    this.rebuildUmbra();
    this.updateLighting();
    void this.rebuildTerrainUmbra();
    this.map?.triggerRepaint();
  };

  private resolveBuildingSource(): void {
    const map = this.map;
    if (!map) return;
    const layers = map.getStyle().layers ?? [];
    this.buildingLayerIds = layers
      .filter(
        (layer) =>
          layer.id !== UMBRA_LAYER_ID &&
          (layer.type === 'fill-extrusion' || (layer.type === 'fill' && /building/i.test(layer.id))),
      )
      .map((layer) => layer.id);
    const match =
      layers.find((layer) => layer.type === 'fill-extrusion' && layer.id !== BUILDING_3D_ID) ??
      layers.find((layer) => layer.type === 'fill' && /building/i.test(layer.id));
    if (match && 'source' in match && typeof match.source === 'string') {
      this.fallbackBuildingSource = match.source;
      this.fallbackBuildingSourceLayer =
        'source-layer' in match && typeof match['source-layer'] === 'string'
          ? match['source-layer']
          : 'building';
    }
    this.buildingSource = this.fallbackBuildingSource;
    this.buildingSourceLayer = this.fallbackBuildingSourceLayer;
  }

  private setupOvertureBuildings(): void {
    const map = this.map;
    if (!map || map.getSource(OVERTURE_BUILDINGS_SOURCE_ID)) return;
    try {
      map.addSource(OVERTURE_BUILDINGS_SOURCE_ID, {
        type: 'vector',
        url: OVERTURE_BUILDINGS_PMTILES_URL,
        minzoom: 12,
        maxzoom: 15,
      });
    } catch {
      // keep MapTiler buildings visible
    }
  }

  private setupTerrarium(): void {
    const map = this.map;
    if (!map) return;
    try {
      if (!map.getSource(TERRARIUM_SOURCE_ID)) {
        map.addSource(TERRARIUM_SOURCE_ID, {
          type: 'raster-dem',
          tiles: [TERRARIUM_TILE_URL],
          tileSize: 256,
          encoding: 'terrarium',
          maxzoom: TERRARIUM_MAXZOOM,
          minzoom: 1,
        });
      }
      if (!map.getLayer(TERRARIUM_HILLSHADE_ID)) {
        const beforeId = map.getLayer('Hillshade')
          ? 'Hillshade'
          : (map.getStyle().layers ?? []).find((layer) => layer.type === 'hillshade')?.id;
        const layer = {
          id: TERRARIUM_HILLSHADE_ID,
          type: 'hillshade' as const,
          source: TERRARIUM_SOURCE_ID,
          maxzoom: 18,
          paint: {
            'hillshade-method': 'combined',
            'hillshade-illumination-anchor': 'map',
            'hillshade-exaggeration': 0.55,
            'hillshade-shadow-color': '#010d24',
            'hillshade-highlight-color': '#f8f3ec',
            'hillshade-accent-color': '#6e685e',
          },
        };
        if (beforeId) map.addLayer(layer as never, beforeId);
        else map.addLayer(layer as never);
      }
      if (map.getLayer('Hillshade')) {
        map.setLayoutProperty('Hillshade', 'visibility', 'none');
      }
      map.setTerrain({ source: TERRARIUM_SOURCE_ID, exaggeration: 1.18 });
    } catch {
      // DEM source failed
    }
  }

  private setupTerrainUmbraLayer(): void {
    const map = this.map;
    if (!map || map.getLayer(TERRAIN_UMBRA_ID)) return;
    const beforeId = map.getLayer(UMBRA_LAYER_ID)
      ? UMBRA_LAYER_ID
      : map.getLayer(BUILDING_3D_ID)
        ? BUILDING_3D_ID
        : (map.getStyle().layers ?? []).find((layer) => layer.type === 'symbol')?.id;
    try {
      if (beforeId) map.addLayer(this.terrainUmbra, beforeId);
      else map.addLayer(this.terrainUmbra);
    } catch {
      // gl layer failed
    }
  }

  private setupBuildings3D(): void {
    const map = this.map;
    const source = this.fallbackBuildingSource || this.buildingSource;
    const sourceLayer = this.fallbackBuildingSourceLayer || this.buildingSourceLayer;
    if (!map || !source || map.getLayer(BUILDING_3D_ID)) return;
    const beforeId = (map.getStyle().layers ?? []).find((layer) => layer.type === 'symbol')?.id;
    const layer = {
      id: BUILDING_3D_ID,
      type: 'fill-extrusion' as const,
      source,
      'source-layer': sourceLayer,
      minzoom: 13,
      paint: {
        // Height-based color: taller buildings get slightly lighter shade for depth
        'fill-extrusion-color': [
          'interpolate', ['linear'],
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          0, '#b8b2aa',
          15, '#c4bdb5',
          40, '#d0c9c0',
          100, '#dbd4cb',
        ],
        'fill-extrusion-height': [
          'max',
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
          8,
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    };
    try {
      if (beforeId) map.addLayer(layer as never, beforeId);
      else map.addLayer(layer as never);
      if (map.getLayer('Building')) map.setLayoutProperty('Building', 'visibility', 'none');
    } catch {
      if (map.getLayer('Building')) map.setLayoutProperty('Building', 'visibility', 'visible');
    }
  }

  private setupNightWash(): void {
    const map = this.map;
    if (!map || map.getSource(NIGHT_WASH_SOURCE_ID)) return;
    try {
      map.addSource(NIGHT_WASH_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-179.5, -85],
              [179.5, -85],
              [179.5, 85],
              [-179.5, 85],
              [-179.5, -85],
            ]],
          },
        },
      });
      const beforeId = (map.getStyle().layers ?? []).find((layer) => layer.type === 'symbol')?.id;
      const layer = {
        id: NIGHT_WASH_LAYER_ID,
        type: 'fill' as const,
        source: NIGHT_WASH_SOURCE_ID,
        paint: {
          'fill-color': '#0b1a2e',
          'fill-opacity': 0,
          'fill-opacity-transition': { duration: 380 },
          'fill-color-transition': { duration: 380 },
          'fill-antialias': false,
        },
      };
      if (beforeId) map.addLayer(layer as never, beforeId);
      else map.addLayer(layer as never);
    } catch {
      // ignore
    }
  }

  private setupUmbraLayer(): void {
    const map = this.map;
    if (!map || map.getLayer(UMBRA_LAYER_ID)) return;
    const beforeId = map.getLayer(BUILDING_3D_ID)
      ? BUILDING_3D_ID
      : (map.getStyle().layers ?? []).find((layer) => layer.type === 'symbol')?.id;
    try {
      if (beforeId) map.addLayer(this.umbra, beforeId);
      else map.addLayer(this.umbra);
    } catch {
      // gl layer failed
    }
  }

  private refreshBuildings(): void {
    const map = this.map;
    if (!map || !this.ready) return;
    if (map.getZoom() < MIN_SHADOW_ZOOM) {
      this.buildings = [];
      return;
    }

    if (!this.buildingSource) this.resolveBuildingSource();

    const queryLayers = (sourceId: string, layerNames: string[]) => {
      if (!sourceId) return [] as ReturnType<MapLibreMap['querySourceFeatures']>;
      for (const layerName of layerNames) {
        try {
          const next = map.querySourceFeatures(sourceId, { sourceLayer: layerName });
          if (next.length) return next;
        } catch {
          // missing source-layer
        }
      }
      return [];
    };

    let features = queryLayers(this.fallbackBuildingSource || this.buildingSource, [
      this.fallbackBuildingSourceLayer,
      this.buildingSourceLayer,
      'building',
    ]);

    if (!features.length) {
      const renderLayers = [...this.buildingLayerIds, BUILDING_3D_ID].filter((id) => map.getLayer(id));
      if (renderLayers.length) {
        try {
          features = map.queryRenderedFeatures({ layers: renderLayers });
        } catch {
          features = [];
        }
      }
    }

    const overtureFeatures = queryLayers(
      OVERTURE_BUILDINGS_SOURCE_ID,
      this.overtureLayerNames,
    );

    const bounds = map.getBounds();
    const west = bounds.getWest() - VIEW_PAD_DEG;
    const south = bounds.getSouth() - VIEW_PAD_DEG;
    const east = bounds.getEast() + VIEW_PAD_DEG;
    const north = bounds.getNorth() + VIEW_PAD_DEG;
    const centerLng = map.getCenter().lng;
    const seen = new Map<string, number>(); // key → index in found[]
    const found: BuildingFootprint[] = [];

    const ingest = (list: ReturnType<MapLibreMap['querySourceFeatures']>) => {
      for (const feature of list) {
        const geometry = feature.geometry;
        if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;
        const height = buildingHeight(feature.properties);
        const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
        for (const poly of polys) {
          const ring = copyRing(poly[0] ?? [], centerLng);
          if (ring.length < 3) continue;
          if (!ringHitsView(ring, west, south, east, north)) continue;
          // Use integer-rounded key to avoid expensive toFixed()
          const kx = (ring[0][0] * 1e5) | 0;
          const ky = (ring[0][1] * 1e5) | 0;
          const key = `${kx},${ky}`;
          const existingIdx = seen.get(key);
          if (existingIdx !== undefined) {
            // O(1) update via index instead of O(n) find()
            if (height > found[existingIdx].height) found[existingIdx].height = height;
            continue;
          }
          seen.set(key, found.length);
          found.push({ ring, height });
        }
      }
    };

    ingest(features);
    ingest(overtureFeatures);

    if (found.length === 0 && this.buildings.length > 0) return;
    this.buildings = sampleBuildings(found);
  }

  private rebuildUmbra(): void {
    const map = this.map;
    if (!map) return;

    const center = map.getCenter();
    const sky = getSkyLighting(this.datetime, center.lat, center.lng);
    const { cast } = sky;
    if (cast.kind === 'none' || cast.strength < 0.04 || map.getZoom() < MIN_SHADOW_ZOOM || this.buildings.length === 0) {
      this.umbra.setGeometry(new Float32Array(0), [0, 0, 0, 0], [0, 0, 0, 0]);
      return;
    }

    const altitudeRad = (Math.max(3.6, cast.altitudeDeg) * Math.PI) / 180;
    const toward = ((cast.compassAzimuthDeg + 180) * Math.PI) / 180;
    const east = Math.sin(toward);
    const north = Math.cos(toward);
    const metersPerDegLat = 110540;
    const metersPerDegLng = 111320 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
    const lengthRatio = 1 / Math.tan(altitudeRad);
    const lowSun = 1 - Math.min(1, Math.max(0, cast.altitudeDeg) / 58);
    // Stronger shadow alpha for more visible shadows
    const alpha = (cast.kind === 'moon' ? 0.18 + 0.18 * lowSun : 0.34 + 0.30 * lowSun) * cast.strength;
    // Penumbra is more transparent at the edges
    const penumbraAlpha = alpha * 0.28;
    // Estimate vertex count: ~(4n - 4) triangles per building × 3 verts × 3 floats
    const estimatedFloats = this.buildings.length * 8 * 4 * 3 * 3;
    const allVerts: number[] = new Array(Math.min(estimatedFloats, 600000));
    allVerts.length = 0; // pre-allocate backing store, reset length

    for (const building of this.buildings) {
      const lengthM = Math.min(building.height * lengthRatio, MAX_SHADOW_M);
      if (lengthM < MIN_SHADOW_M) continue;
      const dLng = (lengthM * east) / metersPerDegLng;
      const dLat = (lengthM * north) / metersPerDegLat;

      // Determine open ring length without creating a copy
      const ring = building.ring;
      const last = ring.length - 1;
      const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
      const n = closed ? last : ring.length;
      if (n < 3) continue;

      // Push shadow geometry directly into the shared buffer
      pushShadowPoly(allVerts, ring, n, dLng, dLat, 1.0);
    }

    const rgb = cast.rgb;
    this.umbra.setGeometry(
      new Float32Array(allVerts),
      [rgb[0] * penumbraAlpha, rgb[1] * penumbraAlpha, rgb[2] * penumbraAlpha, penumbraAlpha],
      [rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha],
    );
  }

  public updateDateTime(date: Date): void {
    this.datetime = date;
    this.rebuildUmbra();
    this.updateLighting();
    this.map?.triggerRepaint();
    // Debounce terrain shadow — it's expensive and fine to lag 150ms behind the slider
    if (this.terrainDebounce) cancelAnimationFrame(this.terrainDebounce);
    this.terrainDebounce = requestAnimationFrame(() => {
      this.terrainDebounce = 0;
      void this.rebuildTerrainUmbra(true);
    });
  }

  private async rebuildTerrainUmbra(reuseGrid = false): Promise<void> {
    const map = this.map;
    if (!map || !this.ready) return;
    const gen = ++this.terrainGen;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const sky = getSkyLighting(this.datetime, center.lat, center.lng);

    if (sky.cast.kind === 'none' || sky.cast.strength < 0.05 || zoom < MIN_TERRAIN_SHADOW_ZOOM) {
      this.terrainUmbra.clear();
      map.triggerRepaint();
      return;
    }

    const bounds = map.getBounds();
    const pad = 0.08;
    const west = bounds.getWest() - pad;
    const south = bounds.getSouth() - pad;
    const east = bounds.getEast() + pad;
    const north = bounds.getNorth() + pad;
    const demZoom = Math.min(12, Math.max(8, Math.floor(zoom) - 1));
    const key = `${demZoom}:${west.toFixed(3)}:${south.toFixed(3)}:${east.toFixed(3)}:${north.toFixed(3)}`;

    if (!reuseGrid || !this.demGrid || this.demKey !== key) {
      const raw = await buildHeightGrid(west, south, east, north, demZoom);
      if (gen !== this.terrainGen) return;
      this.demGrid = raw ? downsampleGrid(raw, 300) : null;
      this.demKey = key;
    }

    const grid = this.demGrid;
    if (!grid || grid.max - grid.min < 28) {
      this.terrainUmbra.clear();
      map.triggerRepaint();
      return;
    }

    const mask = castTerrainMask(grid, sky.cast.compassAzimuthDeg, sky.cast.altitudeDeg);
    if (gen !== this.terrainGen) return;
    const lowSun = 1 - Math.min(1, Math.max(0, sky.cast.altitudeDeg) / 55);
    // Strong terrain shadow for crisp, visible mountain shadows
    const alpha = (sky.cast.kind === 'moon' ? 0.26 : 0.55) * (0.45 + 0.55 * lowSun) * sky.cast.strength;
    const rgb = sky.cast.rgb;
    this.terrainUmbra.setMask(
      mask,
      grid.cols,
      grid.rows,
      { west: grid.west, south: grid.south, east: grid.east, north: grid.north },
      [rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha],
    );
    map.triggerRepaint();
  }

  private updateLighting(): void {
    const map = this.map;
    if (!map || !this.ready) return;
    const center = map.getCenter();
    const sky = getSkyLighting(this.datetime, center.lat, center.lng);
    this.updateHillshade(sky);
    this.updateBuildingLight(sky);
    this.updateNightWash(sky);
    this.updateBuildingColor(sky);
  }

  private updateNightWash(sky: ReturnType<typeof getSkyLighting>): void {
    const map = this.map;
    if (!map || !map.getLayer(NIGHT_WASH_LAYER_ID)) return;
    const warm = sky.period === 'goldenHour' || sky.period === 'twilight';
    try {
      map.setPaintProperty(NIGHT_WASH_LAYER_ID, 'fill-color', warm ? '#2a1810' : '#0b1a2e');
      map.setPaintProperty(NIGHT_WASH_LAYER_ID, 'fill-opacity', Math.min(0.28, sky.nightAmount * 0.34));
    } catch {
      // ignore
    }
  }

  private updateBuildingColor(sky: ReturnType<typeof getSkyLighting>): void {
    const map = this.map;
    if (!map) return;
    const color =
      sky.period === 'night' || sky.period === 'moonlight' ? '#8b919c'
      : sky.period === 'twilight' || sky.period === 'goldenHour' ? '#c4b4a4'
      : '#d0cbc4';
    for (const id of [BUILDING_3D_ID, `${BUILDING_3D_ID}-alt`]) {
      if (!map.getLayer(id)) continue;
      try {
        map.setPaintProperty(id, 'fill-extrusion-color', color);
      } catch {
        // ignore
      }
    }
  }

  private updateBuildingLight(sky: ReturnType<typeof getSkyLighting>): void {
    const map = this.map;
    if (!map) return;
    const { period, cast, sun } = sky;
    const azimuth = cast.kind === 'none' ? sun.compassAzimuthDeg : cast.compassAzimuthDeg;
    const altitude = cast.kind === 'none' ? 18 : Math.max(4, cast.altitudeDeg);
    const color =
      period === 'moonlight' ? '#8aa4c8'
      : period === 'night' ? '#2a3447'
      : period === 'twilight' || period === 'goldenHour' ? '#fed7aa'
      : '#ffffff';
    // Higher light intensity for stronger contrast between lit and shadowed faces
    const intensity =
      period === 'night' ? 0.08
      : period === 'moonlight' ? 0.15
      : period === 'twilight' ? 0.22
      : Math.min(0.72, 0.28 + (Math.max(0, sun.altitudeDeg) / 90) * 0.44);
    try {
      map.setLight({
        anchor: 'map',
        color,
        intensity,
        position: [1.4, azimuth, altitude],
      });
    } catch {
      // classic light may be absent
    }
  }

  private updateHillshade(sky: ReturnType<typeof getSkyLighting>): void {
    const map = this.map;
    if (!map) return;
    const azimuth = sky.cast.kind === 'none' ? 335 : sky.cast.compassAzimuthDeg;
    const altitude = sky.cast.kind === 'none' ? 45 : Math.max(8, sky.cast.altitudeDeg);
    // Higher exaggeration for more visible terrain relief
    const exaggeration =
      sky.period === 'night' ? 0.10
      : sky.period === 'moonlight' ? 0.18
      : sky.period === 'twilight' ? 0.28
      : 0.38 + 0.47 * (1 - Math.min(1, Math.max(0, sky.sun.altitudeDeg) / 70));
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== 'hillshade') continue;
      if (layer.id === 'Hillshade') continue;
      try {
        map.setPaintProperty(layer.id, 'hillshade-method', 'combined');
        map.setPaintProperty(layer.id, 'hillshade-illumination-anchor', 'map');
        map.setPaintProperty(layer.id, 'hillshade-illumination-direction', [azimuth]);
        map.setPaintProperty(layer.id, 'hillshade-illumination-altitude', [altitude]);
        map.setPaintProperty(layer.id, 'hillshade-exaggeration', exaggeration);
        map.setPaintProperty(layer.id, 'hillshade-shadow-color', '#010d24');
        map.setPaintProperty(layer.id, 'hillshade-highlight-color', '#f8f3ec');
        map.setPaintProperty(layer.id, 'hillshade-accent-color', '#6e685e');
      } catch {
        try {
          map.setPaintProperty(layer.id, 'hillshade-illumination-direction', azimuth);
          map.setPaintProperty(layer.id, 'hillshade-exaggeration', exaggeration);
        } catch {
          // ignore
        }
      }
    }
  }

  public destroy(): void {
    if (this.idleRaf) {
      cancelAnimationFrame(this.idleRaf);
      this.idleRaf = 0;
    }
    if (this.terrainDebounce) {
      cancelAnimationFrame(this.terrainDebounce);
      this.terrainDebounce = 0;
    }
    if (this.map) {
      this.map.off('moveend', this.markDirty);
      this.map.off('zoomend', this.markDirty);
      this.map.off('resize', this.markDirty);
      this.map.off('sourcedata', this.onSourceData);
      this.map.off('idle', this.scheduleIdle);
      try {
        this.map.setTerrain(null);
        if (this.map.getLayer(TERRAIN_UMBRA_ID)) this.map.removeLayer(TERRAIN_UMBRA_ID);
        if (this.map.getLayer(UMBRA_LAYER_ID)) this.map.removeLayer(UMBRA_LAYER_ID);
        if (this.map.getLayer(NIGHT_WASH_LAYER_ID)) this.map.removeLayer(NIGHT_WASH_LAYER_ID);
        if (this.map.getSource(NIGHT_WASH_SOURCE_ID)) this.map.removeSource(NIGHT_WASH_SOURCE_ID);
        if (this.map.getLayer(TERRARIUM_HILLSHADE_ID)) this.map.removeLayer(TERRARIUM_HILLSHADE_ID);
        if (this.map.getLayer(`${BUILDING_3D_ID}-alt`)) this.map.removeLayer(`${BUILDING_3D_ID}-alt`);
        if (this.map.getLayer(BUILDING_3D_ID)) this.map.removeLayer(BUILDING_3D_ID);
        if (this.map.getSource(OVERTURE_BUILDINGS_SOURCE_ID)) this.map.removeSource(OVERTURE_BUILDINGS_SOURCE_ID);
        if (this.map.getSource(TERRARIUM_SOURCE_ID)) this.map.removeSource(TERRARIUM_SOURCE_ID);
        if (this.map.getLayer('Hillshade')) this.map.setLayoutProperty('Hillshade', 'visibility', 'visible');
        if (this.map.getLayer('Building')) this.map.setLayoutProperty('Building', 'visibility', 'visible');
      } catch {
        // map already gone
      }
    }
    this.map = null;
    this.buildings = [];
    this.ready = false;
    this.needsRefresh = false;
    this.buildingSource = '';
    this.fallbackBuildingSource = '';
    this.buildingLayerIds = [];
    this.umbra = new UmbraLayer();
    this.terrainUmbra = new TerrainShadowLayer();
    this.demGrid = null;
    this.demKey = '';
    this.terrainGen += 1;
  }
}
