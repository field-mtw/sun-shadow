import type { ClayAreaSlice } from './clay-extractor';

export interface WindStreamlinePoint {
  x: number;
  y: number;
  z: number;
  /** Tangential unit vector along the streamline */
  tx: number;
  ty: number;
  tz: number;
  /** Relative local wind speed multiplier (e.g., 0.45 in wake, 1.0 normal, 1.65 in Venturi/deflection) */
  speedFactor: number;
  /** 0 = normal freestream, >0 = impact/Venturi acceleration (0..1), <0 = leeward wake (-1..0) */
  regime: number;
  /**RGB color [0..1] for vertex coloring */
  r: number;
  g: number;
  b: number;
}

export interface WindStreamline {
  points: WindStreamlinePoint[];
  cumulativeLengths: Float32Array;
  totalLength: number;
  baseSpeed: number;
  layerIndex: number;
}

export interface WindImpactMarker {
  /** Center of windward impact on building wall */
  x: number;
  y: number;
  z: number;
  /** Wall outward normal (windward face) */
  nx: number;
  nz: number;
  /** Wall tangent */
  tx: number;
  tz: number;
  /** Width of the windward wall segment */
  span: number;
  /** Intensity 0..1 */
  intensity: number;
}

export interface WindFlowFieldResult {
  streamlines: WindStreamline[];
  impactMarkers: WindImpactMarker[];
}

interface PreparedObstacle {
  id: string;
  footprint: [number, number][];
  cx: number;
  cz: number;
  baseY: number;
  roofY: number;
  height: number;
  radius: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function pointInPolygon2D(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Finds the closest point on a 2D polygon boundary to (px, pz),
 * returning closest point (cx, cz), outward unit normal (nx, nz), distance, and inside flag.
 */
function closestPointOnPolygon(
  px: number,
  pz: number,
  obs: PreparedObstacle,
): {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
  dist: number;
  inside: boolean;
} {
  const ring = obs.footprint;
  let minDistSq = Infinity;
  let bestCx = px;
  let bestCz = pz;
  let bestEdgeDx = 1;
  let bestEdgeDz = 0;

  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % n];
    const edx = bx - ax;
    const edz = bz - az;
    const lenSq = edx * edx + edz * edz;
    let t = 0;
    if (lenSq > 1e-8) {
      t = Math.max(0, Math.min(1, ((px - ax) * edx + (pz - az) * edz) / lenSq));
    }
    const qx = ax + t * edx;
    const qz = az + t * edz;
    const dx = px - qx;
    const dz = pz - qz;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestCx = qx;
      bestCz = qz;
      bestEdgeDx = edx;
      bestEdgeDz = edz;
    }
  }

  const inside = pointInPolygon2D(px, pz, ring);
  const dist = Math.sqrt(minDistSq);

  let nx = px - bestCx;
  let nz = pz - bestCz;
  if (inside) {
    nx = -nx;
    nz = -nz;
  }
  const nLen = Math.hypot(nx, nz);
  if (nLen > 1e-5) {
    nx /= nLen;
    nz /= nLen;
  } else {
    // Fallback to perpendicular of edge pointing away from centroid
    const eLen = Math.hypot(bestEdgeDx, bestEdgeDz) || 1;
    nx = -bestEdgeDz / eLen;
    nz = bestEdgeDx / eLen;
    const toOutX = bestCx - obs.cx;
    const toOutZ = bestCz - obs.cz;
    if (nx * toOutX + nz * toOutZ < 0) {
      nx = -nx;
      nz = -nz;
    }
  }

  return { cx: bestCx, cz: bestCz, nx, nz, dist, inside };
}

function lerpColor(
  r0: number,
  g0: number,
  b0: number,
  r1: number,
  g1: number,
  b1: number,
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
}

/**
 * Maps aerodynamic regime (-1 = leeward wake, 0 = normal freestream, +1 = impact/Venturi acceleration)
 * to high-contrast architectural streamline RGB colors.
 */
function colorForRegime(regime: number): [number, number, number] {
  // Normal Freestream: Bright Mint-Cyan (#2dd4bf -> [0.176, 0.831, 0.749])
  const normR = 0.18;
  const normG = 0.84;
  const normB = 0.76;

  if (regime >= 0) {
    // Impact / Venturi Acceleration: Warm Amber Gold -> Vibrant Coral Orange (#f59e0b -> #f97316)
    const accR = 0.98;
    const accG = 0.56;
    const accB = 0.12;
    return lerpColor(normR, normG, normB, accR, accG, accB, Math.min(1, regime * 1.15));
  } else {
    // Leeward Wake / Wind Shadow: Deep Indigo-Blue (#3b82f6 -> #4f46e5)
    const wakeR = 0.26;
    const wakeG = 0.44;
    const wakeB = 0.96;
    return lerpColor(normR, normG, normB, wakeR, wakeG, wakeB, Math.min(1, -regime * 1.2));
  }
}

/**
 * Generates 3D building-aware aerodynamic streamlines (Lateral Flow-Around, Over-Roof Lofting,
 * Venturi Canyon Acceleration, and Leeward Wake Turbulence) plus Windward Facade Impact Markers.
 */
export function compute3DWindFlowField(
  slice: ClayAreaSlice,
  windTowardDeg: number,
  windSpeedKmh: number,
): WindFlowFieldResult {
  const { sizeMeters, buildings, terrain } = slice;
  const half = sizeMeters / 2;
  const { cols, rows, heights } = terrain;

  const sampleGroundY = (x: number, z: number): number => {
    const u = Math.max(0, Math.min(1, (x + half) / sizeMeters));
    const v = Math.max(0, Math.min(1, (z + half) / sizeMeters));
    const c = Math.min(cols - 1, Math.floor(u * (cols - 1)));
    const r = Math.min(rows - 1, Math.floor(v * (rows - 1)));
    return heights[r * cols + c] ?? 0;
  };

  // 1. Prepare obstacle metadata
  const obstacles: PreparedObstacle[] = [];
  for (const bld of buildings) {
    if (bld.footprint.length < 3 || bld.height < 2) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxR2 = 0;
    const [cx, cz] = bld.centroid;
    for (const [px, pz] of bld.footprint) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
      const d2 = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (d2 > maxR2) maxR2 = d2;
    }
    const radius = Math.max(4, Math.sqrt(maxR2));
    obstacles.push({
      id: bld.id,
      footprint: bld.footprint,
      cx,
      cz,
      baseY: bld.groundElevation,
      roofY: bld.groundElevation + bld.height,
      height: bld.height,
      radius,
      minX,
      maxX,
      minZ,
      maxZ,
    });
  }

  const rad = (windTowardDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirZ = -Math.cos(rad);
  // Right-hand perpendicular vector in XZ plane
  const perpX = -dirZ;
  const perpZ = dirX;

  /**
   * Evaluates the 3D aerodynamic velocity and flow regime at (x, y, z)
   */
  const evaluateFlowAt = (
    x: number,
    y: number,
    z: number,
    targetLayerAlt: number,
    laneSeed: number,
  ): {
    vx: number;
    vy: number;
    vz: number;
    speedFactor: number;
    regime: number;
  } => {
    let vx = dirX;
    let vy = 0;
    let vz = dirZ;
    let speedFactor = 1.0;
    let impactAccum = 0;
    let wakeAccum = 0;
    let lateralSqueezeCount = 0;

    const groundY = sampleGroundY(x, z);
    const desiredBaseY = groundY + targetLayerAlt;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      // Skip if streamline is well above this building's roof
      if (y > obs.roofY + 9) continue;

      const influenceRange = Math.min(55, Math.max(18, obs.radius * 2.1));
      if (
        x < obs.minX - influenceRange ||
        x > obs.maxX + influenceRange ||
        z < obs.minZ - influenceRange ||
        z > obs.maxZ + influenceRange
      ) {
        continue;
      }

      const relX = x - obs.cx;
      const relZ = z - obs.cz;
      // Projection along wind direction (negative = upwind/windward, positive = downwind/leeward)
      const alongWind = relX * dirX + relZ * dirZ;
      // Signed lateral offset from building center relative to wind
      const crossWind = relX * perpX + relZ * perpZ;

      const { cx, cz, nx, nz, dist, inside } = closestPointOnPolygon(x, z, obs);
      const signedDist = inside ? -dist : dist;

      const depthBelowRoof = obs.roofY - y;
      // Determine if the streamline can loft over the roof (low building or near upper 45% of roof)
      const canLoftOverRoof =
        depthBelowRoof < Math.min(16, obs.height * 0.48) || obs.height <= targetLayerAlt + 10;

      // 1. Direct collision / near-wall deflection zone
      const wallReach = Math.min(34, Math.max(12, obs.radius * 1.25));
      if (signedDist < wallReach && depthBelowRoof > -3.5) {
        const proximity = Math.max(0, Math.min(1, 1 - Math.max(0, signedDist) / wallReach));
        const proxSq = proximity * proximity;

        // Windward alignment: how strongly wind blows into this wall normal
        const windDotNormal = dirX * nx + dirZ * nz; // < 0 means windward wall

        if (canLoftOverRoof && alongWind < obs.radius * 0.65) {
          // Over-Roof Lofting: pitch upward smoothly to clear the roof
          const neededLift = Math.max(0, obs.roofY + 3.8 - y);
          vy += (0.45 + Math.min(0.85, neededLift * 0.08)) * proximity * 1.35;
          // Slight lateral spread as well
          const sideSign = crossWind >= 0 ? 1 : -1;
          vx += perpX * sideSign * 0.22 * proxSq;
          vz += perpZ * sideSign * 0.22 * proxSq;
          speedFactor += 0.28 * proximity;
          impactAccum = Math.max(impactAccum, proximity * 0.85);
        } else if (depthBelowRoof > 0) {
          // Lateral Flow-Around: deflect tangentially around the building perimeter
          // Two possible tangents to the wall normal (nx, nz):
          const t1x = -nz;
          const t1z = nx;
          const t2x = nz;
          const t2z = -nx;
          // Choose tangent that continues downstream with wind, breaking dead-center symmetry via crossWind
          const dot1 = t1x * dirX + t1z * dirZ;
          const dot2 = t2x * dirX + t2z * dirZ;
          let tx = dot1 >= dot2 ? t1x : t2x;
          let tz = dot1 >= dot2 ? t1z : t2z;

          // If nearly head-on stagnation (|dot1 - dot2| small), pick side based on crossWind center offset
          if (Math.abs(dot1 - dot2) < 0.25) {
            const sideSign = crossWind >= 0 ? 1 : -1;
            const sideX = perpX * sideSign;
            const sideZ = perpZ * sideSign;
            if (t1x * sideX + t1z * sideZ > t2x * sideX + t2z * sideZ) {
              tx = t1x;
              tz = t1z;
            } else {
              tx = t2x;
              tz = t2z;
            }
          }

          // Blend tangential deflection + strong outward normal repulsion when very close
          const deflectWeight = Math.min(1, proxSq * 1.65);
          const repulseWeight = signedDist < 4.5 ? Math.min(1.2, (4.5 - signedDist) * 0.35) : 0;

          vx = vx * (1 - deflectWeight * 0.82) + tx * deflectWeight * 1.15 + nx * repulseWeight;
          vz = vz * (1 - deflectWeight * 0.82) + tz * deflectWeight * 1.15 + nz * repulseWeight;

          // Corner / Windward acceleration
          if (windDotNormal < -0.15) {
            impactAccum = Math.max(impactAccum, proximity);
            speedFactor += 0.32 * proximity;
          } else if (Math.abs(windDotNormal) <= 0.45) {
            // Side wall skimming / corner acceleration
            lateralSqueezeCount++;
            speedFactor += 0.25 * proximity;
            impactAccum = Math.max(impactAccum, proximity * 0.78);
          }
        }
      }

      // 2. Leeward Wake / Wind Shadow Vortex Zone behind the building
      const wakeLength = Math.min(75, Math.max(22, obs.radius * 2.4));
      const wakeHalfWidth = obs.radius * 1.05;
      if (
        depthBelowRoof > 0 &&
        alongWind > 0 &&
        alongWind < wakeLength &&
        Math.abs(crossWind) < wakeHalfWidth
      ) {
        const alongFade = 1 - alongWind / wakeLength;
        const crossFade = 1 - Math.abs(crossWind) / wakeHalfWidth;
        const wakeStrength = alongFade * crossFade;
        wakeAccum = Math.max(wakeAccum, wakeStrength);
        speedFactor *= 1 - 0.46 * wakeStrength;

        // Subtle Karman vortex inward curl behind building
        const vortexWave =
          Math.sin(alongWind * 0.18 + laneSeed * 2.1) * 0.38 * wakeStrength -
          Math.sign(crossWind) * 0.22 * wakeStrength;
        vx += perpX * vortexWave;
        vz += perpZ * vortexWave;
      }

      // 3. Hard No-Penetration Projection (if inside polygon below roof)
      if (inside && y < obs.roofY + 1.2) {
        if (canLoftOverRoof && y >= obs.roofY - 5) {
          vy = Math.max(vy, 0.8);
        } else {
          vx = nx * 1.2 + perpX * (crossWind >= 0 ? 0.5 : -0.5);
          vz = nz * 1.2 + perpZ * (crossWind >= 0 ? 0.5 : -0.5);
        }
      }
    }

    // Venturi Canyon bonus when squeezed between multiple buildings
    if (lateralSqueezeCount >= 2) {
      speedFactor += 0.35;
      impactAccum = Math.max(impactAccum, 0.92);
    }

    // Gentle vertical recovery toward equilibrium layer height when clear of roofs
    if (Math.abs(vy) < 0.08) {
      const yDiff = desiredBaseY - y;
      vy += Math.max(-0.28, Math.min(0.28, yDiff * 0.055));
    }

    const vLen = Math.hypot(vx, vy, vz) || 1;
    vx /= vLen;
    vy /= vLen;
    vz /= vLen;

    speedFactor = Math.max(0.42, Math.min(1.85, speedFactor));
    const regime =
      impactAccum >= wakeAccum
        ? Math.min(1, impactAccum)
        : -Math.min(1, wakeAccum * 1.15);

    return { vx, vy, vz, speedFactor, regime };
  };

  /**
   * Ensures a 3D point never stays inside any building volume below its roof
   */
  const enforceOutsideObstacles = (
    x: number,
    y: number,
    z: number,
  ): [number, number, number] => {
    let px = x;
    let py = y;
    let pz = z;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (py >= obs.roofY + 1.4) continue;
      if (px < obs.minX - 2 || px > obs.maxX + 2 || pz < obs.minZ - 2 || pz > obs.maxZ + 2) {
        continue;
      }
      const { cx, cz, nx, nz, dist, inside } = closestPointOnPolygon(px, pz, obs);
      if (inside) {
        if (obs.roofY - py < 5.5) {
          py = obs.roofY + 1.8;
        } else {
          px = cx + nx * 2.2;
          pz = cz + nz * 2.2;
        }
      } else if (dist < 1.6 && py < obs.roofY) {
        px = cx + nx * 1.7;
        pz = cz + nz * 1.7;
      }
    }

    const gY = sampleGroundY(px, pz) + 2.2;
    if (py < gY) py = gY;
    return [px, py, pz];
  };

  // 2. Trace Streamlines across 3 altitude tiers and 17 lateral lanes
  const laneCount = 17;
  const altitudeTiers = [9, 24, 44];
  const stepMeters = Math.max(3.2, sizeMeters / 95);
  const maxSteps = Math.ceil((sizeMeters * 1.04) / stepMeters);
  const startSpan = sizeMeters * 0.47;

  const streamlines: WindStreamline[] = [];
  const normalizedBaseSpeed = 0.16 + Math.min(0.45, (windSpeedKmh || 12) / 50);

  for (let lv = 0; lv < altitudeTiers.length; lv++) {
    const targetAlt = altitudeTiers[lv];
    for (let l = 0; l < laneCount; l++) {
      // Stagger alternate vertical tiers slightly so streamlines fill the 3D volume naturally
      const laneFrac = (l + (lv % 2) * 0.35) / (laneCount - 1) - 0.5;
      const lateralOffset = laneFrac * sizeMeters * 0.84;

      let x = -dirX * startSpan + perpX * lateralOffset;
      let z = -dirZ * startSpan + perpZ * lateralOffset;
      let y = sampleGroundY(x, z) + targetAlt;
      [x, y, z] = enforceOutsideObstacles(x, y, z);

      const rawPoints: WindStreamlinePoint[] = [];

      for (let step = 0; step < maxSteps; step++) {
        // Check if streamline exited the maquette bounds
        if (Math.abs(x) > half * 0.98 || Math.abs(z) > half * 0.98) {
          if (step > 8) break;
        }

        // RK2 (Midpoint integration) for smooth curves around corners
        const f1 = evaluateFlowAt(x, y, z, targetAlt, l + lv * 7);
        const midX = x + f1.vx * (stepMeters * 0.5);
        const midY = y + f1.vy * (stepMeters * 0.5);
        const midZ = z + f1.vz * (stepMeters * 0.5);
        const f2 = evaluateFlowAt(midX, midY, midZ, targetAlt, l + lv * 7);

        const [r, g, b] = colorForRegime(f2.regime);

        rawPoints.push({
          x,
          y,
          z,
          tx: f2.vx,
          ty: f2.vy,
          tz: f2.vz,
          speedFactor: f2.speedFactor,
          regime: f2.regime,
          r,
          g,
          b,
        });

        x += f2.vx * stepMeters;
        y += f2.vy * stepMeters;
        z += f2.vz * stepMeters;
        [x, y, z] = enforceOutsideObstacles(x, y, z);
      }

      if (rawPoints.length < 6) continue;

      // Smooth positions with a 3-point moving average pass (while respecting obstacles)
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < rawPoints.length - 1; i++) {
          const prev = rawPoints[i - 1];
          const curr = rawPoints[i];
          const next = rawPoints[i + 1];
          const sx = curr.x * 0.5 + (prev.x + next.x) * 0.25;
          const sy = curr.y * 0.5 + (prev.y + next.y) * 0.25;
          const sz = curr.z * 0.5 + (prev.z + next.z) * 0.25;
          const [cx, cy, cz] = enforceOutsideObstacles(sx, sy, sz);
          curr.x = cx;
          curr.y = cy;
          curr.z = cz;
        }
      }

      // Recompute accurate unit tangents and cumulative arc lengths
      const cumLengths = new Float32Array(rawPoints.length);
      let totalLen = 0;
      for (let i = 0; i < rawPoints.length; i++) {
        if (i > 0) {
          const dx = rawPoints[i].x - rawPoints[i - 1].x;
          const dy = rawPoints[i].y - rawPoints[i - 1].y;
          const dz = rawPoints[i].z - rawPoints[i - 1].z;
          totalLen += Math.hypot(dx, dy, dz);
        }
        cumLengths[i] = totalLen;

        const pPrev = rawPoints[Math.max(0, i - 1)];
        const pNext = rawPoints[Math.min(rawPoints.length - 1, i + 1)];
        let tx = pNext.x - pPrev.x;
        let ty = pNext.y - pPrev.y;
        let tz = pNext.z - pPrev.z;
        const tLen = Math.hypot(tx, ty, tz) || 1;
        rawPoints[i].tx = tx / tLen;
        rawPoints[i].ty = ty / tLen;
        rawPoints[i].tz = tz / tLen;
      }

      if (totalLen < 25) continue;

      streamlines.push({
        points: rawPoints,
        cumulativeLengths: cumLengths,
        totalLength: totalLen,
        baseSpeed: normalizedBaseSpeed * (0.92 + ((l * 13 + lv * 7) % 5) * 0.04),
        layerIndex: lv,
      });
    }
  }

  // 3. Compute Windward Facade Impact Markers on buildings directly hit by wind
  const impactMarkers: WindImpactMarker[] = [];
  for (const obs of obstacles) {
    if (obs.height < 6) continue;
    const ring = obs.footprint;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const edx = bx - ax;
      const edz = bz - az;
      const segLen = Math.hypot(edx, edz);
      if (segLen < 4.5) continue;

      // Outward normal of wall segment
      let nx = -edz / segLen;
      let nz = edx / segLen;
      const midX = (ax + bx) * 0.5;
      const midZ = (az + bz) * 0.5;
      if (nx * (midX - obs.cx) + nz * (midZ - obs.cz) < 0) {
        nx = -nx;
        nz = -nz;
      }

      // Check if wall faces directly into incoming wind (dot(windDir, wallNormal) < -0.45)
      const facing = -(dirX * nx + dirZ * nz);
      if (facing > 0.48) {
        const tx = edx / segLen;
        const tz = edz / segLen;
        // Place impact marker at mid-height of building (and upper tier for tall towers)
        const tiers = obs.height > 28 ? [0.35, 0.72] : [0.55];
        for (const frac of tiers) {
          impactMarkers.push({
            x: midX + nx * 0.65,
            y: obs.baseY + obs.height * frac,
            z: midZ + nz * 0.65,
            nx,
            nz,
            tx,
            tz,
            span: Math.min(26, segLen * 0.82),
            intensity: Math.min(1, (facing - 0.4) * 1.5),
          });
        }
      }
    }
  }

  return {
    streamlines,
    impactMarkers: impactMarkers.slice(0, 70),
  };
}

/**
 * Samples a precomputed 3D streamline at normalized distance `u` in [0, 1].
 */
export function sampleStreamlineAt(
  streamline: WindStreamline,
  u: number,
): WindStreamlinePoint {
  const pts = streamline.points;
  const cum = streamline.cumulativeLengths;
  const targetDist = Math.max(0, Math.min(1, u)) * streamline.totalLength;

  // Binary search in cumulativeLengths
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const p0 = pts[lo];
  const p1 = pts[hi];
  const segLen = cum[hi] - cum[lo];
  const t = segLen > 1e-5 ? Math.max(0, Math.min(1, (targetDist - cum[lo]) / segLen)) : 0;

  let tx = p0.tx + (p1.tx - p0.tx) * t;
  let ty = p0.ty + (p1.ty - p0.ty) * t;
  let tz = p0.tz + (p1.tz - p0.tz) * t;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  return {
    x: p0.x + (p1.x - p0.x) * t,
    y: p0.y + (p1.y - p0.y) * t,
    z: p0.z + (p1.z - p0.z) * t,
    tx,
    ty,
    tz,
    speedFactor: p0.speedFactor + (p1.speedFactor - p0.speedFactor) * t,
    regime: p0.regime + (p1.regime - p0.regime) * t,
    r: p0.r + (p1.r - p0.r) * t,
    g: p0.g + (p1.g - p0.g) * t,
    b: p0.b + (p1.b - p0.b) * t,
  };
}
