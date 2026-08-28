'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapWind } from '@/lib/wind-vector';
import { windColor, windHeadColor, windPixelsPerSecond } from '@/lib/wind-vector';
import {
  extentForView,
  getMonthlyWindField,
  traceStreamlines,
  uniformFieldFromWind,
  viewNeedsRetrace,
  type GeoStream,
  type WindBounds,
  type WindField,
} from '@/lib/wind-field';

type Point = { x: number; y: number };
type ScreenStream = { pts: Point[]; phase: number; length: number };

function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function pointAt(pts: Point[], total: number, t: number): Point | null {
  if (pts.length < 2 || total <= 0) return null;
  let dist = (((t % 1) + 1) % 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (dist <= seg) {
      const u = dist / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
      };
    }
    dist -= seg;
  }
  return pts[pts.length - 1];
}

function strokeSmooth(ctx: CanvasRenderingContext2D, pts: Point[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(
        pts[i].x,
        pts[i].y,
        (pts[i].x + pts[i + 1].x) / 2,
        (pts[i].y + pts[i + 1].y) / 2,
      );
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
  ctx.stroke();
}

function projectStreams(
  streams: GeoStream[],
  project: (lng: number, lat: number) => { x: number; y: number } | null,
  width: number,
  height: number,
): ScreenStream[] {
  const maxSeg = Math.hypot(width, height) * 0.38;
  const pad = 80;
  const out: ScreenStream[] = [];

  for (const stream of streams) {
    const pts: Point[] = [];
    for (const geo of stream.pts) {
      const p = project(geo.lng, geo.lat);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < -pad || p.x > width + pad || p.y < -pad || p.y > height + pad) {
        if (pts.length > 8) break;
        continue;
      }
      const prev = pts[pts.length - 1];
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > maxSeg) continue;
      pts.push(p);
    }
    if (pts.length > 6) {
      out.push({ pts, phase: stream.phase, length: polylineLength(pts) });
    }
  }
  return out;
}

export default function WindFlowOverlay({
  wind,
  visible,
  month,
  project,
  getBounds,
  getZoom,
  subscribeView,
  emphasized = false,
}: {
  wind: MapWind | null;
  visible: boolean;
  month: number;
  project?: (lng: number, lat: number) => { x: number; y: number } | null;
  getBounds?: () => WindBounds | null;
  getZoom?: () => number;
  subscribeView?: (cb: () => void) => () => void;
  emphasized?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef(project);
  const getBoundsRef = useRef(getBounds);
  const getZoomRef = useRef(getZoom);
  const subscribeViewRef = useRef(subscribeView);
  const emphasizedRef = useRef(emphasized);
  const elapsedRef = useRef(0);

  const [field, setField] = useState<WindField | null>(null);

  useEffect(() => {
    projectRef.current = project;
    getBoundsRef.current = getBounds;
    getZoomRef.current = getZoom;
    subscribeViewRef.current = subscribeView;
    emphasizedRef.current = emphasized;
  });

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    let lastExtentKey = '';
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setInterval> | undefined;

    const extentKeyOf = () => {
      const bounds = getBoundsRef.current?.();
      if (!bounds) return '';
      const extent = extentForView(bounds);
      return `${extent.west.toFixed(1)}:${extent.south.toFixed(1)}:${extent.east.toFixed(1)}:${extent.north.toFixed(1)}`;
    };

    const loadNow = () => {
      const bounds = getBoundsRef.current?.();
      if (!bounds) return false;
      const key = extentKeyOf();
      if (!key || key === lastExtentKey) return true;
      lastExtentKey = key;
      getMonthlyWindField(extentForView(bounds), month + 1).then((next) => {
        if (!cancelled && next) setField(next);
      });
      return true;
    };

    const load = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        loadNow();
      }, 1200);
      return Boolean(getBoundsRef.current?.());
    };

    if (!load()) {
      retry = setInterval(() => {
        if (load() && retry) {
          clearInterval(retry);
          retry = undefined;
        }
      }, 600);
    }

    const unsub = subscribeViewRef.current?.(load);

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (retry) clearInterval(retry);
      unsub?.();
    };
  }, [visible, month]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !visible || !wind) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let last = performance.now();
    let geoStreams: GeoStream[] = [];
    let screen: ScreenStream[] = [];
    let projectDirty = true;
    let lastView: WindBounds | null = null;
    let lastZoom = Number.NaN;
    let lastOffscreenCheck = 0;

    const sourceField = (view: WindBounds): WindField =>
      field ?? uniformFieldFromWind(wind, extentForView(view));

    const retrace = (force: boolean) => {
      const view = getBoundsRef.current?.();
      if (!view) return;
      const zoom = getZoomRef.current?.() ?? 0;
      if (!force && !viewNeedsRetrace(lastView, view, lastZoom, zoom)) return;
      geoStreams = traceStreamlines(sourceField(view), view);
      lastView = view;
      lastZoom = zoom;
      projectDirty = true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      retrace(true);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    const unsub = subscribeViewRef.current?.(() => {
      projectDirty = true;
      retrace(false);
    });

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsedRef.current += dt;

      const projectFn = projectRef.current;
      if (projectFn && projectDirty) {
        screen = projectStreams(geoStreams, projectFn, width, height);
        if (screen.length < 4 && now - lastOffscreenCheck > 400) {
          lastOffscreenCheck = now;
          retrace(true);
          screen = projectStreams(geoStreams, projectFn, width, height);
        }
        projectDirty = false;
      }

      const strong = emphasizedRef.current;
      const lineAlpha = strong ? 0.42 : 0.22;
      const lineWidth = strong ? 1.8 : 1.25;
      const beadSpeed = windPixelsPerSecond(wind.speedKmh) * (strong ? 0.55 : 0.35);

      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = windColor(wind.speedKmh, lineAlpha);

      for (const stream of screen) {
        strokeSmooth(ctx, stream.pts);

        const beadCount = strong ? 2 : 1;
        for (let b = 0; b < beadCount; b++) {
          const t = stream.phase + b / beadCount + (elapsedRef.current * beadSpeed) / Math.max(stream.length, 1);
          const pos = pointAt(stream.pts, stream.length, t);
          if (!pos) continue;
          ctx.beginPath();
          ctx.fillStyle = windHeadColor(wind.speedKmh, strong ? 0.9 : 0.7);
          ctx.arc(pos.x, pos.y, strong ? 2.4 : 1.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      unsub?.();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [visible, wind, field]);

  if (!visible) return null;

  return (
    <div ref={wrapRef} className="wind-overlay pointer-events-none absolute inset-0 z-[var(--z-wind)]">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
