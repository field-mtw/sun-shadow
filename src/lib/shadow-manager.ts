import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { getSunPosition } from './sun-engine';

const SHADOW_SOURCE_ID = 'solaria-building-shadows-source';
const SHADOW_LAYER_ID = 'solaria-building-shadows-layer';

export class ShadowManager {
  private map: MapLibreMap | null = null;
  private datetime: Date = new Date();
  private rafId = 0;
  private isMapLoaded = false;
  private boundMoveHandler = () => this.scheduleUpdate();

  public initialize(map: MapLibreMap, datetime: Date): void {
    this.destroy();
    this.map = map;
    this.datetime = datetime;

    if (map.loaded()) {
      this.onMapReady();
    } else {
      map.once('load', () => this.onMapReady());
    }
  }

  private onMapReady(): void {
    if (!this.map) return;
    this.isMapLoaded = true;
    this.setupShadowLayer();
    this.map.on('move', this.boundMoveHandler);
    this.map.on('zoom', this.boundMoveHandler);
    this.map.on('idle', this.boundMoveHandler);
    this.update();
  }

  private setupShadowLayer(): void {
    const map = this.map;
    if (!map) return;

    if (!map.getSource(SHADOW_SOURCE_ID)) {
      map.addSource(SHADOW_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer(SHADOW_LAYER_ID)) {
      // Find first building/extrusion or symbol layer to place shadows beneath buildings
      const layers = map.getStyle().layers || [];
      let beforeLayerId: string | undefined;

      for (const layer of layers) {
        if (layer.type === 'fill-extrusion' || (layer.type === 'fill' && layer.id.includes('building'))) {
          beforeLayerId = layer.id;
          break;
        }
      }

      map.addLayer(
        {
          id: SHADOW_LAYER_ID,
          type: 'fill',
          source: SHADOW_SOURCE_ID,
          paint: {
            'fill-color': '#010c22',
            'fill-opacity': 0.45,
            'fill-antialias': true,
          },
        },
        beforeLayerId,
      );
    }
  }

  public updateDateTime(date: Date): void {
    this.datetime = date;
    this.scheduleUpdate();
  }

  private scheduleUpdate(): void {
    if (!this.isMapLoaded || !this.map) return;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.update();
    });
  }

  private update(): void {
    const map = this.map;
    if (!map || !this.isMapLoaded) return;

    const center = map.getCenter();
    const sunPos = getSunPosition(this.datetime, center.lat, center.lng);
    const altitude = sunPos.altitude;
    const isNight = altitude <= 0.01;

    // 1. Update Directional 3D Light
    this.updateMapLighting(sunPos.compassAzimuthDeg, sunPos.altitudeDeg, isNight);

    // 2. Update Terrain Hillshade Direction
    this.updateHillshade(sunPos.compassAzimuthDeg, isNight);

    // 3. Update Building Shadow Polygons
    this.updateBuildingShadows(center.lat, sunPos.azimuth, altitude, isNight);
  }

  private updateMapLighting(azimuthDeg: number, altitudeDeg: number, isNight: boolean): void {
    const map = this.map;
    if (!map) return;

    try {
      map.setLight({
        anchor: 'map',
        color: isNight ? '#2a3447' : altitudeDeg < 12 ? '#fed7aa' : '#ffffff',
        intensity: isNight ? 0.08 : Math.min(0.7, 0.25 + (Math.max(0, altitudeDeg) / 90) * 0.45),
        position: [1.5, azimuthDeg, Math.max(0, 90 - altitudeDeg)],
      });
    } catch {
      // Light might not be supported in some basic styles
    }
  }

  private updateHillshade(azimuthDeg: number, isNight: boolean): void {
    const map = this.map;
    if (!map) return;

    try {
      const layers = map.getStyle().layers || [];
      for (const layer of layers) {
        if (layer.type === 'hillshade') {
          map.setPaintProperty(layer.id, 'hillshade-illumination-direction', azimuthDeg);
          map.setPaintProperty(layer.id, 'hillshade-exaggeration', isNight ? 0.08 : 0.55);
          map.setPaintProperty(layer.id, 'hillshade-shadow-color', '#020e24');
        }
      }
    } catch {
      // Hillshade layers may vary by style
    }
  }

  private updateBuildingShadows(
    centerLat: number,
    sunAzimuthRad: number,
    sunAltitudeRad: number,
    isNight: boolean,
  ): void {
    const map = this.map;
    if (!map) return;

    const source = map.getSource(SHADOW_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (isNight) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Set shadow opacity based on sun altitude (crisp at day, softer at low angles)
    const opacity = Math.min(0.52, Math.max(0.12, Math.sin(sunAltitudeRad) * 0.55));
    map.setPaintProperty(SHADOW_LAYER_ID, 'fill-opacity', opacity);

    // Minimum altitude to prevent infinite shadow length on horizon
    const effectiveAltitude = Math.max(0.06, sunAltitudeRad);
    const shadowDistRatio = 1 / Math.tan(effectiveAltitude);

    // Shadow extends in opposite direction of sun (azimuth + PI)
    const shadowDir = sunAzimuthRad + Math.PI;
    const latRad = (centerLat * Math.PI) / 180;
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(latRad);

    const sinDir = Math.sin(shadowDir);
    const cosDir = Math.cos(shadowDir);

    // Query visible building features in the viewport
    let features: GeoJSON.Feature[] = [];
    try {
      const rendered = map.queryRenderedFeatures({
        filter: ['any', ['has', 'height'], ['has', 'render_height'], ['has', 'building']],
      });

      const shadowFeatures: GeoJSON.Feature[] = [];
      const seen = new Set<string | number>();

      for (const f of rendered) {
        if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
          continue;
        }

        const id = f.id ?? (f.properties?.name || JSON.stringify(f.geometry.coordinates[0]?.[0]));
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);

        const props = f.properties || {};
        const heightMeters: number =
          Number(props.render_height || props.height || (props.levels ? Number(props.levels) * 3.2 : 8)) || 8;

        const maxCast = Math.min(heightMeters * shadowDistRatio, 600); // clamp max shadow length
        const dLng = (maxCast * sinDir) / metersPerDegreeLng;
        const dLat = (maxCast * cosDir) / metersPerDegreeLat;

        if (f.geometry.type === 'Polygon') {
          const shadowPolys = this.projectPolygonShadow(f.geometry.coordinates, dLng, dLat);
          for (const poly of shadowPolys) {
            shadowFeatures.push({
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: poly },
            });
          }
        } else if (f.geometry.type === 'MultiPolygon') {
          for (const polyCoords of f.geometry.coordinates) {
            const shadowPolys = this.projectPolygonShadow(polyCoords, dLng, dLat);
            for (const poly of shadowPolys) {
              shadowFeatures.push({
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: poly },
              });
            }
          }
        }
      }

      features = shadowFeatures;
    } catch {
      features = [];
    }

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }

  private projectPolygonShadow(
    rings: GeoJSON.Position[][],
    dLng: number,
    dLat: number,
  ): GeoJSON.Position[][][] {
    const exterior = rings[0];
    if (!exterior || exterior.length < 3) return [];

    const polygons: GeoJSON.Position[][][] = [];

    // 1. Projected Roof Polygon
    const roofRing: GeoJSON.Position[] = exterior.map(([lng, lat]) => [lng + dLng, lat + dLat]);
    polygons.push([roofRing]);

    // 2. Wall Shadow Quads connecting base to roof
    for (let i = 0; i < exterior.length - 1; i++) {
      const p1 = exterior[i];
      const p2 = exterior[i + 1];
      const p1Top: GeoJSON.Position = [p1[0] + dLng, p1[1] + dLat];
      const p2Top: GeoJSON.Position = [p2[0] + dLng, p2[1] + dLat];

      polygons.push([[p1, p2, p2Top, p1Top, p1]]);
    }

    return polygons;
  }

  public destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.map) {
      this.map.off('move', this.boundMoveHandler);
      this.map.off('zoom', this.boundMoveHandler);
      this.map.off('idle', this.boundMoveHandler);
      try {
        if (this.map.getLayer(SHADOW_LAYER_ID)) {
          this.map.removeLayer(SHADOW_LAYER_ID);
        }
        if (this.map.getSource(SHADOW_SOURCE_ID)) {
          this.map.removeSource(SHADOW_SOURCE_ID);
        }
      } catch {
        // Map may already be unmounting
      }
    }
    this.map = null;
    this.isMapLoaded = false;
  }
}
