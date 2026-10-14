'use client';

import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ClayAreaSlice } from '@/lib/clay-extractor';
import { combineDateAndTime, getSkyLighting, getSunPosition } from '@/lib/sun-engine';
import type { MapWind } from '@/lib/wind-vector';
import {
  compute3DWindFlowField,
  sampleStreamlineAt,
  type WindStreamline,
} from '@/lib/wind-flow-3d';

export type StudioCameraPreset = 'isometric' | 'top' | 'sun';

export interface StudioCameraOrientation {
  /** Compass direction (0=N, 90=E, 180=S, 270=W) the 3D camera is looking TOWARD */
  azimuthDeg: number;
  /** Vertical elevation angle of the camera in degrees (0=horizon, 90=top-down) */
  pitchDeg: number;
}

export interface WhiteClayCanvasRef {
  capturePng: () => string | null;
  setCameraPreset: (preset: StudioCameraPreset) => void;
}

interface WhiteClayCanvasProps {
  slice: ClayAreaSlice | null;
  date: Date;
  time: Date;
  wind?: MapWind | null;
  showSunDome: boolean;
  showWind3D: boolean;
  showEtchedRoads: boolean;
  showHeatmap: boolean;
  showGhostSolstice: boolean;
  cameraPreset: StudioCameraPreset;
  onCameraPresetChange?: (preset: StudioCameraPreset) => void;
  onCameraOrientationChange?: (orientation: StudioCameraOrientation) => void;
  selectedBuildingId?: string | null;
  isPlacementMode?: boolean;
  onSelectBuilding?: (buildingId: string | null) => void;
  onPlaceBuildingAt?: (localX: number, localZ: number) => void;
}

/**
 * Maps solar exposure hours (0..11h) to a scientific thermal RGB color [0..1].
 */
function solarHoursToRgb(hours: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, hours / 10.5));
  // 5-stop thermal ramp: Deep Indigo -> Teal -> Emerald -> Amber Gold -> Crimson Orange
  if (t < 0.25) {
    const u = t / 0.25;
    return [
      0.12 + u * (0.06 - 0.12),
      0.16 + u * (0.58 - 0.16),
      0.38 + u * (0.62 - 0.38),
    ];
  }
  if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    return [
      0.06 + u * (0.22 - 0.06),
      0.58 + u * (0.78 - 0.58),
      0.62 + u * (0.38 - 0.62),
    ];
  }
  if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    return [
      0.22 + u * (0.96 - 0.22),
      0.78 + u * (0.68 - 0.78),
      0.38 + u * (0.08 - 0.38),
    ];
  }
  const u = (t - 0.75) / 0.25;
  return [
    0.96 + u * (0.94 - 0.96),
    0.68 + u * (0.26 - 0.68),
    0.08 + u * (0.12 - 0.08),
  ];
}

/**
 * Converts solar azimuth (0 = North, CW) and altitude (deg) into 3D position on dome of radius R.
 * In our Three.js space: +X = East, +Y = Up, -Z = North (+Z = South).
 */
function sphericalSunToXYZ(azimuthDeg: number, altitudeDeg: number, radius: number): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const cosAlt = Math.cos(alt);
  const x = radius * Math.sin(az) * cosAlt;
  const y = radius * Math.sin(alt);
  const z = -radius * Math.cos(az) * cosAlt;
  return new THREE.Vector3(x, y, z);
}

function disposeGroupChildren(g: THREE.Group): void {
  while (g.children.length > 0) {
    const child = g.children[0] as THREE.Mesh | THREE.Line | THREE.LineSegments;
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else if (mat) {
      mat.dispose();
    }
    g.remove(child);
  }
}

const WhiteClayCanvas = forwardRef<WhiteClayCanvasRef, WhiteClayCanvasProps>(
  (
    {
      slice,
      date,
      time,
      wind,
      showSunDome,
      showWind3D,
      showEtchedRoads,
      showHeatmap,
      showGhostSolstice,
      cameraPreset,
      onCameraOrientationChange,
      selectedBuildingId = null,
      isPlacementMode = false,
      onSelectBuilding,
      onPlaceBuildingAt,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);

    const maquetteGroupRef = useRef<THREE.Group | null>(null);
    const etchedGroupRef = useRef<THREE.Group | null>(null);
    const domeGroupRef = useRef<THREE.Group | null>(null);
    const ghostGroupRef = useRef<THREE.Group | null>(null);
    const windGroupRef = useRef<THREE.Group | null>(null);

    const terrainMeshRef = useRef<THREE.Mesh | null>(null);
    const bldMeshRef = useRef<THREE.Mesh | null>(null);
    const triBuildingIdsRef = useRef<string[]>([]);

    const isPlacementModeRef = useRef(isPlacementMode);
    const onSelectBuildingRef = useRef(onSelectBuilding);
    const onPlaceBuildingAtRef = useRef(onPlaceBuildingAt);
    const onCameraOrientationChangeRef = useRef(onCameraOrientationChange);
    const sliceSizeRef = useRef<number>(slice?.sizeMeters ?? 350);
    const lastGhostKeyRef = useRef<string>('');

    useEffect(() => {
      sliceSizeRef.current = slice?.sizeMeters ?? 350;
    }, [slice?.sizeMeters]);

    useEffect(() => {
      isPlacementModeRef.current = isPlacementMode;
    }, [isPlacementMode]);

    useEffect(() => {
      onSelectBuildingRef.current = onSelectBuilding;
    }, [onSelectBuilding]);

    useEffect(() => {
      onPlaceBuildingAtRef.current = onPlaceBuildingAt;
    }, [onPlaceBuildingAt]);

    useEffect(() => {
      onCameraOrientationChangeRef.current = onCameraOrientationChange;
    }, [onCameraOrientationChange]);

    const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
    const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
    const sunOrbRef = useRef<THREE.Mesh | null>(null);
    const sunRayLineRef = useRef<THREE.Line | null>(null);

    const cameraPresetRef = useRef<StudioCameraPreset>(cameraPreset);
    const windParticlesRef = useRef<
      Array<{
        mesh: THREE.Mesh;
        streamline: WindStreamline;
        phase: number;
        speed: number;
      }>
    >([]);
    const windImpactRipplesRef = useRef<
      Array<{
        line: THREE.LineSegments;
        baseX: number;
        baseY: number;
        baseZ: number;
        nx: number;
        nz: number;
        phaseOffset: number;
      }>
    >([]);

    useEffect(() => {
      cameraPresetRef.current = cameraPreset;
    }, [cameraPreset]);

    const applyCameraPreset = (preset: StudioCameraPreset, sizeMeters = 350) => {
      const cam = cameraRef.current;
      const controls = controlsRef.current;
      if (!cam || !controls) return;

      const dist = sizeMeters * 0.95;
      controls.target.set(0, 8, 0);

      if (preset === 'top') {
        cam.position.set(0, dist * 1.35, 0.01);
      } else if (preset === 'sun' && sunOrbRef.current) {
        const p = sunOrbRef.current.position;
        if (p.y > 5) {
          cam.position.set(p.x * 1.25, Math.max(40, p.y * 1.25), p.z * 1.25);
        } else {
          cam.position.set(dist * 0.72, dist * 0.62, dist * 0.72);
        }
      } else {
        // Isometric 45° architectural perspective
        cam.position.set(dist * 0.72, dist * 0.62, dist * 0.78);
      }
      controls.update();
    };

    useImperativeHandle(ref, () => ({
      capturePng: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const cam = cameraRef.current;
        if (!renderer || !scene || !cam) return null;
        renderer.render(scene, cam);
        return renderer.domElement.toDataURL('image/png');
      },
      setCameraPreset: (preset: StudioCameraPreset) => {
        applyCameraPreset(preset, slice?.sizeMeters ?? 350);
      },
    }));

    // 1. Initialize Three.js Scene, Renderer, Lights, and Animation Loop
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        38,
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        2,
        3500,
      );
      camera.position.set(240, 210, 260);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.maxPolarAngle = Math.PI * 0.485;
      controls.minDistance = 70;
      controls.maxDistance = 1200;
      controls.target.set(0, 8, 0);
      controls.update();
      controlsRef.current = controls;

      // Hemisphere ambient light (sky + ground bounce)
      const hemiLight = new THREE.HemisphereLight(0xfffbf2, 0xc7c2b8, 0.72);
      hemiLight.position.set(0, 300, 0);
      scene.add(hemiLight);
      hemiLightRef.current = hemiLight;

      // Primary Directional Sun/Moon Light with High-Res PCFSoftShadowMap
      const sunLight = new THREE.DirectionalLight(0xfff5e4, 1.85);
      sunLight.position.set(160, 220, 120);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 1100;
      const d = 290;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      scene.add(sunLight);
      scene.add(sunLight.target);
      sunLightRef.current = sunLight;

      // Scene subgroups
      const maquetteGroup = new THREE.Group();
      const etchedGroup = new THREE.Group();
      const domeGroup = new THREE.Group();
      const ghostGroup = new THREE.Group();
      const windGroup = new THREE.Group();

      scene.add(maquetteGroup);
      scene.add(etchedGroup);
      scene.add(domeGroup);
      scene.add(ghostGroup);
      scene.add(windGroup);

      maquetteGroupRef.current = maquetteGroup;
      etchedGroupRef.current = etchedGroup;
      domeGroupRef.current = domeGroup;
      ghostGroupRef.current = ghostGroup;
      windGroupRef.current = windGroup;

      const resizeObserver = new ResizeObserver(() => {
        if (!container || !rendererRef.current || !cameraRef.current) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      });
      resizeObserver.observe(container);

      // Raycasting for clicking 3D buildings or placing a new custom building on the terrain
      const raycaster = new THREE.Raycaster();
      const pointerDownPos = { x: 0, y: 0 };

      const onPointerDown = (e: PointerEvent) => {
        pointerDownPos.x = e.clientX;
        pointerDownPos.y = e.clientY;
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.button !== 0) return;
        const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (dist > 6) return; // Was an orbit/pan drag, not a click

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);

        if (isPlacementModeRef.current && terrainMeshRef.current) {
          const hits = raycaster.intersectObject(terrainMeshRef.current, false);
          if (hits.length > 0) {
            const pt = hits[0].point;
            onPlaceBuildingAtRef.current?.(pt.x, pt.z);
            return;
          }
        }

        if (bldMeshRef.current) {
          const bHits = raycaster.intersectObject(bldMeshRef.current, false);
          if (bHits.length > 0 && typeof bHits[0].faceIndex === 'number') {
            const bId = triBuildingIdsRef.current[bHits[0].faceIndex];
            if (bId) {
              onSelectBuildingRef.current?.(bId);
              return;
            }
          }
        }

        onSelectBuildingRef.current?.(null);
      };

      const domEl = renderer.domElement;
      domEl.addEventListener('pointerdown', onPointerDown);
      domEl.addEventListener('pointerup', onPointerUp);

      let raf = 0;
      let lastTime = performance.now();
      let lastReportedAz = -1;
      let lastReportedPitch = -1;

      const animate = (now: number) => {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        controls.update();

        // Compute 3D camera compass direction (looking TOWARD target: 0=N, 90=E, 180=S, 270=W)
        const dx = controls.target.x - camera.position.x;
        const dz = controls.target.z - camera.position.z;
        const dy = camera.position.y - controls.target.y;
        const horizDist = Math.hypot(dx, dz);
        const rawAz =
          horizDist > 0.5
            ? ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360
            : lastReportedAz >= 0
              ? lastReportedAz
              : 0;
        const azInt = Math.round(rawAz) % 360;
        const pitchInt = Math.round(
          Math.max(0, Math.min(90, (Math.atan2(dy, Math.max(0.01, horizDist)) * 180) / Math.PI)),
        );
        if (azInt !== lastReportedAz || pitchInt !== lastReportedPitch) {
          lastReportedAz = azInt;
          lastReportedPitch = pitchInt;
          onCameraOrientationChangeRef.current?.({
            azimuthDeg: azInt,
            pitchDeg: pitchInt,
          });
        }

        // Animate 3D Building-Aware Wind Streamline Particles & Windward Impact Ripples
        if (windGroup.visible && windParticlesRef.current.length > 0) {
          const unitX = new THREE.Vector3(1, 0, 0);
          const tangentVec = new THREE.Vector3();
          for (const wp of windParticlesRef.current) {
            const preSample = sampleStreamlineAt(wp.streamline, wp.phase);
            // Accelerate in Venturi canyons / corner deflections, decelerate in leeward wakes
            wp.phase = (wp.phase + dt * wp.speed * preSample.speedFactor) % 1;
            const pt = sampleStreamlineAt(wp.streamline, wp.phase);

            wp.mesh.position.set(pt.x, pt.y, pt.z);
            tangentVec.set(pt.tx, pt.ty, pt.tz).normalize();
            wp.mesh.quaternion.setFromUnitVectors(unitX, tangentVec);

            // Elongate streak in high-speed Venturi channels, shorten in wake zones
            const stretch = Math.max(0.65, Math.min(1.65, 0.55 + pt.speedFactor * 0.55));
            wp.mesh.scale.set(stretch, 1, 1);

            const edgeFade = Math.sin(wp.phase * Math.PI);
            const mat = wp.mesh.material as THREE.MeshBasicMaterial;
            // Brighten particle color slightly above streamline color
            mat.color.setRGB(
              Math.min(1, pt.r * 1.15 + 0.08),
              Math.min(1, pt.g * 1.15 + 0.08),
              Math.min(1, pt.b * 1.15 + 0.08),
            );
            mat.opacity = 0.18 + edgeFade * 0.78;
          }

          const nowSec = now * 0.001;
          for (const imp of windImpactRipplesRef.current) {
            const cycle = (nowSec * 0.85 + imp.phaseOffset) % 1;
            const pushOut = 0.4 + cycle * 3.4;
            imp.line.position.set(
              imp.baseX + imp.nx * pushOut,
              imp.baseY,
              imp.baseZ + imp.nz * pushOut,
            );
            const mat = imp.line.material as THREE.LineBasicMaterial;
            mat.opacity = Math.sin(cycle * Math.PI) * 0.78;
          }
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };

      const onVisibilityChange = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = 0;
        } else if (!raf) {
          lastTime = performance.now();
          raf = requestAnimationFrame(animate);
        }
      };

      document.addEventListener('visibilitychange', onVisibilityChange);
      raf = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointerup', onPointerUp);
        resizeObserver.disconnect();
        disposeGroupChildren(maquetteGroup);
        disposeGroupChildren(etchedGroup);
        disposeGroupChildren(domeGroup);
        disposeGroupChildren(ghostGroup);
        disposeGroupChildren(windGroup);
        controls.dispose();
        renderer.dispose();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. Rebuild 3D Pedestal, White Clay Buildings & Etched Roads when `slice`, `showHeatmap`, or `selectedBuildingId` changes
    useEffect(() => {
      const maquetteGroup = maquetteGroupRef.current;
      const etchedGroup = etchedGroupRef.current;
      const sunLight = sunLightRef.current;
      if (!maquetteGroup || !etchedGroup || !slice) return;

      disposeGroupChildren(maquetteGroup);
      disposeGroupChildren(etchedGroup);
      terrainMeshRef.current = null;
      bldMeshRef.current = null;
      triBuildingIdsRef.current = [];

      const { sizeMeters, terrain, buildings, roads, contours } = slice;
      const half = sizeMeters / 2;
      const { cols, rows, heights, groundSunHours } = terrain;
      const pedestalDepth = Math.max(12, sizeMeters * 0.045);

      if (sunLight) {
        const shadowSpan = sizeMeters * 0.75;
        sunLight.shadow.camera.left = -shadowSpan;
        sunLight.shadow.camera.right = shadowSpan;
        sunLight.shadow.camera.top = shadowSpan;
        sunLight.shadow.camera.bottom = -shadowSpan;
        sunLight.shadow.camera.updateProjectionMatrix();
      }

      const sampleLocalY = (x: number, z: number): number => {
        const u = Math.max(0, Math.min(1, (x + half) / sizeMeters));
        const v = Math.max(0, Math.min(1, (z + half) / sizeMeters));
        const c = Math.min(cols - 1, Math.floor(u * (cols - 1)));
        const r = Math.min(rows - 1, Math.floor(v * (rows - 1)));
        return heights[r * cols + c] ?? 0;
      };

      // --- A. Top Terrain Surface Mesh ---
      const terrainGeom = new THREE.BufferGeometry();
      const topPositions = new Float32Array(cols * rows * 3);
      const topColors = new Float32Array(cols * rows * 3);
      const topIndices: number[] = [];

      for (let r = 0; r < rows; r++) {
        const z = -half + (r / (rows - 1)) * sizeMeters;
        for (let c = 0; c < cols; c++) {
          const x = -half + (c / (cols - 1)) * sizeMeters;
          const idx = r * cols + c;
          const y = heights[idx];
          const vOff = idx * 3;
          topPositions[vOff] = x;
          topPositions[vOff + 1] = y;
          topPositions[vOff + 2] = z;

          if (showHeatmap) {
            const [cr, cg, cb] = solarHoursToRgb(groundSunHours[idx] ?? 5);
            topColors[vOff] = cr;
            topColors[vOff + 1] = cg;
            topColors[vOff + 2] = cb;
          } else {
            // Medium-dark Warm Slate Stone ground so white/ivory buildings pop out
            // while keeping enough luminance for crisp dark cast shadows on the ground
            const elevTint = Math.min(0.06, y / 180);
            const radialNorm = Math.min(1, Math.hypot(x, z) / (half * 1.35));
            const edgeVignette = radialNorm * 0.045;
            topColors[vOff] = 0.48 + elevTint * 0.45 - edgeVignette;
            topColors[vOff + 1] = 0.455 + elevTint * 0.42 - edgeVignette;
            topColors[vOff + 2] = 0.42 + elevTint * 0.38 - edgeVignette;
          }
        }
      }

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const i00 = r * cols + c;
          const i10 = r * cols + (c + 1);
          const i01 = (r + 1) * cols + c;
          const i11 = (r + 1) * cols + (c + 1);
          topIndices.push(i00, i01, i10);
          topIndices.push(i10, i01, i11);
        }
      }

      terrainGeom.setAttribute('position', new THREE.BufferAttribute(topPositions, 3));
      terrainGeom.setAttribute('color', new THREE.BufferAttribute(topColors, 3));
      terrainGeom.setIndex(topIndices);
      terrainGeom.computeVertexNormals();

      const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.03,
      });
      const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
      terrainMesh.receiveShadow = true;
      terrainMeshRef.current = terrainMesh;
      maquetteGroup.add(terrainMesh);

      // --- B. Architectural Pedestal Skirt (4 Vertical Cutaway Walls + Base Plinth) ---
      const skirtPos: number[] = [];
      const pushQuad = (
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
      ) => {
        skirtPos.push(
          x1, y1, z1,
          x1, -pedestalDepth, z1,
          x2, y2, z2,
          x2, y2, z2,
          x1, -pedestalDepth, z1,
          x2, -pedestalDepth, z2,
        );
      };

      // North edge (r = 0) & South edge (r = rows - 1)
      for (let c = 0; c < cols - 1; c++) {
        const x0 = -half + (c / (cols - 1)) * sizeMeters;
        const x1 = -half + ((c + 1) / (cols - 1)) * sizeMeters;
        pushQuad(x1, heights[c + 1], -half, x0, heights[c], -half);
        const sr = (rows - 1) * cols;
        pushQuad(x0, heights[sr + c], half, x1, heights[sr + c + 1], half);
      }
      // West edge (c = 0) & East edge (c = cols - 1)
      for (let r = 0; r < rows - 1; r++) {
        const z0 = -half + (r / (rows - 1)) * sizeMeters;
        const z1 = -half + ((r + 1) / (rows - 1)) * sizeMeters;
        pushQuad(-half, heights[r * cols], z0, -half, heights[(r + 1) * cols], z1);
        pushQuad(
          half,
          heights[(r + 1) * cols + (cols - 1)],
          z1,
          half,
          heights[r * cols + (cols - 1)],
          z0,
        );
      }

      const skirtGeom = new THREE.BufferGeometry();
      skirtGeom.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
      skirtGeom.computeVertexNormals();
      const skirtMat = new THREE.MeshStandardMaterial({
        color: 0x524d46,
        roughness: 0.94,
        metalness: 0.05,
      });
      const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
      skirtMesh.receiveShadow = true;
      maquetteGroup.add(skirtMesh);

      // Dark Shadow Plinth Base Plate underneath the pedestal
      const plinthGeom = new THREE.BoxGeometry(sizeMeters * 1.02, 3.2, sizeMeters * 1.02);
      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.72,
        metalness: 0.16,
      });
      const plinthMesh = new THREE.Mesh(plinthGeom, plinthMat);
      plinthMesh.position.set(0, -pedestalDepth - 1.6, 0);
      maquetteGroup.add(plinthMesh);

      // --- C. 3D Compass Bezel Ring Around the Pedestal ---
      const compassRadius = half * 1.12;
      const ringGeom = new THREE.RingGeometry(compassRadius - 1.2, compassRadius, 96);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.y = -pedestalDepth * 0.4;
      maquetteGroup.add(ringMesh);

      // --- D. Extruded 3D White Clay Buildings (Single Batched BufferGeometry + Raycast Face Map) ---
      const bPos: number[] = [];
      const bNorm: number[] = [];
      const bCol: number[] = [];
      const baseFootprintSegs: number[] = [];
      const triBuildingIds: string[] = [];

      const pushTri = (
        buildingId: string,
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number,
        nx: number, ny: number, nz: number,
        r: number, g: number, b: number,
      ) => {
        bPos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        bNorm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        bCol.push(r, g, b, r, g, b, r, g, b);
        triBuildingIds.push(buildingId);
      };

      for (const bld of buildings) {
        const ring = bld.footprint;
        if (ring.length < 3) continue;
        const y0 = bld.groundElevation + bld.baseHeight - 0.4;
        const yContact = bld.groundElevation + Math.max(0.22, bld.baseHeight + 0.22);
        const y1 = bld.groundElevation + bld.height;
        const isSelected = bld.id === selectedBuildingId;

        // Compute signed area in (x, z) to ensure consistent outward normals
        let signedArea = 0;
        for (let i = 0; i < ring.length; i++) {
          const p0 = ring[i];
          const p1 = ring[(i + 1) % ring.length];
          signedArea += p0[0] * p1[1] - p1[0] * p0[1];
        }
        const windingSign = signedArea >= 0 ? 1 : -1;

        // Walls (Crisp Warm Ivory distinct from both the dark slate ground and the bright alabaster roof)
        for (let i = 0; i < ring.length; i++) {
          const p0 = ring[i];
          const p1 = ring[(i + 1) % ring.length];
          baseFootprintSegs.push(p0[0], yContact, p0[1], p1[0], yContact, p1[1]);

          const dx = p1[0] - p0[0];
          const dz = p1[1] - p0[1];
          const len = Math.hypot(dx, dz) || 1;
          const nx = (dz / len) * windingSign;
          const nz = (-dx / len) * windingSign;

          // Subtle directional wall shading so adjacent facades separate cleanly
          const orientShade = (nx * 0.35 - nz * 0.65) * 0.032;

          let wr = 0.93;
          let wg = 0.91;
          let wb = 0.87;
          if (isSelected) {
            wr = 1.0;
            wg = 0.76;
            wb = 0.24;
          } else if (showHeatmap) {
            [wr, wg, wb] = solarHoursToRgb(bld.wallSunHours[i] ?? 4.5);
          } else if (bld.isCustomAdded) {
            wr = 1.0;
            wg = 0.85 + orientShade;
            wb = 0.52 + orientShade;
          } else if (bld.heightSource === 'custom') {
            wr = 0.99;
            wg = 0.90 + orientShade;
            wb = 0.68 + orientShade;
          } else {
            const heightLift = Math.min(0.045, bld.height / 280);
            wr = Math.min(1, 0.925 + heightLift + orientShade);
            wg = Math.min(1, 0.905 + heightLift + orientShade);
            wb = Math.min(1, 0.865 + heightLift + orientShade);
          }

          if (windingSign > 0) {
            pushTri(bld.id, p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1], nx, 0, nz, wr, wg, wb);
            pushTri(bld.id, p0[0], y0, p0[1], p1[0], y1, p1[1], p0[0], y1, p0[1], nx, 0, nz, wr, wg, wb);
          } else {
            pushTri(bld.id, p0[0], y0, p0[1], p1[0], y1, p1[1], p1[0], y0, p1[1], nx, 0, nz, wr, wg, wb);
            pushTri(bld.id, p0[0], y0, p0[1], p0[0], y1, p0[1], p1[0], y1, p1[1], nx, 0, nz, wr, wg, wb);
          }
        }

        // Roof Cap (Bright Alabaster White — distinctly brighter than the ivory walls and slate ground)
        const contour = ring.map(([vx, vz]) => new THREE.Vector2(vx, vz));
        const faces = THREE.ShapeUtils.triangulateShape(contour, []);
        let rr = 1.0;
        let rg = 0.995;
        let rb = 0.985;
        if (isSelected) {
          rr = 1.0;
          rg = 0.88;
          rb = 0.42;
        } else if (showHeatmap) {
          [rr, rg, rb] = solarHoursToRgb(bld.roofSunHours);
        } else if (bld.isCustomAdded) {
          rr = 1.0;
          rg = 0.92;
          rb = 0.68;
        } else if (bld.heightSource === 'custom') {
          rr = 1.0;
          rg = 0.95;
          rb = 0.78;
        }

        for (const [ia, ib, ic] of faces) {
          const a = ring[ia];
          const b = ring[ib];
          const c = ring[ic];
          if (!a || !b || !c) continue;
          const crossY = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (crossY < 0) {
            pushTri(bld.id, a[0], y1, a[1], b[0], y1, b[1], c[0], y1, c[1], 0, 1, 0, rr, rg, rb);
          } else {
            pushTri(bld.id, a[0], y1, a[1], c[0], y1, c[1], b[0], y1, b[1], 0, 1, 0, rr, rg, rb);
          }
        }

        // If selected, add an architectural highlight outline & rooftop elevation beacon
        if (isSelected) {
          const selSegs: number[] = [];
          for (let i = 0; i < ring.length; i++) {
            const p0 = ring[i];
            const p1 = ring[(i + 1) % ring.length];
            // Roof outline
            selSegs.push(p0[0], y1 + 0.25, p0[1], p1[0], y1 + 0.25, p1[1]);
            // Base outline
            selSegs.push(p0[0], y0 + 0.6, p0[1], p1[0], y0 + 0.6, p1[1]);
            // Vertical corner edges
            selSegs.push(p0[0], y0 + 0.6, p0[1], p0[0], y1 + 0.25, p0[1]);
          }
          // Vertical rooftop beacon pole
          selSegs.push(
            bld.centroid[0], y1, bld.centroid[1],
            bld.centroid[0], y1 + 14, bld.centroid[1],
          );
          const selGeom = new THREE.BufferGeometry();
          selGeom.setAttribute('position', new THREE.Float32BufferAttribute(selSegs, 3));
          maquetteGroup.add(
            new THREE.LineSegments(
              selGeom,
              new THREE.LineBasicMaterial({ color: 0xd97706, linewidth: 2 }),
            ),
          );
        }
      }

      if (bPos.length > 0) {
        const bldGeom = new THREE.BufferGeometry();
        bldGeom.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
        bldGeom.setAttribute('normal', new THREE.Float32BufferAttribute(bNorm, 3));
        bldGeom.setAttribute('color', new THREE.Float32BufferAttribute(bCol, 3));

        const bldMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.76,
          metalness: 0.06,
        });
        const bldMesh = new THREE.Mesh(bldGeom, bldMat);
        bldMesh.castShadow = true;
        bldMesh.receiveShadow = true;
        bldMeshRef.current = bldMesh;
        triBuildingIdsRef.current = triBuildingIds;
        maquetteGroup.add(bldMesh);

        // Crisp architectural edge wireframe on building rooflines & corners
        const edgesGeom = new THREE.EdgesGeometry(bldGeom, 22);
        const edgesMat = new THREE.LineBasicMaterial({
          color: showHeatmap ? 0xffffff : 0x44403c,
          transparent: true,
          opacity: showHeatmap ? 0.26 : 0.54,
        });
        const edgesLines = new THREE.LineSegments(edgesGeom, edgesMat);
        maquetteGroup.add(edgesLines);

        // Ground contact footprint outline where each building meets the warm slate terrain
        if (!showHeatmap && baseFootprintSegs.length > 0) {
          const baseGeom = new THREE.BufferGeometry();
          baseGeom.setAttribute('position', new THREE.Float32BufferAttribute(baseFootprintSegs, 3));
          const baseMat = new THREE.LineBasicMaterial({
            color: 0x292524,
            transparent: true,
            opacity: 0.62,
          });
          maquetteGroup.add(new THREE.LineSegments(baseGeom, baseMat));
        }
      }

      // --- E. High-Contrast Light Stone Etched Roads & Contours on Warm Slate Ground ---
      const majorRoadSegs: number[] = [];
      const minorRoadSegs: number[] = [];

      for (const road of roads) {
        const target = road.kind === 'major' ? majorRoadSegs : minorRoadSegs;
        for (let i = 0; i < road.points.length - 1; i++) {
          const [x0, z0] = road.points[i];
          const [x1, z1] = road.points[i + 1];
          const y0 = sampleLocalGround(x0, z0) + 0.28;
          const y1 = sampleLocalGround(x1, z1) + 0.28;
          target.push(x0, y0, z0, x1, y1, z1);
        }
      }

      function sampleLocalGround(x: number, z: number): number {
        return sampleLocalY(x, z);
      }

      if (majorRoadSegs.length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(majorRoadSegs, 3));
        etchedGroup.add(
          new THREE.LineSegments(
            g,
            new THREE.LineBasicMaterial({ color: 0xe7e2d8, transparent: true, opacity: 0.82 }),
          ),
        );
      }

      if (minorRoadSegs.length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(minorRoadSegs, 3));
        etchedGroup.add(
          new THREE.LineSegments(
            g,
            new THREE.LineBasicMaterial({ color: 0xc7c0b6, transparent: true, opacity: 0.56 }),
          ),
        );
      }

      const contourSegs: number[] = [];
      for (const cnt of contours) {
        const s = cnt.segments;
        for (let i = 0; i < s.length; i += 4) {
          const x0 = s[i];
          const z0 = s[i + 1];
          const x1 = s[i + 2];
          const z1 = s[i + 3];
          contourSegs.push(x0, cnt.elevation + 0.2, z0, x1, cnt.elevation + 0.2, z1);
        }
      }
      if (contourSegs.length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(contourSegs, 3));
        etchedGroup.add(
          new THREE.LineSegments(
            g,
            new THREE.LineBasicMaterial({ color: 0xd6c7b2, transparent: true, opacity: 0.52 }),
          ),
        );
      }

      etchedGroup.visible = showEtchedRoads;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slice, showHeatmap, selectedBuildingId]);

    // 3. Rebuild 3D Sun-Path Heliodon Dome when `slice` or `date` changes
    useEffect(() => {
      const domeGroup = domeGroupRef.current;
      if (!domeGroup || !slice) return;

      disposeGroupChildren(domeGroup);

      const domeRadius = slice.sizeMeters * 0.62;
      const { centerLat, centerLng } = slice;

      const buildDayArc = (targetDate: Date, colorHex: number, opacity: number) => {
        const pts: THREE.Vector3[] = [];
        for (let m = 5 * 60; m <= 19.5 * 60; m += 10) {
          const d = new Date(targetDate);
          d.setHours(Math.floor(m / 60), m % 60, 0, 0);
          const pos = getSunPosition(d, centerLat, centerLng);
          if (pos.altitudeDeg >= -1) {
            pts.push(sphericalSunToXYZ(pos.compassAzimuthDeg, Math.max(0, pos.altitudeDeg), domeRadius));
          }
        }
        if (pts.length < 2) return;
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity,
        });
        domeGroup.add(new THREE.Line(geom, mat));
      };

      const year = date.getFullYear();
      // Summer Solstice (June 21)
      buildDayArc(new Date(year, 5, 21), 0xf59e0b, 0.45);
      // Winter Solstice (Dec 21)
      buildDayArc(new Date(year, 11, 21), 0x38bdf8, 0.45);
      // Selected Date Arc (Bright primary rail)
      buildDayArc(date, 0xfbbf24, 0.95);

      // Hourly Analemma vertical connectors (07:00 to 17:00)
      const hourSegs: number[] = [];
      for (let hr = 7; hr <= 17; hr++) {
        const dSum = new Date(year, 5, 21, hr, 0, 0);
        const dWin = new Date(year, 11, 21, hr, 0, 0);
        const pSum = getSunPosition(dSum, centerLat, centerLng);
        const pWin = getSunPosition(dWin, centerLat, centerLng);
        if (pSum.altitudeDeg > 0 && pWin.altitudeDeg > 0) {
          const v1 = sphericalSunToXYZ(pSum.compassAzimuthDeg, pSum.altitudeDeg, domeRadius);
          const v2 = sphericalSunToXYZ(pWin.compassAzimuthDeg, pWin.altitudeDeg, domeRadius);
          hourSegs.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        }
      }
      if (hourSegs.length > 0) {
        const hg = new THREE.BufferGeometry();
        hg.setAttribute('position', new THREE.Float32BufferAttribute(hourSegs, 3));
        domeGroup.add(
          new THREE.LineSegments(
            hg,
            new THREE.LineBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.25 }),
          ),
        );
      }

      // Glowing 3D Sun Orb + Volumetric Ray Line to Center
      const orbGeom = new THREE.SphereGeometry(slice.sizeMeters * 0.028, 24, 24);
      const orbMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const orbMesh = new THREE.Mesh(orbGeom, orbMat);
      domeGroup.add(orbMesh);
      sunOrbRef.current = orbMesh;

      const rayGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 100, 0),
        new THREE.Vector3(0, 0, 0),
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.55,
      });
      const rayLine = new THREE.Line(rayGeom, rayMat);
      domeGroup.add(rayLine);
      sunRayLineRef.current = rayLine;

      domeGroup.visible = showSunDome;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slice, date]);

    // 4. Rebuild 3D Building-Aware Wind Streamlines & Impact Zones when `slice`, `wind`, or `showWind3D` changes
    useEffect(() => {
      const windGroup = windGroupRef.current;
      if (!windGroup || !slice) return;

      disposeGroupChildren(windGroup);
      windParticlesRef.current = [];
      windImpactRipplesRef.current = [];

      windGroup.visible = showWind3D;
      if (!showWind3D || !wind) return;

      const flow = compute3DWindFlowField(slice, wind.towardDeg, wind.speedKmh || 12);

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.52,
      });

      const chevronPositions: number[] = [];
      const chevronColors: number[] = [];

      const streakGeom = new THREE.CapsuleGeometry(0.78, 7.2, 4, 8);
      streakGeom.rotateZ(Math.PI / 2);

      for (let i = 0; i < flow.streamlines.length; i++) {
        const sl = flow.streamlines[i];
        const pts = sl.points;
        const posArr = new Float32Array(pts.length * 3);
        const colArr = new Float32Array(pts.length * 3);

        for (let p = 0; p < pts.length; p++) {
          const pt = pts[p];
          posArr[p * 3] = pt.x;
          posArr[p * 3 + 1] = pt.y;
          posArr[p * 3 + 2] = pt.z;
          colArr[p * 3] = pt.r;
          colArr[p * 3 + 1] = pt.g;
          colArr[p * 3 + 2] = pt.b;
        }

        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        lg.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
        windGroup.add(new THREE.Line(lg, lineMat));

        // Add subtle directional chevron arrowheads along each streamline
        for (const u of [0.32, 0.68]) {
          const sample = sampleStreamlineAt(sl, u);
          const wingLen = 2.6;
          const wingSpread = 1.45;
          let px = -sample.tz;
          let pz = sample.tx;
          const pLen = Math.hypot(px, pz) || 1;
          px /= pLen;
          pz /= pLen;

          const tipX = sample.x + sample.tx * 1.2;
          const tipY = sample.y + sample.ty * 1.2;
          const tipZ = sample.z + sample.tz * 1.2;

          const backX = tipX - sample.tx * wingLen;
          const backY = tipY - sample.ty * wingLen;
          const backZ = tipZ - sample.tz * wingLen;

          chevronPositions.push(
            tipX, tipY, tipZ,
            backX + px * wingSpread, backY, backZ + pz * wingSpread,
            tipX, tipY, tipZ,
            backX - px * wingSpread, backY, backZ - pz * wingSpread,
          );
          for (let c = 0; c < 4; c++) {
            chevronColors.push(sample.r, sample.g, sample.b);
          }
        }

        // Spawn 2 curve-following animated wind particles per streamline
        const particlesPerLine = 2;
        for (let k = 0; k < particlesPerLine; k++) {
          const pMat = new THREE.MeshBasicMaterial({
            color: 0x5eead4,
            transparent: true,
            opacity: 0.85,
          });
          const pMesh = new THREE.Mesh(streakGeom, pMat);
          windGroup.add(pMesh);

          windParticlesRef.current.push({
            mesh: pMesh,
            streamline: sl,
            phase: (i * 0.13 + k * 0.5 + sl.layerIndex * 0.21) % 1,
            speed: sl.baseSpeed,
          });
        }
      }

      if (chevronPositions.length > 0) {
        const cg = new THREE.BufferGeometry();
        cg.setAttribute('position', new THREE.Float32BufferAttribute(chevronPositions, 3));
        cg.setAttribute('color', new THREE.Float32BufferAttribute(chevronColors, 3));
        windGroup.add(
          new THREE.LineSegments(
            cg,
            new THREE.LineBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.68,
            }),
          ),
        );
      }

      // Render Windward Facade Impact Shields & Expanding Pressure Ripples
      if (flow.impactMarkers.length > 0) {
        const staticShieldSegs: number[] = [];
        for (let m = 0; m < flow.impactMarkers.length; m++) {
          const mk = flow.impactMarkers[m];
          const halfSpan = mk.span * 0.42;
          const x0 = -mk.tx * halfSpan;
          const z0 = -mk.tz * halfSpan;
          const x1 = mk.tx * halfSpan;
          const z1 = mk.tz * halfSpan;

          // Static glowing amber pressure bar on the windward facade
          staticShieldSegs.push(
            mk.x + x0, mk.y, mk.z + z0,
            mk.x + x1, mk.y, mk.z + z1,
            mk.x + x0 * 0.7, mk.y + 1.8, mk.z + z0 * 0.7,
            mk.x + x1 * 0.7, mk.y + 1.8, mk.z + z1 * 0.7,
          );

          // 3-segment curved pressure ripple bracket in local wall coordinates
          const bow = 1.15;
          const xm0 = x0 * 0.45 + mk.nx * bow;
          const zm0 = z0 * 0.45 + mk.nz * bow;
          const xm1 = x1 * 0.45 + mk.nx * bow;
          const zm1 = z1 * 0.45 + mk.nz * bow;
          const bracketSegs = new Float32Array([
            x0, 0, z0,
            xm0, 0, zm0,
            xm0, 0, zm0,
            xm1, 0, zm1,
            xm1, 0, zm1,
            x1, 0, z1,
          ]);
          const rg = new THREE.BufferGeometry();
          rg.setAttribute('position', new THREE.BufferAttribute(bracketSegs, 3));
          const rLine = new THREE.LineSegments(
            rg,
            new THREE.LineBasicMaterial({
              color: 0xf59e0b,
              transparent: true,
              opacity: 0.65,
            }),
          );
          rLine.position.set(mk.x, mk.y, mk.z);
          windGroup.add(rLine);

          windImpactRipplesRef.current.push({
            line: rLine,
            baseX: mk.x,
            baseY: mk.y,
            baseZ: mk.z,
            nx: mk.nx,
            nz: mk.nz,
            phaseOffset: (m * 0.19) % 1,
          });
        }

        if (staticShieldSegs.length > 0) {
          const sg = new THREE.BufferGeometry();
          sg.setAttribute('position', new THREE.Float32BufferAttribute(staticShieldSegs, 3));
          windGroup.add(
            new THREE.LineSegments(
              sg,
              new THREE.LineBasicMaterial({
                color: 0xf97316,
                transparent: true,
                opacity: 0.78,
              }),
            ),
          );
        }
      }
    }, [slice, wind, showWind3D]);

    // 5. Update Sun/Moon Lighting, Orb Position & Dual-Solstice Ghost Shadows at 60 FPS on `date` or `time` change
    useEffect(() => {
      if (!slice) return;
      const datetime = combineDateAndTime(date, time);
      const sky = getSkyLighting(datetime, slice.centerLat, slice.centerLng);
      const { cast, period } = sky;

      const sunLight = sunLightRef.current;
      const hemiLight = hemiLightRef.current;
      const orb = sunOrbRef.current;
      const rayLine = sunRayLineRef.current;
      const domeRadius = slice.sizeMeters * 0.62;

      if (sunLight && hemiLight) {
        const altDeg = Math.max(4, cast.altitudeDeg);
        const sunPos = sphericalSunToXYZ(cast.compassAzimuthDeg, altDeg, domeRadius);
        sunLight.position.copy(sunPos);

        if (period === 'goldenHour') {
          sunLight.color.setHex(0xff9e44);
          sunLight.intensity = 2.1;
          hemiLight.color.setHex(0xffe4c4);
          hemiLight.groundColor.setHex(0x9a8c7e);
        } else if (period === 'twilight') {
          sunLight.color.setHex(0xc084fc);
          sunLight.intensity = 0.9;
          hemiLight.color.setHex(0x818cf8);
          hemiLight.groundColor.setHex(0x475569);
        } else if (period === 'night' || period === 'moonlight') {
          sunLight.color.setHex(0x7dd3fc);
          sunLight.intensity = period === 'moonlight' ? 0.75 : 0.25;
          hemiLight.color.setHex(0x38bdf8);
          hemiLight.groundColor.setHex(0x1e293b);
        } else {
          sunLight.color.setHex(0xfffbeb);
          sunLight.intensity = 1.95;
          hemiLight.color.setHex(0xffffff);
          hemiLight.groundColor.setHex(0xd6d3cd);
        }
      }

      if (orb && rayLine) {
        const displayAlt = Math.max(0, sky.sun.altitudeDeg);
        const orbPos = sphericalSunToXYZ(sky.sun.compassAzimuthDeg, displayAlt, domeRadius);
        orb.position.copy(orbPos);
        const orbMat = orb.material as THREE.MeshBasicMaterial;
        orbMat.color.setHex(
          period === 'goldenHour' ? 0xf97316 : sky.sun.altitudeDeg < 0 ? 0x38bdf8 : 0xfbbf24,
        );

        const posAttr = rayLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, orbPos.x, orbPos.y, orbPos.z);
        posAttr.setXYZ(1, 0, 2, 0);
        posAttr.needsUpdate = true;
      }

      if (cameraPresetRef.current === 'sun') {
        applyCameraPreset('sun', slice.sizeMeters);
      }

      // Rebuild Dual-Solstice Ghost Shadows (throttled to 2-minute buckets when enabled)
      const ghostGroup = ghostGroupRef.current;
      if (ghostGroup) {
        ghostGroup.visible = showGhostSolstice;
        if (!showGhostSolstice) {
          if (ghostGroup.children.length > 0) {
            disposeGroupChildren(ghostGroup);
            lastGhostKeyRef.current = '';
          }
        } else if (slice.buildings.length > 0) {
          const minBucket = Math.floor((time.getHours() * 60 + time.getMinutes()) / 2);
          const ghostKey = `${slice.centerLat.toFixed(4)}:${slice.centerLng.toFixed(4)}:${slice.sizeMeters}:${slice.buildings.length}:${date.getFullYear()}:${minBucket}`;
          if (ghostKey !== lastGhostKeyRef.current) {
            lastGhostKeyRef.current = ghostKey;
            disposeGroupChildren(ghostGroup);

            const buildSolsticeGhost = (monthIdx: number, colorHex: number, yOffset: number) => {
              const d = new Date(date.getFullYear(), monthIdx, 21, time.getHours(), time.getMinutes());
              const pos = getSunPosition(d, slice.centerLat, slice.centerLng);
              if (pos.altitudeDeg <= 3) return;
              const altRad = (pos.altitudeDeg * Math.PI) / 180;
              const towardRad = ((pos.compassAzimuthDeg + 180) * Math.PI) / 180;
              const ratio = Math.min(4.5, 1 / Math.tan(altRad));
              const dirX = Math.sin(towardRad);
              const dirZ = -Math.cos(towardRad);

              const segs: number[] = [];
              for (const b of slice.buildings.slice(0, 90)) {
                const len = Math.min(140, b.height * ratio);
                const ox = dirX * len;
                const oz = dirZ * len;
                const y = b.groundElevation + yOffset;
                const ring = b.footprint;
                for (let i = 0; i < ring.length; i++) {
                  const p0 = ring[i];
                  const p1 = ring[(i + 1) % ring.length];
                  segs.push(
                    p0[0] + ox, y, p0[1] + oz,
                    p1[0] + ox, y, p1[1] + oz,
                  );
                }
              }
              if (segs.length > 0) {
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
                ghostGroup.add(
                  new THREE.LineSegments(
                    g,
                    new THREE.LineBasicMaterial({
                      color: colorHex,
                      transparent: true,
                      opacity: 0.72,
                    }),
                  ),
                );
              }
            };

            // Summer Solstice (Amber Gold) & Winter Solstice (Cyan Blue)
            buildSolsticeGhost(5, 0xf59e0b, 0.55);
            buildSolsticeGhost(11, 0x38bdf8, 0.75);
          }
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slice, date, time, showGhostSolstice]);

    // 6. Update visibility flags and camera presets
    useEffect(() => {
      if (domeGroupRef.current) domeGroupRef.current.visible = showSunDome;
      if (etchedGroupRef.current) etchedGroupRef.current.visible = showEtchedRoads;
      if (windGroupRef.current) windGroupRef.current.visible = showWind3D;
      if (ghostGroupRef.current) ghostGroupRef.current.visible = showGhostSolstice;
    }, [showSunDome, showEtchedRoads, showWind3D, showGhostSolstice]);

    useEffect(() => {
      applyCameraPreset(cameraPreset, slice?.sizeMeters ?? 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraPreset, slice?.sizeMeters]);

    return (
      <div
        ref={containerRef}
        className={
          isPlacementMode
            ? 'relative h-full w-full cursor-crosshair'
            : 'relative h-full w-full cursor-grab active:cursor-grabbing'
        }
      />
    );
  },
);

WhiteClayCanvas.displayName = 'WhiteClayCanvas';
export default WhiteClayCanvas;
