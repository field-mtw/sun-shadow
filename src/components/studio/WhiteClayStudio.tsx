'use client';

import { useRef, useState } from 'react';
import {
  Box,
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Flame,
  GitCompareArrows,
  Layers,
  Maximize2,
  Minimize2,
  Orbit,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import WhiteClayCanvas, {
  type StudioCameraOrientation,
  type StudioCameraPreset,
  type WhiteClayCanvasRef,
} from './WhiteClayCanvas';
import { METERS_PER_FLOOR } from '@/lib/constants';
import type { ClayAreaSlice, StudioBoxSize } from '@/lib/clay-extractor';
import {
  removeCustomBuilding,
  resetCustomMassingInBounds,
  setBuildingHeightOverride,
  upsertCustomBuilding,
} from '@/lib/smart-height';
import type { MapWind } from '@/lib/wind-vector';
import { cn } from '@/lib/cn';
import { soundFX } from '@/lib/sound-fx';

interface WhiteClayStudioProps {
  slice: ClayAreaSlice | null;
  isExtracting?: boolean;
  date: Date;
  time: Date;
  wind?: MapWind | null;
  sizeMeters: StudioBoxSize;
  onSizeChange: (size: StudioBoxSize) => void;
  isFull3D: boolean;
  onToggleFull3D: () => void;
  onMassingChange?: () => void;
  onCameraOrientationChange?: (orientation: StudioCameraOrientation) => void;
}

const FLOOR_PRESETS = [2, 4, 8, 16, 30, 50] as const;

export default function WhiteClayStudio({
  slice,
  isExtracting = false,
  date,
  time,
  wind,
  sizeMeters,
  onSizeChange,
  isFull3D,
  onToggleFull3D,
  onMassingChange,
  onCameraOrientationChange,
}: WhiteClayStudioProps) {
  const t = useTranslations('studio');
  const canvasRef = useRef<WhiteClayCanvasRef>(null);

  const [cameraPreset, setCameraPreset] = useState<StudioCameraPreset>('isometric');
  const [showSunDome, setShowSunDome] = useState(true);
  const [showWind3D, setShowWind3D] = useState(true);
  const [showEtchedRoads, setShowEtchedRoads] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showGhostSolstice, setShowGhostSolstice] = useState(false);
  const [scorecardExpanded, setScorecardExpanded] = useState(true);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);

  const selectedBuilding =
    slice?.buildings.find((b) => b.id === selectedBuildingId) ?? null;

  const hasCustomEdits =
    slice?.buildings.some((b) => b.isCustomAdded || b.heightSource === 'custom') ?? false;

  const handlePreset = (next: StudioCameraPreset) => {
    soundFX.playSwitch(true);
    setCameraPreset(next);
    canvasRef.current?.setCameraPreset(next);
  };

  const handleCapture = () => {
    soundFX.playSwitch(true);
    const dataUrl = canvasRef.current?.capturePng();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `solaria-3d-maquette-${sizeMeters}m.png`;
    a.click();
  };

  const handleSelectBuilding = (bId: string | null) => {
    if (bId) soundFX.playChronoTick();
    setSelectedBuildingId(bId);
  };

  const handlePlaceBuildingAt = (localX: number, localZ: number) => {
    if (!slice) return;
    soundFX.playSwitch(true);
    const metersPerDegLat = 110540;
    const metersPerDegLng =
      111320 * Math.max(0.2, Math.cos((slice.centerLat * Math.PI) / 180));
    const lng = slice.centerLng + localX / metersPerDegLng;
    const lat = slice.centerLat - localZ / metersPerDegLat;

    const newId = `custom-${Date.now()}`;
    upsertCustomBuilding({
      id: newId,
      lat,
      lng,
      widthMeters: 22,
      depthMeters: 16,
      heightMeters: 35,
      rotationDeg: 0,
      createdAt: Date.now(),
    });
    setIsPlacementMode(false);
    setSelectedBuildingId(newId);
    onMassingChange?.();
  };

  const handleHeightChange = (nextHeight: number) => {
    if (!selectedBuilding) return;
    soundFX.playChronoTick();
    const clamped = Math.max(3, Math.min(280, Math.round(nextHeight * 2) / 2));
    if (selectedBuilding.isCustomAdded) {
      upsertCustomBuilding({
        id: selectedBuilding.id,
        lat: selectedBuilding.lat,
        lng: selectedBuilding.lng,
        widthMeters: selectedBuilding.customWidth ?? 22,
        depthMeters: selectedBuilding.customDepth ?? 16,
        heightMeters: clamped,
        rotationDeg: selectedBuilding.customRotationDeg ?? 0,
        name: selectedBuilding.name,
        createdAt: Date.now(),
      });
    } else {
      setBuildingHeightOverride(selectedBuilding.geoKey, clamped);
    }
    onMassingChange?.();
  };

  const handleCustomFootprintChange = (
    widthMeters: number,
    depthMeters: number,
    rotationDeg: number,
  ) => {
    if (!selectedBuilding || !selectedBuilding.isCustomAdded) return;
    soundFX.playChronoTick();
    upsertCustomBuilding({
      id: selectedBuilding.id,
      lat: selectedBuilding.lat,
      lng: selectedBuilding.lng,
      widthMeters,
      depthMeters,
      heightMeters: selectedBuilding.height,
      rotationDeg,
      name: selectedBuilding.name,
      createdAt: Date.now(),
    });
    onMassingChange?.();
  };

  const handleResetSelectedBuilding = () => {
    if (!selectedBuilding) return;
    soundFX.playSwitch(false);
    if (selectedBuilding.isCustomAdded) {
      removeCustomBuilding(selectedBuilding.id);
      setSelectedBuildingId(null);
    } else {
      setBuildingHeightOverride(selectedBuilding.geoKey, null);
    }
    onMassingChange?.();
  };

  const handleResetAllInSlice = () => {
    if (!slice) return;
    soundFX.playSwitch(false);
    const half = (slice.sizeMeters / 2) * 1.15;
    const dLat = half / 110540;
    const dLng =
      half / (111320 * Math.max(0.2, Math.cos((slice.centerLat * Math.PI) / 180)));
    resetCustomMassingInBounds(
      slice.centerLng - dLng,
      slice.centerLat - dLat,
      slice.centerLng + dLng,
      slice.centerLat + dLat,
    );
    setSelectedBuildingId(null);
    onMassingChange?.();
  };

  const sc = slice?.scorecard;

  return (
    <div className="studio-stage relative h-full w-full overflow-hidden select-none">
      {/* Subtle Architectural Studio Radial Backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,251,242,0.92)_0%,rgba(228,223,214,0.96)_62%,rgba(210,204,194,1)_100%)] dark:bg-[radial-gradient(circle_at_50%_38%,rgba(22,34,56,0.95)_0%,rgba(9,17,32,0.98)_65%,rgba(4,9,18,1)_100%)]" />

      {/* Subtle Telemetry Grid Lines in Background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(120,113,108,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,113,108,0.22) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Three.js White Clay Viewport */}
      <WhiteClayCanvas
        ref={canvasRef}
        slice={slice}
        date={date}
        time={time}
        wind={wind}
        showSunDome={showSunDome}
        showWind3D={showWind3D}
        showEtchedRoads={showEtchedRoads}
        showHeatmap={showHeatmap}
        showGhostSolstice={showGhostSolstice}
        cameraPreset={cameraPreset}
        onCameraPresetChange={setCameraPreset}
        onCameraOrientationChange={onCameraOrientationChange}
        selectedBuildingId={selectedBuildingId}
        isPlacementMode={isPlacementMode}
        onSelectBuilding={handleSelectBuilding}
        onPlaceBuildingAt={handlePlaceBuildingAt}
      />

      {/* Placement Mode Floating Banner */}
      {isPlacementMode && (
        <div className="pointer-events-auto absolute top-[62px] left-1/2 z-20 -translate-x-1/2">
          <div className="glass-panel glass-panel-strong flex items-center gap-2 rounded-full border border-sun/50 px-3.5 py-1.5 text-[11px] font-semibold text-sun-text shadow-lg">
            <span className="h-2 w-2 animate-ping rounded-full bg-sun" />
            <span>{t('placeBuildingPrompt')}</span>
            <button
              type="button"
              onClick={() => setIsPlacementMode(false)}
              className="ml-1 rounded-full p-0.5 text-fg-muted hover:bg-black/10 hover:text-fg dark:hover:bg-white/10"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Top Studio Header Bar (Positioned below main top command bar; offset in Full 3D so Sidebar rail never overlaps) */}
      <div
        className={cn(
          'pointer-events-none absolute top-[62px] right-3 z-10 flex flex-wrap items-start justify-between gap-2',
          isFull3D ? 'left-3 md:left-[70px]' : 'left-3',
        )}
      >
        {/* Left Column: Site Comfort Scorecard + Interactive Building Massing Editor */}
        <div className="flex flex-col gap-2 max-w-[285px]">
          {sc && (
            <div className="glass-panel pointer-events-auto flex flex-col rounded-[16px] p-2.5 shadow-lg transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun/15 text-sun-text ring-1 ring-sun/40">
                    <span className="text-[13px] font-bold tabular-nums">{sc.overallScore}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-fg uppercase">
                      <Sparkles size={11} className="text-sun" />
                      <span>{t('scorecardTitle')}</span>
                    </div>
                    <div className="text-[10px] text-fg-muted tabular-nums">
                      {sc.buildingCount} {t('buildingsUnit')} · {t('maxHeight')} {sc.maxBuildingHeight}m
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScorecardExpanded((v) => !v)}
                  className="rounded-lg p-1 text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg"
                  aria-label="Toggle scorecard"
                >
                  {scorecardExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {scorecardExpanded && (
                <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[var(--glass-border)] pt-2 text-[11px]">
                  {/* 1. Afternoon Shade */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-fg-muted">
                      <Sun size={11} className="text-sun" />
                      {t('afternoonShade')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-sun"
                          style={{ width: `${sc.afternoonShadeScore}%` }}
                        />
                      </div>
                      <span className="w-6 text-right font-semibold tabular-nums text-fg">
                        {sc.afternoonShadeScore}
                      </span>
                    </div>
                  </div>

                  {/* 2. Wind Corridor */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-fg-muted">
                      <Wind size={11} className="text-wind" />
                      {t('windCorridor')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-wind"
                          style={{ width: `${sc.windCorridorScore}%` }}
                        />
                      </div>
                      <span className="w-6 text-right font-semibold tabular-nums text-fg">
                        {sc.windCorridorScore}
                      </span>
                    </div>
                  </div>

                  {/* 3. Solar Rooftop Yield */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-fg-muted">
                      <Zap size={11} className="text-amber-500" />
                      {t('solarYield')}
                    </span>
                    <span className="font-semibold tabular-nums text-sun-text">
                      {sc.avgRoofSunHours}h · {sc.estimatedKwhPerKwp} kWh
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Selected Building / Massing Editor Pod */}
          {selectedBuilding ? (
            <div className="glass-panel glass-panel-strong pointer-events-auto flex flex-col gap-2 rounded-[16px] border border-sun/40 p-3 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-fg">
                    <Building2 size={13} className="shrink-0 text-sun" />
                    <span className="truncate">
                      {selectedBuilding.name ||
                        (selectedBuilding.isCustomAdded
                          ? t('customBuildingName')
                          : `${t('buildingLabel')} #${selectedBuilding.id.replace('b-', '')}`)}
                    </span>
                  </div>
                  {/* Source Confidence Badge */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase',
                        selectedBuilding.heightSource === 'measured' &&
                          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
                        selectedBuilding.heightSource === 'estimated' &&
                          'bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/30',
                        selectedBuilding.heightSource === 'custom' &&
                          'bg-amber-500/20 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/40',
                      )}
                    >
                      {selectedBuilding.heightSource === 'measured'
                        ? t('sourceMeasured')
                        : selectedBuilding.heightSource === 'custom'
                          ? t('sourceCustom')
                          : t('sourceEstimated')}
                    </span>
                    <span className="text-[10px] text-fg-muted tabular-nums">
                      {selectedBuilding.footprintAreaM2} m² · ☀️ {selectedBuilding.roofSunHours}h
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBuildingId(null)}
                  className="rounded-lg p-1 text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg"
                  aria-label="Close building inspector"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Height & Floor Slider */}
              <div className="flex flex-col gap-1 border-t border-[var(--glass-border)] pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-fg-muted">{t('heightFloorsLabel')}</span>
                  <span className="font-bold tabular-nums text-sun-text">
                    {Math.round(selectedBuilding.height)}m · ~
                    {Math.max(1, Math.round(selectedBuilding.height / METERS_PER_FLOOR))}{' '}
                    {t('floorsUnit')}
                  </span>
                </div>
                <input
                  type="range"
                  min={3.5}
                  max={250}
                  step={1}
                  value={selectedBuilding.height}
                  onChange={(e) => handleHeightChange(Number(e.target.value))}
                  className="time-range my-1"
                />
                {/* Quick Floor Presets */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {FLOOR_PRESETS.map((fl) => {
                    const targetH = Math.round(fl * METERS_PER_FLOOR);
                    const active = Math.abs(selectedBuilding.height - targetH) < 2;
                    return (
                      <button
                        key={fl}
                        type="button"
                        onClick={() => handleHeightChange(targetH)}
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-all',
                          active
                            ? 'bg-sun text-fg-inverse'
                            : 'bg-black/5 text-fg-muted hover:text-fg dark:bg-white/10',
                        )}
                      >
                        {fl}F
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Building Footprint Dimensions & Rotation */}
              {selectedBuilding.isCustomAdded && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--glass-border)] pt-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-muted">
                      {t('widthLabel')}: {selectedBuilding.customWidth ?? 22}m
                    </span>
                    <input
                      type="range"
                      min={6}
                      max={90}
                      step={2}
                      value={selectedBuilding.customWidth ?? 22}
                      onChange={(e) =>
                        handleCustomFootprintChange(
                          Number(e.target.value),
                          selectedBuilding.customDepth ?? 16,
                          selectedBuilding.customRotationDeg ?? 0,
                        )
                      }
                      className="time-range w-28"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-muted">
                      {t('depthLabel')}: {selectedBuilding.customDepth ?? 16}m
                    </span>
                    <input
                      type="range"
                      min={6}
                      max={90}
                      step={2}
                      value={selectedBuilding.customDepth ?? 16}
                      onChange={(e) =>
                        handleCustomFootprintChange(
                          selectedBuilding.customWidth ?? 22,
                          Number(e.target.value),
                          selectedBuilding.customRotationDeg ?? 0,
                        )
                      }
                      className="time-range w-28"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-muted">
                      {t('rotationLabel')}: {selectedBuilding.customRotationDeg ?? 0}°
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={175}
                      step={5}
                      value={selectedBuilding.customRotationDeg ?? 0}
                      onChange={(e) =>
                        handleCustomFootprintChange(
                          selectedBuilding.customWidth ?? 22,
                          selectedBuilding.customDepth ?? 16,
                          Number(e.target.value),
                        )
                      }
                      className="time-range w-28"
                    />
                  </div>
                </div>
              )}

              {/* Reset or Delete Action */}
              {(selectedBuilding.isCustomAdded || selectedBuilding.heightSource === 'custom') && (
                <div className="flex justify-end border-t border-[var(--glass-border)] pt-1.5">
                  <button
                    type="button"
                    onClick={handleResetSelectedBuilding}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-danger hover:bg-red-500/10"
                  >
                    {selectedBuilding.isCustomAdded ? (
                      <>
                        <Trash2 size={11} />
                        <span>{t('deleteCustomBuilding')}</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw size={11} />
                        <span>
                          {t('resetBuildingHeight')} ({Math.round(selectedBuilding.defaultHeight)}m)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel pointer-events-auto flex items-center justify-between gap-2 rounded-full px-3 py-1.5 text-[10px] text-fg-muted shadow-sm">
              <span className="truncate">{t('clickBuildingHint')}</span>
              <button
                type="button"
                onClick={() => {
                  soundFX.playSwitch(!isPlacementMode);
                  setIsPlacementMode((v) => !v);
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-bold transition-all',
                  isPlacementMode
                    ? 'bg-sun text-fg-inverse'
                    : 'bg-[var(--accent-sun-soft)] text-sun-text hover:bg-sun hover:text-fg-inverse',
                )}
              >
                <Plus size={11} />
                <span>{t('addBuildingBtn')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Camera Presets + Massing Actions + Layer Toggles */}
        <div className="pointer-events-auto ml-auto flex flex-col items-end gap-1.5">
          <div className="glass-panel flex items-center gap-1 rounded-full p-1 shadow-md">
            {/* Box Size Selector when in Full 3D mode */}
            {isFull3D && (
              <div className="mr-1 flex items-center gap-0.5 border-r border-[var(--glass-border)] pr-1.5">
                {([200, 350, 500] as StudioBoxSize[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      soundFX.playSwitch(true);
                      onSizeChange(s);
                    }}
                    className={cn(
                      'rounded-full px-2 py-1 text-[10px] font-bold tabular-nums transition-all',
                      sizeMeters === s
                        ? 'bg-sun text-fg-inverse'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {s}m
                  </button>
                ))}
              </div>
            )}

            {/* Add Custom Building Button */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!isPlacementMode);
                setIsPlacementMode((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
                isPlacementMode
                  ? 'bg-sun text-fg-inverse shadow-sm'
                  : 'bg-[var(--accent-sun-soft)] text-sun-text hover:bg-sun/25',
              )}
              title={t('addBuildingBtn')}
            >
              <Plus size={12} />
              <span className="hidden sm:inline">{t('addBuildingBtn')}</span>
            </button>

            {hasCustomEdits && (
              <button
                type="button"
                onClick={handleResetAllInSlice}
                className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-red-500/15 hover:text-danger"
                title={t('resetAllEdits')}
                aria-label={t('resetAllEdits')}
              >
                <RotateCcw size={12} />
              </button>
            )}

            <div className="mx-0.5 h-4 w-px bg-[var(--glass-border)]" />

            {/* Camera Angle Presets */}
            <button
              type="button"
              onClick={() => handlePreset('isometric')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                cameraPreset === 'isometric'
                  ? 'bg-[var(--accent-sun-soft)] text-sun-text font-semibold'
                  : 'text-fg-muted hover:text-fg',
              )}
              title={t('camIso')}
            >
              <Box size={12} />
              <span className="hidden sm:inline">{t('camIso')}</span>
            </button>

            <button
              type="button"
              onClick={() => handlePreset('top')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                cameraPreset === 'top'
                  ? 'bg-[var(--accent-sun-soft)] text-sun-text font-semibold'
                  : 'text-fg-muted hover:text-fg',
              )}
              title={t('camTop')}
            >
              <Compass size={12} />
              <span className="hidden sm:inline">{t('camTop')}</span>
            </button>

            <button
              type="button"
              onClick={() => handlePreset('sun')}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
                cameraPreset === 'sun'
                  ? 'bg-[var(--accent-sun-soft)] text-sun-text font-semibold'
                  : 'text-fg-muted hover:text-fg',
              )}
              title={t('camSun')}
            >
              <Eye size={12} />
              <span className="hidden sm:inline">{t('camSun')}</span>
            </button>

            <div className="mx-0.5 h-4 w-px bg-[var(--glass-border)]" />

            {/* Capture 3D PNG */}
            <button
              type="button"
              onClick={handleCapture}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg"
              title={t('capture3D')}
              aria-label={t('capture3D')}
            >
              <Camera size={13} />
            </button>

            {/* Expand / Split Toggle */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!isFull3D);
                onToggleFull3D();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-[var(--glass-hover)] hover:text-fg"
              title={isFull3D ? t('exitFull3D') : t('expandFull3D')}
              aria-label={isFull3D ? t('exitFull3D') : t('expandFull3D')}
            >
              {isFull3D ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>

          {/* Layer & Analysis Toggles Stack */}
          <div className="glass-panel flex flex-wrap items-center justify-end gap-1 rounded-full px-2 py-1 shadow-md">
            {/* 1. 3D Sun Dome */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!showSunDome);
                setShowSunDome((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                showSunDome
                  ? 'bg-[var(--accent-sun-soft)] text-sun-text'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Orbit size={11} />
              <span>{t('sunDome')}</span>
            </button>

            {/* 2. 3D Wind Streamlines */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!showWind3D);
                setShowWind3D((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                showWind3D
                  ? 'bg-[var(--accent-wind-soft)] text-wind'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Wind size={11} />
              <span>{t('wind3D')}</span>
            </button>

            {/* 3. 3D Solar Heatmap Scanner */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!showHeatmap);
                setShowHeatmap((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                showHeatmap
                  ? 'bg-gradient-to-r from-indigo-500/20 via-emerald-500/20 to-amber-500/30 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Flame size={11} />
              <span>{t('solarHeatmap')}</span>
            </button>

            {/* 4. Dual-Solstice Ghost Shadow */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!showGhostSolstice);
                setShowGhostSolstice((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                showGhostSolstice
                  ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 ring-1 ring-sky-400/40'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <GitCompareArrows size={11} />
              <span>{t('solsticeGhost')}</span>
            </button>

            {/* 5. Etched Roads & Contours */}
            <button
              type="button"
              onClick={() => {
                soundFX.playSwitch(!showEtchedRoads);
                setShowEtchedRoads((v) => !v);
              }}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                showEtchedRoads
                  ? 'bg-black/10 text-fg dark:bg-white/15'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Layers size={11} />
              <span>{t('etchedRoads')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Legend Bar (Bottom-Right above Time Console) */}
      {(showWind3D || showHeatmap || showGhostSolstice || isExtracting) && (
        <div className="pointer-events-none absolute right-3 bottom-[118px] z-10 flex flex-col items-end gap-1.5">
          {isExtracting && (
            <div className="glass-panel flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-sun-text shadow-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-sun" />
              <span>{t('syncingModel')}</span>
            </div>
          )}

          {showWind3D && (
            <div className="glass-panel flex items-center gap-2.5 rounded-full px-3 py-1 text-[10px] font-semibold text-fg shadow-md">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[#2dd4bf]" />
                {t('windNormal')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />
                {t('windImpact')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[#3b82f6]" />
                {t('windWake')}
              </span>
            </div>
          )}

          {showHeatmap && (
            <div className="glass-panel flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold text-fg shadow-md">
              <span>{t('heatmapLegend')}:</span>
              <span className="text-indigo-500 dark:text-indigo-300">0h</span>
              <div className="h-2 w-24 rounded-full bg-gradient-to-r from-[#1f2961] via-[#0f9488] via-[#eab308] to-[#ea580c]" />
              <span className="text-orange-600 dark:text-amber-300">11h+</span>
            </div>
          )}

          {showGhostSolstice && (
            <div className="glass-panel flex items-center gap-2.5 rounded-full px-3 py-1 text-[10px] font-semibold text-fg shadow-md">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                {t('summerShadow')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
                {t('winterShadow')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
