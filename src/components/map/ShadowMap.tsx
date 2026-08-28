'use client';

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// @ts-ignore
import ShadeMap from 'mapbox-gl-shadow-simulator';

interface ShadowMapProps {
  date: Date;
  time: Date;
  onMapReady: () => void;
}

export interface ShadowMapRef {
  getCanvas: () => HTMLCanvasElement | null;
}

const combineDateAndTime = (date: Date, time: Date): Date => {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds());
  return combined;
};

const ShadowMap = forwardRef<ShadowMapRef, ShadowMapProps>(({ date, time, onMapReady }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shadeMapRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => mapRef.current?.getCanvas() || null
  }));

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
      center: [100.5018, 13.7563],
      zoom: 14,
      pitch: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'top-right'
    );

    map.on('load', () => {
      const shadeMap = new ShadeMap({
        date: combineDateAndTime(date, time),
        color: '#01112f',
        opacity: 0.7,
        apiKey: MAPTILER_KEY,
        terrainSource: {
          tileSize: 512,
          maxZoom: 12,
          getSourceUrl: ({x, y, z}: {x: number; y: number; z: number}) => `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`,
          getElevation: ({r, g, b, a}: {r: number; g: number; b: number; a: number}) => -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1),
        },
      }).addTo(map);

      shadeMapRef.current = shadeMap;
      mapRef.current = map;
      onMapReady();
    });

    return () => {
      if (shadeMapRef.current) {
        shadeMapRef.current.remove();
      }
      map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (shadeMapRef.current) {
      shadeMapRef.current.setDate(combineDateAndTime(date, time));
    }
  }, [date, time]);

  return <div ref={mapContainer} className="w-full h-full absolute inset-0" />;
});

ShadowMap.displayName = 'ShadowMap';
export default ShadowMap;
