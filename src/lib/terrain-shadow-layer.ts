import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import type { HeightGrid } from './terrarium';
import { metersPerPixel } from './terrarium';

export const TERRAIN_UMBRA_ID = 'solaria-terrain-umbra';

const VERT_SRC = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float m = texture(u_tex, v_uv).r;
  // Steep power curve: shadows snap to near-full intensity quickly,
  // preserving a thin soft edge for anti-aliasing
  float s = pow(m, 0.45);
  fragColor = u_color * s;
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

function mercatorXY(lng: number, lat: number): [number, number] {
  const merc = MercatorCoordinate.fromLngLat({ lng, lat });
  return [merc.x, merc.y];
}

/**
 * Approximate 1D Gaussian blur on a Uint8Array grid (separable 2-pass box blur).
 * Optimized: uses running sum with precomputed inverse multiplier, no Math calls in inner loop.
 */
function blurMask(mask: Uint8Array, cols: number, rows: number, radius: number): Uint8Array {
  if (radius < 1) return mask;
  const r = Math.min(Math.round(radius), 12);
  const invSize = 1 / (2 * r + 1);
  const out1 = new Uint8Array(cols * rows);
  const out2 = new Uint8Array(cols * rows);
  const lastCol = cols - 1;
  const lastRow = rows - 1;

  // Horizontal pass
  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      sum += mask[row + (x < 0 ? 0 : x > lastCol ? lastCol : x)];
    }
    out1[row] = (sum * invSize + 0.5) | 0;
    for (let x = 1; x < cols; x++) {
      const addIdx = x + r;
      const subIdx = x - r - 1;
      sum += mask[row + (addIdx > lastCol ? lastCol : addIdx)]
           - mask[row + (subIdx < 0 ? 0 : subIdx)];
      out1[row + x] = (sum * invSize + 0.5) | 0;
    }
  }

  // Vertical pass
  for (let x = 0; x < cols; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      sum += out1[(y < 0 ? 0 : y > lastRow ? lastRow : y) * cols + x];
    }
    out2[x] = (sum * invSize + 0.5) | 0;
    for (let y = 1; y < rows; y++) {
      const addY = y + r;
      const subY = y - r - 1;
      sum += out1[(addY > lastRow ? lastRow : addY) * cols + x]
           - out1[(subY < 0 ? 0 : subY) * cols + x];
      out2[y * cols + x] = (sum * invSize + 0.5) | 0;
    }
  }

  return out2;
}

/**
 * Casts terrain umbra by walking toward the sun on the DEM.
 * Returns a gradient mask (0–255) where brighter = deeper shadow.
 * Shadow intensity is based on occlusion depth for natural soft edges.
 */
export function castTerrainMask(
  grid: HeightGrid,
  azimuthDeg: number,
  altitudeDeg: number,
): Uint8Array {
  const mask = new Uint8Array(grid.cols * grid.rows);
  if (altitudeDeg < 1.5 || grid.max - grid.min < 28) return mask;

  const lat = (grid.north + grid.south) / 2;
  const mpp = Math.max(20, metersPerPixel(grid, lat));
  const tanAlt = Math.tan((Math.max(3.2, altitudeDeg) * Math.PI) / 180);
  const towardSun = (azimuthDeg * Math.PI) / 180;
  const east = Math.sin(towardSun);
  const north = Math.cos(towardSun);
  const stepM = Math.max(mpp * 1.35, 35);
  const maxDist = Math.min(12000, 350 * (grid.max - grid.min) / Math.max(0.2, tanAlt));
  const maxSteps = Math.min(100, Math.max(24, Math.floor(maxDist / stepM)));
  const dx = (east * stepM) / mpp;
  const dy = (-north * stepM) / mpp;
  const cols = grid.cols;
  const rows = grid.rows;
  const data = grid.data;
  const bias = Math.max(2.5, mpp * 0.08);
  // Low depthScale = shadows reach full intensity quickly for crisp edges
  const depthScale = 18 * tanAlt + 6;

  for (let y = 0; y < rows; y++) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      const h0 = data[row + x];
      if (!Number.isFinite(h0)) continue;
      let px = x + dx;
      let py = y + dy;
      let dist = stepM;
      let maxOcclusion = 0;
      for (let s = 0; s < maxSteps; s++) {
        const ix = px | 0;
        const iy = py | 0;
        if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) break;
        const h = data[iy * cols + ix];
        if (Number.isFinite(h)) {
          const threshold = h0 + dist * tanAlt + bias;
          if (h > threshold) {
            const occlusion = (h - threshold) / depthScale;
            if (occlusion >= 0.6) { maxOcclusion = 1; break; }
            if (occlusion > maxOcclusion) maxOcclusion = occlusion;
          }
        }
        px += dx;
        py += dy;
        dist += stepM;
      }
      if (maxOcclusion > 0.02) {
        mask[row + x] = (maxOcclusion * 255 + 0.5) | 0;
      }
    }
  }

  // Light blur for anti-aliasing only — keep edges crisp like building shadows
  const blurRadius = Math.max(1, Math.min(3, Math.round(cols / 150)));
  return blurMask(mask, cols, rows, blurRadius);
}

export class TerrainShadowLayer implements CustomLayerInterface {
  id = TERRAIN_UMBRA_ID;
  type = 'custom' as const;
  renderingMode = '2d' as const;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private aPos = 0;
  private aUv = 0;
  private uMatrix: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private matrix32 = new Float32Array(16);
  private color: [number, number, number, number] = [0, 0, 0, 0];
  private hasMask = false;
  private dirtyQuad = true;
  private dirtyTex = false;
  private mask: ArrayBufferView = new Uint8Array(1);
  private texW = 1;
  private texH = 1;
  private west = 0;
  private south = 0;
  private east = 0;
  private north = 0;

  setMask(
    mask: Uint8Array,
    width: number,
    height: number,
    bounds: { west: number; south: number; east: number; north: number },
    color: [number, number, number, number],
  ): void {
    this.mask = mask as ArrayBufferView;
    this.texW = width;
    this.texH = height;
    this.west = bounds.west;
    this.south = bounds.south;
    this.east = bounds.east;
    this.north = bounds.north;
    this.color = color;
    this.hasMask = mask.length === width * height && color[3] > 0.01;
    this.dirtyTex = true;
    this.dirtyQuad = true;
  }

  clear(): void {
    this.hasMask = false;
    this.color = [0, 0, 0, 0];
  }

  onAdd(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.program = compileProgram(gl);
    if (!this.program) return;
    this.aPos = gl.getAttribLocation(this.program, 'a_pos');
    this.aUv = gl.getAttribLocation(this.program, 'a_uv');
    this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    this.uColor = gl.getUniformLocation(this.program, 'u_color');
    this.uTex = gl.getUniformLocation(this.program, 'u_tex');
    this.quad = gl.createBuffer();
    this.texture = gl.createTexture();
    this.dirtyQuad = true;
    this.dirtyTex = true;
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.program) gl.deleteProgram(this.program);
    this.quad = null;
    this.texture = null;
    this.program = null;
    this.gl = null;
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.program || !this.quad || !this.texture || !this.hasMask) return;

    if (this.dirtyTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        this.texW,
        this.texH,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        this.mask,
      );
      this.dirtyTex = false;
    }

    if (this.dirtyQuad) {
      const nw = mercatorXY(this.west, this.north);
      const ne = mercatorXY(this.east, this.north);
      const se = mercatorXY(this.east, this.south);
      const sw = mercatorXY(this.west, this.south);
      // a_pos.xy, a_uv.xy — uv y flipped because DEM row 0 is north
      const verts = new Float32Array([
        nw[0], nw[1], 0, 1,
        ne[0], ne[1], 1, 1,
        sw[0], sw[1], 0, 0,
        se[0], se[1], 1, 0,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      this.dirtyQuad = false;
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aPos);
    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 16, 8);
    this.matrix32.set(options.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>);
    gl.uniformMatrix4fv(this.uMatrix, false, this.matrix32);
    gl.uniform4f(this.uColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uTex, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aUv);
  }
}
