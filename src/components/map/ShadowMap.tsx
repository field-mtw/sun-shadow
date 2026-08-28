'use client';

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Map, NavigationControl, GeolocateControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  getMapTilerStyleUrl,
} from '@/lib/constants';
import { ShadowManager } from '@/lib/shadow-manager';
import { combineDateAndTime } from '@/lib/sun-engine';
import { FullscreenControl } from '@/components/map/MapControls';

if (typeof window !== 'undefined') {
  // MapLibre v6 ships an ESM worker that imports maplibre-gl-shared.mjs by
  // relative path. Next.js/Turbopack cannot emit that sibling, so both files
  // are copied to /public/maplibre and loaded from there.
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

interface ShadowMapProps {
  date: Date;
  time: Date;
  onMapReady: () => void;
  onLocationChange?: (location: { lat: number; lng: number }) => void;
  enterLabel?: string;
  exitLabel?: string;
  mapLocale?: Record<string, string>;
}

export interface ShadowMapRef {
  getCanvas: () => HTMLCanvasElement | null;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  getBearing: () => number;
  getZoom: () => number;
  project: (lng: number, lat: number) => { x: number; y: number } | null;
  getBounds: () => { west: number; south: number; east: number; north: number } | null;
  subscribeView: (cb: () => void) => () => void;
}

const ShadowMap = forwardRef<ShadowMapRef, ShadowMapProps>(({ date, time, onMapReady, onLocationChange, enterLabel, exitLabel, mapLocale }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const shadowManagerRef = useRef<ShadowManager | null>(null);
  const initializedRef = useRef(false);
  const datetimeRef = useRef(combineDateAndTime(date, time));
  const onLocationChangeRef = useRef(onLocationChange);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => mapRef.current?.getCanvas() || null,
    flyTo: (lng: number, lat: number, zoom: number = DEFAULT_ZOOM) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
    },
    getBearing: () => mapRef.current?.getBearing() ?? 0,
    getZoom: () => mapRef.current?.getZoom() ?? 0,
    project: (lng: number, lat: number) => {
      const point = mapRef.current?.project([lng, lat]);
      return point ? { x: point.x, y: point.y } : null;
    },
    getBounds: () => {
      const bounds = mapRef.current?.getBounds();
      if (!bounds) return null;
      return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };
    },
    subscribeView: (cb: () => void) => {
      const map = mapRef.current;
      if (!map) return () => {};
      map.on('move', cb);
      map.on('resize', cb);
      return () => {
        map.off('move', cb);
        map.off('resize', cb);
      };
    },
  }));

  useEffect(() => {
    if (!mapContainer.current || initializedRef.current) return;
    initializedRef.current = true;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
    const shadowManager = new ShadowManager();
    shadowManagerRef.current = shadowManager;

    const map = new Map({
      container: mapContainer.current,
      style: getMapTilerStyleUrl(MAPTILER_KEY, 'outdoor-v2'),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      locale: mapLocale,
    });

    mapRef.current = map;

    map.addControl(new NavigationControl(), 'top-right');
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    );
    if (typeof document !== 'undefined' && document.fullscreenEnabled && enterLabel && exitLabel) {
      map.addControl(new FullscreenControl({ enterLabel, exitLabel }), 'top-right');
    }

    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        map.resize();
      });
    });
    resizeObserver.observe(mapContainer.current);

    map.on('load', () => {
      map.resize();
      shadowManager.initialize(map, datetimeRef.current);
      onMapReady();
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      onLocationChangeRef.current?.({ lat: center.lat, lng: center.lng });
    });

    map.on('error', (e) => {
      console.error('[SolariaScope] Map error:', e);
    });

    const fallbackTimer = setTimeout(() => {
      onMapReady();
    }, 10000);

    return () => {
      clearTimeout(fallbackTimer);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      shadowManager.destroy();
      shadowManagerRef.current = null;
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const datetime = combineDateAndTime(date, time);
    datetimeRef.current = datetime;
    shadowManagerRef.current?.updateDateTime(datetime);
  }, [date, time]);

  return <div ref={mapContainer} className="absolute inset-0 z-[var(--z-map)] h-full w-full" />;
});

ShadowMap.displayName = 'ShadowMap';
export default ShadowMap;
