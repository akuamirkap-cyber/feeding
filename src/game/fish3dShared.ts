import * as THREE from "three";
import {
  applyBoris3DPose,
  buildOutlineGeometry,
  createBoris3DRig,
  cubicPt,
  evalSpineZAt,
  injectSpineShader,
  interpCurveY,
  isSoftwareWebGL,
  normalizeExtrudeUVs,
} from "./boris3d";
import type { Boris3DPose, Boris3DRig, SpineUniforms } from "./boris3d";

export {
  applyBoris3DPose,
  buildOutlineGeometry,
  createBoris3DRig,
  cubicPt,
  evalSpineZAt,
  injectSpineShader,
  interpCurveY,
  isSoftwareWebGL,
  normalizeExtrudeUVs,
};
export type { Boris3DPose, Boris3DRig, SpineUniforms };

export type Fish3DPose = Boris3DPose;
export type Pt = [number, number];

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function jawOutlineMask(xHide = 0.008, xFull = 0.044): (x: number, y: number, z: number) => number {
  return (x: number) => smoothstep(xHide, xFull, x);
}

export function finRootMaskY(yRoot: number, fadeSpan: number, isTop = true): (x: number, y: number, z: number) => number {
  return isTop
    ? (_x: number, y: number) => smoothstep(yRoot, yRoot + fadeSpan, y)
    : (_x: number, y: number) => smoothstep(yRoot, yRoot - fadeSpan, y);
}

export interface SpineSocketSpan {
  x0: number;
  x1: number;
  top: boolean;
}

export function bodySpineOutlineMask(
  evalMidY: (x: number) => number,
  spans: SpineSocketSpan[],
  zRadius = 0.03
): (x: number, y: number, z: number) => number {
  return (x: number, y: number, z: number) => {
    const absZ = Math.abs(z);
    if (absZ >= zRadius) return 1;
    const zFade = smoothstep(0.006, zRadius, absZ);
    const mid = evalMidY(x);
    let hide = 0;
    for (const s of spans) {
      if (s.top ? y <= mid : y >= mid) continue;
      const xMask = smoothstep(s.x0 - 0.006, s.x0 + 0.016, x) * (1 - smoothstep(s.x1 - 0.016, s.x1 + 0.006, x));
      if (xMask > hide) hide = xMask;
    }
    return 1 - hide * (1 - zFade);
  };
}

export function blendBotToPalate(
  botFn: (x: number) => number,
  palateFn: (x: number) => number,
  hx: number,
  blendBack = 0.032,
  blendFwd = 0.014
): (x: number) => number {
  return (x: number) => {
    if (x <= hx - blendBack) return botFn(x);
    if (x >= hx + blendFwd) return palateFn(x);
    const k = smoothstep(hx - blendBack, hx + blendFwd, x);
    const b = botFn(x);
    const p = palateFn(x);
    return b + (p - b) * k;
  };
}

export function surfaceZAt(
  evalTop: (x: number) => number,
  evalBot: (x: number) => number,
  evalHalfZ: (x: number) => number,
  ex: number,
  ey: number,
  taperPow = 0.22,
  inset = 0.96
): number {
  const yt = evalTop(ex);
  const yb = evalBot(ex);
  const ym = (yt + yb) * 0.5;
  const hh = Math.max(0.008, (yt - yb) * 0.5);
  const s = clamp((ey - ym) / hh, -0.92, 0.92);
  const c = Math.sqrt(Math.max(0.06, 1 - s * s));
  return evalHalfZ(ex) * c * (1 - taperPow * s * s) * inset;
}

export interface Fish3DRig extends Boris3DRig {
  speciesKey: string;
  tailPivotX: number;
  isFluke?: boolean;
  skipDefaultFins?: boolean;
  scaleGroup?: THREE.Group;
  onCustomPose?: (p: Fish3DPose, open: number, swimAmp: number) => void;
}

// ---------- Color & Canvas Helpers ----------
export function hexRgb(h: string): [number, number, number] {
  const s = h.startsWith("#") ? h.slice(1) : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function rgbaHex(h: string, alpha: number): string {
  const [r, g, b] = hexRgb(h);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeLin(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

export function drawBlob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

export function drawGlow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  rgb: string,
  a: number
) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.6, `rgba(${rgb},${a * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function sampleBezierChain(segs: [Pt, Pt, Pt, Pt][], stepsPerSeg = 26): Pt[] {
  const pts: Pt[] = [];
  segs.forEach((s, idx) => {
    for (let i = idx === 0 ? 0 : 1; i <= stepsPerSeg; i++) {
      pts.push(cubicPt(s[0], s[1], s[2], s[3], i / stepsPerSeg));
    }
  });
  return pts;
}

export function createWorldMapper(minX: number, maxX: number, minY3: number, maxY3: number, size = 512) {
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY3 - minY3);
  const mapUV = (x: number, y3: number): Pt => [
    clamp((x - minX) / spanX, 0.002, 0.998),
    clamp((y3 - minY3) / spanY, 0.002, 0.998),
  ];
  const beginCanvas2D = (c: CanvasRenderingContext2D, offset2DX = 0, offset2DY = 0) => {
    c.save();
    c.translate((-minX / spanX) * size, (maxY3 / spanY) * size);
    c.scale(size / spanX, size / spanY);
    if (offset2DX !== 0 || offset2DY !== 0) c.translate(offset2DX, offset2DY);
  };
  return { mapUV, beginCanvas2D };
}

export function drawFinRays(
  fc: CanvasRenderingContext2D,
  origin: Pt,
  tips: Pt[],
  color: string,
  lineWidth = 0.0042
) {
  fc.strokeStyle = color;
  fc.lineWidth = lineWidth;
  fc.lineCap = "round";
  for (const [tx, ty] of tips) {
    fc.beginPath();
    fc.moveTo(origin[0], origin[1]);
    fc.lineTo(tx, ty);
    fc.stroke();
  }
}

// ---------- Shared Lofted 3D Geometry Builders (verified +Z outward winding!) ----------
export interface LoftOpts {
  xStart: number;
  xEnd: number;
  uSteps?: number;
  vSteps?: number;
  evalTopY: (x: number) => number;
  evalBotY: (x: number) => number;
  evalHalfZ: (x: number, t: number) => number;
  mapUV: (x: number, y: number) => Pt;
  taper?: (sinP: number) => number;
  localOffsetX?: number;
  localOffsetY?: number;
  roundFront?: boolean;
  rearBulge?: number;
  rearInsetAt?: (x: number, t: number) => number;
  capBack?: boolean;
  capFront?: boolean;
}

export function buildLoftedSurface(opts: LoftOpts): THREE.BufferGeometry {
  const uSteps = opts.uSteps ?? 40;
  const vSteps = opts.vSteps ?? 28;
  const ringCols = vSteps + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ox = opts.localOffsetX ?? 0;
  const oy = opts.localOffsetY ?? 0;
  const taperFn = opts.taper ?? ((s: number) => 1 - 0.22 * s * s);

  for (let i = 0; i <= uSteps; i++) {
    const t = i / uSteps;
    const x = opts.xStart + (opts.xEnd - opts.xStart) * t;
    let yTop = opts.evalTopY(x);
    let yBot = opts.evalBotY(x);
    if (opts.roundFront && t > 0.84) {
      const k = (t - 0.84) / 0.16;
      const mid = (yTop + yBot) * 0.5;
      const shrink = Math.sqrt(Math.max(0.04, 1 - k * k * 0.92));
      const h = Math.max(0.002, (yTop - yBot) * 0.5 * shrink);
      yTop = mid + h;
      yBot = mid - h;
    }
    if (yTop < yBot + 0.003) {
      const m = (yTop + yBot) * 0.5;
      yTop = m + 0.0015;
      yBot = m - 0.0015;
    }
    const yMid = (yTop + yBot) * 0.5;
    const halfH = (yTop - yBot) * 0.5;
    const inset = opts.rearInsetAt ? opts.rearInsetAt(x, t) : 1;
    const halfZ = Math.max(0.003, opts.evalHalfZ(x, t) * inset);
    const bulge = opts.rearBulge && t < 0.14 ? Math.sin((1 - t / 0.14) * Math.PI * 0.5) * opts.rearBulge : 0;

    for (let j = 0; j <= vSteps; j++) {
      const phi = (j / vSteps) * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const tap = taperFn(sinP);
      const wx = x - bulge * (1 - sinP * sinP * 0.6);
      const wy = yMid + halfH * sinP;
      const wz = halfZ * cosP * tap;
      positions.push(wx - ox, wy - oy, wz);
      const [tu, tv] = opts.mapUV(wx, wy);
      uvs.push(tu, tv);
    }
  }

  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * ringCols + j;
      const b = (i + 1) * ringCols + j;
      const c = (i + 1) * ringCols + (j + 1);
      const d = i * ringCols + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (opts.capBack !== false) {
    const backCenter = positions.length / 3;
    const ym0 = (opts.evalTopY(opts.xStart) + opts.evalBotY(opts.xStart)) * 0.5;
    positions.push(opts.xStart - (opts.rearBulge ?? 0.003) - ox, ym0 - oy, 0);
    const [bu, bv] = opts.mapUV(opts.xStart, ym0);
    uvs.push(bu, bv);
    for (let j = 0; j < vSteps; j++) {
      indices.push(backCenter, j, j + 1);
    }
  }

  if (opts.capFront !== false) {
    const frontRingStart = uSteps * ringCols;
    const frontCenter = positions.length / 3;
    const ym1 = (opts.evalTopY(opts.xEnd) + opts.evalBotY(opts.xEnd)) * 0.5;
    positions.push(opts.xEnd + 0.002 - ox, ym1 - oy, 0);
    const [fu, fv] = opts.mapUV(opts.xEnd, ym1);
    uvs.push(fu, fv);
    for (let j = 0; j < vSteps; j++) {
      indices.push(frontCenter, frontRingStart + j + 1, frontRingStart + j);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function makePaintedFinTex(
  maxAnisotropy: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  drawFn: (ctx: CanvasRenderingContext2D) => void,
  size = 256
): THREE.CanvasTexture {
  const fc = document.createElement("canvas");
  fc.width = size;
  fc.height = size;
  const ctx = fc.getContext("2d")!;
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
  ctx.save();
  ctx.scale(size / spanX, -size / spanY);
  ctx.translate(-bounds.minX, -bounds.maxY);
  drawFn(ctx);
  ctx.restore();
  const tex = new THREE.CanvasTexture(fc);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function makeSolidRoughnessMap(valHex = "#565656"): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  // Remap legacy dark roughness hexes (#40-#68) into soft satin [208..242] so fish don't turn into glossy mirror plastic
  const [r0] = hexRgb(valHex.startsWith("#") ? valHex : "#565656");
  const norm = Math.round(208 + (clamp(r0, 48, 220) - 48) * (34 / 172));
  c.fillStyle = `rgb(${norm},${norm},${norm})`;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createExtrudedFin(
  shape: THREE.Shape,
  depth = 0.004,
  bevel = 0.0012,
  curveSegments = 16
): { geo: THREE.BufferGeometry; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: bevel > 0 ? 2 : 1,
    curveSegments,
  });
  geo.translate(0, 0, -depth * 0.5);
  const bounds = normalizeExtrudeUVs(geo);
  return { geo, bounds };
}

export interface SharedRigContext {
  disposables: { dispose: () => void }[];
  track: <T extends { dispose: () => void }>(x: T) => T;
  uniforms: SpineUniforms;
  outlineColor: string;
  roughnessTex: THREE.CanvasTexture;
  makeOutlineMat: (offsetX?: number, offsetY?: number, useSpine?: boolean) => THREE.MeshBasicMaterial;
  makeFishMat: (map: THREE.Texture, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => THREE.MeshPhysicalMaterial;
}

export function createRigContext(outlineColor: string, roughHex = "#545454"): SharedRigContext {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const uniforms: SpineUniforms = {
    uTailPh: { value: 0 },
    uSwimAmp: { value: 0.025 },
    uBend: { value: 0 },
    uGulpT: { value: 0 },
    uGulpK: { value: 0 },
    uSquash: { value: 0 },
    uPuff: { value: 0 },
  };
  const roughnessTex = track(makeSolidRoughnessMap(roughHex));
  const makeOutlineMat = (offsetX = 0, offsetY = 0, useSpine = true) => {
    const m = track(
      new THREE.MeshBasicMaterial({
        color: outlineColor,
        side: THREE.BackSide,
      })
    );
    if (useSpine) injectSpineShader(m, uniforms, offsetX, offsetY);
    return m;
  };
  const makeFishMat = (map: THREE.Texture, extra?: Partial<THREE.MeshPhysicalMaterialParameters>) => {
    const rough = extra?.roughness !== undefined ? Math.max(0.76, extra.roughness) : 0.88;
    const coat = extra?.clearcoat !== undefined ? Math.min(0.05, extra.clearcoat) : 0.03;
    const envInt = extra?.envMapIntensity !== undefined ? Math.min(0.1, extra.envMapIntensity) : 0.07;
    const emInt = extra?.emissiveIntensity !== undefined ? Math.min(0.2, extra.emissiveIntensity) : 0.14;
    return track(
      new THREE.MeshPhysicalMaterial({
        map,
        roughnessMap: roughnessTex,
        emissiveMap: map,
        emissive: new THREE.Color("#ffffff"),
        ...extra,
        roughness: rough,
        metalness: 0,
        clearcoat: coat,
        clearcoatRoughness: 0.65,
        envMapIntensity: envInt,
        emissiveIntensity: emInt,
      })
    );
  };
  return { disposables, track, uniforms, outlineColor, roughnessTex, makeOutlineMat, makeFishMat };
}

export interface EyePairOpts {
  ex: number;
  ey: number;
  ez: number;
  er: number;
  sx?: number;
  sy?: number;
  yawRot?: number;
  irisColor: string;
  rimColor: string;
  happyColor?: string;
  lidColor?: string;
  lidTilt?: number;
  orcaDotOnly?: boolean;
}

export function createEyePair(
  ctx: SharedRigContext,
  parent: THREE.Object3D,
  opts: EyePairOpts
): {
  eyesNormal: THREE.Group[];
  eyesPupil: THREE.Mesh[];
  eyesHappy: THREE.Group[];
} {
  const { track } = ctx;
  const sx = opts.sx ?? 0.9;
  const sy = opts.sy ?? 1.02;
  const er = opts.er;

  const rimMat = track(new THREE.MeshBasicMaterial({ color: opts.rimColor }));
  const scleraMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      emissive: "#ffffff",
      emissiveIntensity: 0.18,
      roughness: 0.38,
      clearcoat: 0.15,
      clearcoatRoughness: 0.45,
      envMapIntensity: 0.08,
    })
  );
  const irisMat = track(
    new THREE.MeshPhysicalMaterial({
      color: opts.irisColor,
      emissive: opts.irisColor,
      emissiveIntensity: 0.14,
      roughness: 0.34,
      clearcoat: 0.18,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.08,
    })
  );
  const pupilMat = track(new THREE.MeshBasicMaterial({ color: "#070b18" }));
  const glintMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const happyMat = track(new THREE.MeshBasicMaterial({ color: opts.happyColor || opts.rimColor }));

  const scleraGeo = track(new THREE.SphereGeometry(er, 18, 12));
  scleraGeo.scale(sx, sy, 0.32);
  const rimGeo = track(new THREE.SphereGeometry(er * 1.032, 18, 12));
  rimGeo.scale(sx, sy, 0.24);
  const irisGeo = track(new THREE.SphereGeometry(er * 0.58, 16, 10));
  irisGeo.scale(sx, sy, 0.28);
  const pupilGeo = track(new THREE.SphereGeometry(er * 0.36, 14, 10));
  pupilGeo.scale(sx, sy, 0.28);
  const glint1Geo = track(new THREE.SphereGeometry(er * 0.16, 8, 8));
  const glint2Geo = track(new THREE.SphereGeometry(er * 0.08, 8, 8));

  const happyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-er * 0.72, -er * 0.18, 0),
    new THREE.Vector3(-er * 0.3, er * 0.36, er * 0.09),
    new THREE.Vector3(er * 0.3, er * 0.36, er * 0.09),
    new THREE.Vector3(er * 0.72, -er * 0.18, 0),
  ]);
  const happyGeo = track(new THREE.TubeGeometry(happyCurve, 12, Math.max(0.0022, er * 0.11), 8, false));

  let lidGeo: THREE.BufferGeometry | null = null;
  let lidMat: THREE.MeshPhysicalMaterial | null = null;
  if (opts.lidColor) {
    lidGeo = track(new THREE.SphereGeometry(er * 1.055, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42));
    lidGeo.scale(sx * 1.01, sy * 0.96, 0.34);
    lidMat = track(
      new THREE.MeshPhysicalMaterial({
        color: opts.lidColor,
        emissive: opts.lidColor,
        emissiveIntensity: 0.12,
        roughness: 0.78,
        clearcoat: 0.03,
        envMapIntensity: 0.07,
      })
    );
  }

  const eyesNormal: THREE.Group[] = [];
  const eyesPupil: THREE.Mesh[] = [];
  const eyesHappy: THREE.Group[] = [];

  for (const side of [1, -1]) {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(opts.ex, opts.ey, side * opts.ez);
    eyeSocket.rotation.y = side * (opts.yawRot ?? 0.2);
    parent.add(eyeSocket);

    const normalEye = new THREE.Group();
    if (opts.orcaDotOnly) {
      const darkBall = new THREE.Mesh(scleraGeo, pupilMat);
      const gl = new THREE.Mesh(glint1Geo, glintMat);
      gl.position.set(er * 0.24, er * 0.24, side * er * 0.3);
      normalEye.add(darkBall, gl);
      eyesPupil.push(darkBall);
    } else {
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.z = -side * 0.0005;
      const sclera = new THREE.Mesh(scleraGeo, scleraMat);
      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.position.set(er * 0.18, er * 0.03, side * er * 0.21);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(er * 0.22, er * 0.03, side * er * 0.28);
      const g1 = new THREE.Mesh(glint1Geo, glintMat);
      g1.position.set(er * 0.04, er * 0.26, side * er * 0.38);
      const g2 = new THREE.Mesh(glint2Geo, glintMat);
      g2.position.set(er * 0.32, -er * 0.16, side * er * 0.36);
      normalEye.add(rim, sclera, iris, pupil, g1, g2);
      if (lidGeo && lidMat) {
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(0, er * 0.08, side * er * 0.06);
        lid.rotation.z = opts.lidTilt ?? -0.24;
        normalEye.add(lid);
      }
      eyesPupil.push(pupil);
    }

    const happyEye = new THREE.Group();
    const hArc = new THREE.Mesh(happyGeo, happyMat);
    if (side < 0) hArc.scale.z = -1;
    hArc.position.z = side * Math.max(0.004, er * 0.22);
    happyEye.add(hArc);
    happyEye.visible = false;

    eyeSocket.add(normalEye, happyEye);
    eyesNormal.push(normalEye);
    eyesHappy.push(happyEye);
  }

  return { eyesNormal, eyesPupil, eyesHappy };
}

export function createOralParts(
  ctx: SharedRigContext,
  bodyGroup: THREE.Group,
  lowerJawGroup: THREE.Group,
  hx: number,
  hy: number,
  cavityCol = "#521224",
  tongueCol = "#eb6c8e",
  cavSize: [number, number, number] = [0.038, 0.032, 0.025],
  tongueSize: [number, number, number] = [0.03, 0.011, 0.017],
  tongueX = 0.036
): { mouthInterior: THREE.Group; tongueMesh: THREE.Mesh } {
  const { track } = ctx;
  const mouthInterior = new THREE.Group();
  mouthInterior.position.set(hx + 0.004, hy, 0);
  bodyGroup.add(mouthInterior);

  const cavityMat = track(
    new THREE.MeshStandardMaterial({
      color: cavityCol,
      emissive: mixHex(cavityCol, "#000000", 0.55),
      emissiveIntensity: 0.35,
      roughness: 0.72,
      side: THREE.DoubleSide,
    })
  );
  const cavityGeo = track(new THREE.SphereGeometry(1, 14, 10));
  cavityGeo.scale(cavSize[0], cavSize[1], cavSize[2]);
  const cavityMesh = new THREE.Mesh(cavityGeo, cavityMat);
  cavityMesh.position.set(cavSize[0] * 0.25, 0, 0);
  mouthInterior.add(cavityMesh);

  const tongueMat = track(
    new THREE.MeshPhysicalMaterial({
      color: tongueCol,
      emissive: tongueCol,
      emissiveIntensity: 0.14,
      roughness: 0.56,
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.07,
    })
  );
  const tongueGeo = track(new THREE.SphereGeometry(1, 14, 10));
  tongueGeo.scale(tongueSize[0], tongueSize[1], tongueSize[2]);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(tongueX, 0.002, 0);
  lowerJawGroup.add(tongueMesh);

  return { mouthInterior, tongueMesh };
}

export function createBiteRing(
  ctx: SharedRigContext,
  bodyGroup: THREE.Group,
  x: number,
  y: number,
  color = "#d8f8ff",
  radius = 0.055
) {
  const { track } = ctx;
  const geo = track(new THREE.TorusGeometry(radius, Math.max(0.004, radius * 0.11), 8, 22));
  const mat = track(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(x, y, 0);
  ring.rotation.y = Math.PI * 0.5;
  ring.visible = false;
  bodyGroup.add(ring);
  return { biteRing: ring, biteRingMat: mat };
}

export function baseGroups() {
  const root = new THREE.Group();
  const pitchGroup = new THREE.Group();
  const yawGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(pitchGroup);
  pitchGroup.add(yawGroup);
  yawGroup.add(bodyGroup);
  return { root, pitchGroup, yawGroup, bodyGroup };
}

export function addToothConeRow(
  parent: THREE.Object3D,
  track: <T extends { dispose: () => void }>(x: T) => T,
  count: number,
  xStart: number,
  xEnd: number,
  yFn: (t: number) => number,
  zFn: (t: number) => number,
  baseR: number,
  height: number,
  pointUp: boolean,
  mat: THREE.Material,
  tiltZ = 0
) {
  const geo = track(new THREE.ConeGeometry(baseR, height, 6));
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const x = xStart + (xEnd - xStart) * t;
    const y = yFn(t);
    const zAbs = zFn(t);
    const sides = zAbs > 0.003 ? [1, -1] : [0];
    for (const s of sides) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, s * zAbs);
      m.rotation.z = (pointUp ? 0 : Math.PI) + tiltZ;
      parent.add(m);
    }
  }
}

export function makeSpineFinMesh(
  ctx: SharedRigContext,
  shape: THREE.Shape,
  offsetX: number,
  offsetY: number,
  depth: number,
  bevel: number,
  drawTex: (c: CanvasRenderingContext2D, bounds: { minX: number; maxX: number; minY: number; maxY: number }) => void,
  maxAnisotropy: number,
  useSpine = true,
  outlineSize = 0.0028,
  extraMat?: Partial<THREE.MeshPhysicalMaterialParameters>,
  outlineMask?: (x: number, y: number, z: number) => number
) {
  const { geo, bounds } = createExtrudedFin(shape, depth, bevel, 16);
  ctx.track(geo);
  const tex = ctx.track(makePaintedFinTex(maxAnisotropy, bounds, (c) => drawTex(c, bounds), 256));
  const mat = ctx.makeFishMat(tex, extraMat);
  if (useSpine) injectSpineShader(mat, ctx.uniforms, offsetX, offsetY);
  const mesh = new THREE.Mesh(geo, mat);
  if (outlineSize > 0) {
    const olGeo = ctx.track(buildOutlineGeometry(geo, outlineSize, outlineMask));
    const olMesh = new THREE.Mesh(olGeo, ctx.makeOutlineMat(offsetX, offsetY, useSpine));
    mesh.add(olMesh);
  }
  return { mesh, geo, tex, mat, bounds };
}

export function applyStandardBodyColors(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][]
) {
  c.fillStyle = makeLin(c, x0, y0, x1, y1, stops);
  c.fillRect(-1.2, -1.2, 2.4, 2.4);
}
