'use client';

import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Map, NavigationControl, GeolocateControl } from 'maplibre-gl';
import type { MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface ShadowMapProps {
  date: Date;
  time: Date;
  onMapReady: () => void;
}

export interface ShadowMapRef {
  getCanvas: () => HTMLCanvasElement | null;
  flyTo: (lng: number, lat: number, zoom?: number) => void;
}

const combineDateAndTime = (date: Date, time: Date): Date => {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds());
  return combined;
};

const ShadowMap = forwardRef<ShadowMapRef, ShadowMapProps>(({ date, time, onMapReady }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const shadeMapRef = useRef<any>(null);
  const initializedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getCanvas: () => mapRef.current?.getCanvas() || null,
    flyTo: (lng: number, lat: number, zoom: number = 14) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
    },
  }));

  const initShadowSimulator = useCallback((map: Map) => {
    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

    try {
      // Dynamic require to avoid SSR issues with mapbox-gl-shadow-simulator
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ShadeMap = require('mapbox-gl-shadow-simulator').default || require('mapbox-gl-shadow-simulator');

      const shadeMap = new ShadeMap({
        date: combineDateAndTime(date, time),
        color: '#01112f',
        opacity: 0.7,
        apiKey: MAPTILER_KEY,
        terrainSource: {
          tileSize: 512,
          maxZoom: 12,
          getSourceUrl: ({ x, y, z }: { x: number; y: number; z: number }) =>
            `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`,
          getElevation: ({ r, g, b, a }: { r: number; g: number; b: number; a: number }) =>
            -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1),
        },
      }).addTo(map);

      shadeMapRef.current = shadeMap;
      console.log('[SunShadow] Shadow simulator initialized');
    } catch (error) {
      console.warn('[SunShadow] Shadow simulator failed to initialize:', error);
    }
  }, [date, time]);

  useEffect(() => {
    if (!mapContainer.current || initializedRef.current) return;
    initializedRef.current = true;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

    console.log('[SunShadow] Initializing map with key:', MAPTILER_KEY ? `${MAPTILER_KEY.slice(0, 4)}...` : 'MISSING');

    const map = new Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
      center: [100.5018, 13.7563],
      zoom: 14,
      pitch: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
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

    map.on('load', () => {
      console.log('[SunShadow] Map loaded successfully');
      onMapReady();
      initShadowSimulator(map);
    });

    map.on('error', (e) => {
      console.error('[SunShadow] Map error:', e);
    });

    // Fallback: mark ready after 10s even if load event doesn't fire
    const fallbackTimer = setTimeout(() => {
      console.warn('[SunShadow] Map load timeout — marking ready anyway');
      onMapReady();
    }, 10000);

    return () => {
      clearTimeout(fallbackTimer);
      if (shadeMapRef.current) {
        try { shadeMapRef.current.remove(); } catch (_) { /* ignore */ }
      }
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update shadow when date/time changes
  useEffect(() => {
    if (shadeMapRef.current) {
      try {
        shadeMapRef.current.setDate(combineDateAndTime(date, time));
      } catch (error) {
        console.warn('[SunShadow] Failed to update shadow date:', error);
      }
    }
  }, [date, time]);

  return <div ref={mapContainer} className="w-full h-full absolute inset-0" />;
});

ShadowMap.displayName = 'ShadowMap';
export default ShadowMap;
