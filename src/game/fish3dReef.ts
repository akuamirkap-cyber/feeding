import * as THREE from "three";
import type { Species } from "./species";
import {
  addToothConeRow,
  baseGroups,
  blendBotToPalate,
  bodySpineOutlineMask,
  buildLoftedSurface,
  buildOutlineGeometry,
  clamp,
  createBiteRing,
  createEyePair,
  createOralParts,
  createRigContext,
  createWorldMapper,
  drawBlob,
  drawFinRays,
  drawGlow,
  injectSpineShader,
  interpCurveY,
  jawOutlineMask,
  makeLin,
  makeSpineFinMesh,
  mixHex,
  rgbaHex,
  sampleBezierChain,
  smoothstep,
  surfaceZAt,
} from "./fish3dShared";
import type { Fish3DRig, Pt } from "./fish3dShared";

function sortAscX(pts: Pt[]): Pt[] {
  return [...pts].sort((a, b) => a[0] - b[0]);
}

function makeTeethMat(track: <T extends { dispose: () => void }>(x: T) => T) {
  return track(
    new THREE.MeshPhysicalMaterial({
      color: "#fffcf2",
      emissive: "#fffcf2",
      emissiveIntensity: 0.24,
      roughness: 0.2,
      clearcoat: 0.6,
    })
  );
}

// =====================================================================================
// 1. MINNOW & FRY (Hiromi Teri, Sarden, Ekor Kuning, Ikan Lentera)
// =====================================================================================
function createMinnow3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#13474d";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || pal.fin;
  const STR = pal.stripe;
  const LURE = pal.lure;
  const isLentera = !!LURE;

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.335;
  const xHead = 0.235;
  const xSnout = 0.365;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.036],
          [-0.23, 0.088],
          [-0.08, 0.148],
          [0.08, 0.16],
        ],
        [
          [0.08, 0.16],
          [0.19, 0.14],
          [0.29, 0.082],
          [xSnout, 0.012],
        ],
      ],
      20
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.036],
          [-0.23, -0.082],
          [-0.08, -0.136],
          [0.08, -0.146],
        ],
        [
          [0.08, -0.146],
          [0.19, -0.125],
          [0.29, -0.068],
          [xSnout, -0.012],
        ],
      ],
      20
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.086 * Math.sin(Math.pow(clamp(t, 0, 1), 0.78) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.16, 0.38, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.4, -0.18, 0.18, 512);

  // Paint counter-shaded anchovy/fry coat in 2D space matching sprites.ts
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.16, 0, 0.16, [
    [0, D],
    [0.32, B],
    [0.72, mixHex(B, BEL, 0.55)],
    [1, BEL],
  ]);
  bc.fillRect(-0.4, -0.22, 0.85, 0.44);

  // Counter-shading dark back + silver specular sheen
  bc.fillStyle = makeLin(bc, 0, -0.16, 0, 0.02, [
    [0, rgbaHex(D, 0.82)],
    [1, rgbaHex(D, 0)],
  ]);
  bc.fillRect(-0.4, -0.2, 0.85, 0.22);
  drawGlow(bc, 0.04, -0.06, 0.22, 0.045, -0.06, "255,255,255", 0.34);

  // Bright silver/yellow/cyan lateral band matching sprites.ts
  bc.strokeStyle = STR ? rgbaHex(STR, isLentera ? 0.92 : 0.94) : "rgba(232, 255, 255, 0.86)";
  bc.lineWidth = 0.046;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(-0.33, 0.008);
  bc.quadraticCurveTo(0.0, -0.015, 0.22, 0.004);
  bc.stroke();

  // Minnow lateral teal spots (Hiromi Teri)
  if (sp.spots && pal.spot) {
    bc.fillStyle = rgbaHex(pal.spot, 0.72);
    for (let i = 0; i < 6; i++) {
      drawBlob(bc, -0.2 + i * 0.062, -0.01 + Math.sin(i * 0.95) * 0.014, 0.012, 0.019, 0.12);
    }
  }

  // Gill operculum crease + cheek gleam
  bc.strokeStyle = rgbaHex(D, 0.72);
  bc.lineWidth = 0.0068;
  bc.beginPath();
  bc.moveTo(0.185, -0.055);
  bc.quadraticCurveTo(0.155, 0.01, 0.135, 0.08);
  bc.stroke();
  bc.strokeStyle = "rgba(255, 245, 210, 0.35)";
  bc.lineWidth = 0.0042;
  bc.beginPath();
  bc.moveTo(0.195, -0.05);
  bc.quadraticCurveTo(0.165, 0.01, 0.145, 0.075);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = xHead;
  const hy = -0.012;
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.01)) / (xSnout - (hx - 0.01)), 0, 1);
    return -0.012 + 0.022 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 48,
      vSteps: 26,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex, isLentera ? { emissiveIntensity: 0.34 } : undefined);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const minnowMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.125, x1: 0.075, top: true },
      { x0: -0.23, x1: -0.12, top: false },
      { x0: -0.035, x1: 0.055, top: false },
    ],
    0.024
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, minnowMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnout - 0.008,
      uSteps: 20,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.01)) / (xSnout - 0.008 - (hx - 0.01)), 0, 1);
        return -0.012 + 0.014 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x, t) => evalZ(x, t) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0036, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#521022",
    "#ec6b8e",
    [0.038, 0.032, 0.024],
    [0.028, 0.01, 0.016],
    0.036
  );

  // Forked V-Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.032);
  tailShape.quadraticCurveTo(-0.088, 0.116, -0.185, 0.165);
  tailShape.quadraticCurveTo(-0.125, 0.05, -0.068, 0);
  tailShape.quadraticCurveTo(-0.125, -0.05, -0.185, -0.165);
  tailShape.quadraticCurveTo(-0.088, -0.116, 0.01, -0.032);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(TAIL, D, 0.35)],
        [0.55, TAIL],
        [1, mixHex(TAIL, "#ffffff", 0.48)],
      ]);
      fc.fillRect(b.minX - 0.1, b.minY - 0.1, 0.5, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.175, 0.145],
          [-0.15, 0.092],
          [-0.11, 0.042],
          [-0.072, 0],
          [-0.11, -0.042],
          [-0.15, -0.092],
          [-0.175, -0.145],
        ],
        rgbaHex(D, 0.36),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.0011,
    isLentera ? { emissiveIntensity: 0.44 } : undefined
  );
  tailPivot.add(tailFin.mesh);

  // Swept Dorsal Fin
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.075, 0.122);
  dorsalShape.lineTo(-0.018, 0.268);
  dorsalShape.quadraticCurveTo(-0.065, 0.185, -0.125, 0.118);
  dorsalShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0009,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.minY, 0, b.maxY, [
          [0, mixHex(FIN, D, 0.35)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.3, -0.1, 0.6, 0.5);
        drawFinRays(
          fc,
          [-0.02, 0.11],
          [
            [-0.015, 0.255],
            [-0.045, 0.22],
            [-0.082, 0.178],
          ],
          rgbaHex(D, 0.36),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Rear Anal Fin & Mid Pelvic Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.12, -0.095);
  analShape.lineTo(-0.185, -0.195);
  analShape.quadraticCurveTo(-0.21, -0.12, -0.23, -0.072);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.35)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.5);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.055, -0.115);
  pelvShape.lineTo(-0.02, -0.202);
  pelvShape.lineTo(-0.035, -0.112);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0025,
      0.0008,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#ffffff", 0.38)],
        ]);
        fc.fillRect(-0.2, -0.4, 0.4, 0.5);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.016, y)
    ).mesh
  );

  // Paired Pectoral Fins
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.01);
  pecShape.bezierCurveTo(-0.04, 0.04, -0.112, 0.022, -0.106, -0.016);
  pecShape.bezierCurveTo(-0.088, -0.046, -0.025, -0.038, 0, -0.014);
  pecShape.closePath();
  const pecMatObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.14,
    -0.055,
    0.0024,
    0.0007,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.45)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.5, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.145, -0.055, 0.072);
  pecLeft.add(pecMatObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.145, -0.055, -0.072);
  pecRight.add(pecMatObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  // Bioluminescent Photophores for Ikan Lentera
  if (LURE) {
    const glowMat = track(
      new THREE.MeshBasicMaterial({
        color: LURE,
        transparent: true,
        opacity: 0.92,
      })
    );
    const orbGeo = track(new THREE.SphereGeometry(0.011, 10, 10));
    for (let i = 0; i < 5; i++) {
      const px = -0.18 + i * 0.088;
      const py = interpCurveY(botPts, px) + 0.024;
      const pz = evalZ(px, (px - xTail) / (xSnout - xTail)) * 0.94;
      for (const s of [1, -1]) {
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(px, py, s * pz);
        bodyGroup.add(orb);
      }
    }
  }

  const minnowEz = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.252,
    0.022
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.252,
    ey: 0.022,
    ez: minnowEz,
    er: 0.044,
    irisColor: pal.iris || "#1e56a0",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(
    ctx,
    bodyGroup,
    xSnout + 0.022,
    0,
    LURE || "#d8f8ff",
    0.042
  );

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 2. PIERRE (Kerapu Bintik — Blue Grouper with Pale-Haloed Spots & Spiny Dorsal Crest)
// =====================================================================================
function createPierre3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#142563";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const SPOT = pal.spot || "#f5fbff";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.2;
  const xSnout = 0.36;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.044],
          [-0.21, 0.125],
          [-0.06, 0.195],
          [0.08, 0.2],
        ],
        [
          [0.08, 0.2],
          [0.2, 0.182],
          [0.29, 0.118],
          [xSnout, 0.016],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.044],
          [-0.21, -0.118],
          [-0.06, -0.182],
          [0.08, -0.188],
        ],
        [
          [0.08, -0.188],
          [0.2, -0.168],
          [0.29, -0.105],
          [xSnout, -0.018],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.028 + 0.118 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.42, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.4, -0.22, 0.22, 512);

  // Paint Blue Grouper Body + 30 Dark-Haloed Ivory Spots matching sprites.ts
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.2, 0, 0.2, [
    [0, D],
    [0.32, B],
    [0.72, mixHex(B, BEL, 0.46)],
    [1, BEL],
  ]);
  bc.fillRect(-0.42, -0.26, 0.88, 0.52);

  // Forehead & shoulder specular glow
  drawGlow(bc, 0.04, -0.09, 0.2, 0.06, -0.15, "255,255,255", 0.34);

  // 30 signature haloed coral-grouper spots across head & flank
  for (let i = 0; i < 30; i++) {
    const sx = -0.26 + ((i * 0.7548776662 + 0.31) % 1) * 0.52;
    const sy = -0.14 + ((i * 0.5698402909 + 0.17) % 1) * 0.26;
    const r = 0.011 + (i % 3) * 0.0028;
    bc.fillStyle = rgbaHex(D, 0.48);
    bc.beginPath();
    bc.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
    bc.fill();
    bc.fillStyle = rgbaHex(SPOT, 0.94);
    bc.beginPath();
    bc.arc(sx, sy, r, 0, Math.PI * 2);
    bc.fill();
  }

  // Gill operculum curve + inner highlight
  bc.strokeStyle = rgbaHex(OL, 0.65);
  bc.lineWidth = 0.0072;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.155, -0.072);
  bc.quadraticCurveTo(0.122, 0.01, 0.088, 0.095);
  bc.stroke();
  bc.strokeStyle = "rgba(255, 240, 195, 0.35)";
  bc.lineWidth = 0.0042;
  bc.beginPath();
  bc.moveTo(0.165, -0.068);
  bc.quadraticCurveTo(0.132, 0.01, 0.098, 0.09);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = xHead;
  const hy = -0.025;
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (xSnout - (hx - 0.012)), 0, 1);
    return -0.025 + 0.038 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 48,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.005,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const pierreMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.295, x1: 0.115, top: true },
      { x0: -0.272, x1: -0.075, top: false },
      { x0: 0.002, x1: 0.095, top: false },
    ],
    0.028
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, pierreMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnout - 0.006,
      uSteps: 20,
      vSteps: 22,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (xSnout - 0.006 - (hx - 0.012)), 0, 1);
        return -0.025 + 0.024 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x, t) => evalZ(x, t) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#5c1226",
    "#ee6a8e",
    [0.044, 0.038, 0.03],
    [0.034, 0.012, 0.02],
    0.045
  );

  // Rounded Spotted Broom Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.012, 0.042);
  tailShape.bezierCurveTo(-0.052, 0.128, -0.148, 0.145, -0.18, 0.068);
  tailShape.quadraticCurveTo(-0.205, 0, -0.18, -0.068);
  tailShape.bezierCurveTo(-0.148, -0.145, -0.052, -0.128, 0.012, -0.042);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0038,
    0.001,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(FIN, D, 0.35)],
        [0.6, FIN],
        [1, mixHex(FIN, "#ffffff", 0.35)],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.175, 0.095],
          [-0.185, 0.052],
          [-0.19, 0],
          [-0.185, -0.052],
          [-0.175, -0.095],
        ],
        rgbaHex(D, 0.35),
        0.0036
      );
      fc.fillStyle = rgbaHex(SPOT, 0.9);
      for (let i = 0; i < 9; i++) {
        const sx = -0.045 - (i % 3) * 0.048;
        const sy = (-0.06 + Math.floor(i / 3) * 0.06) * (0.65 + (i % 3) * 0.22);
        fc.beginPath();
        fc.arc(sx, sy, 0.009, 0, Math.PI * 2);
        fc.fill();
      }
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // 7-Spine Serrated Front Dorsal Crest + Rounded Soft Rear Lobe
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.115, 0.145);
  for (let i = 0; i < 7; i++) {
    const sx = 0.095 - i * 0.036;
    const sy = 0.252 - Math.abs(i - 2) * 0.006;
    dorsalShape.lineTo(sx, sy);
    dorsalShape.lineTo(sx - 0.02, sy - 0.042);
  }
  dorsalShape.bezierCurveTo(-0.21, 0.275, -0.295, 0.242, -0.295, 0.125);
  dorsalShape.quadraticCurveTo(-0.295, 0.068, -0.268, 0.028);
  dorsalShape.lineTo(-0.08, 0.125);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0038,
      0.001,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.minY, 0, b.maxY, [
          [0, mixHex(FIN, D, 0.38)],
          [1, mixHex(FIN, "#ffffff", 0.36)],
        ]);
        fc.fillRect(-0.5, -0.1, 0.8, 0.5);
        const rTips: Pt[] = [];
        for (let i = 0; i < 11; i++) rTips.push([0.085 - i * 0.036, 0.245]);
        drawFinRays(fc, [-0.08, 0.1], rTips, rgbaHex(D, 0.34), 0.0035);
        fc.fillStyle = rgbaHex(SPOT, 0.86);
        for (let i = 0; i < 6; i++) {
          fc.beginPath();
          fc.arc(0.055 - i * 0.058, 0.195 - (i % 2) * 0.025, 0.0085, 0, Math.PI * 2);
          fc.fill();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Rounded Spotted Anal Fin + Pelvic Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.075, -0.148);
  analShape.bezierCurveTo(-0.125, -0.258, -0.255, -0.245, -0.272, -0.135);
  analShape.lineTo(-0.245, -0.042);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0035,
      0.001,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.38)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.5, -0.4, 0.6, 0.5);
        drawFinRays(
          fc,
          [-0.14, -0.09],
          [
            [-0.11, -0.22],
            [-0.16, -0.23],
            [-0.21, -0.21],
            [-0.25, -0.16],
          ],
          rgbaHex(D, 0.34),
          0.0034
        );
        fc.fillStyle = rgbaHex(SPOT, 0.86);
        for (const [sx, sy] of [
          [-0.14, -0.18],
          [-0.19, -0.19],
          [-0.23, -0.15],
        ]) {
          fc.beginPath();
          fc.arc(sx, sy, 0.008, 0, Math.PI * 2);
          fc.fill();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.095, -0.158);
  pelvShape.quadraticCurveTo(0.088, -0.255, -0.005, -0.238);
  pelvShape.quadraticCurveTo(0.002, -0.185, 0.028, -0.162);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc, b) => {
        fc.fillStyle = makeLin(fc, 0, b.maxY, 0, b.minY, [
          [0, mixHex(FIN, D, 0.32)],
          [1, mixHex(FIN, "#ffffff", 0.35)],
        ]);
        fc.fillRect(-0.2, -0.4, 0.4, 0.4);
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.048, 0.056, -0.132, 0.026, -0.125, -0.02);
  pecShape.bezierCurveTo(-0.105, -0.06, -0.032, -0.048, 0, -0.016);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.095,
    -0.068,
    0.003,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.4)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.5, 0.4);
      fc.fillStyle = rgbaHex(SPOT, 0.85);
      for (const [sx, sy] of [
        [-0.045, 0.006],
        [-0.075, -0.012],
        [-0.092, 0.01],
      ]) {
        fc.beginPath();
        fc.arc(sx, sy, 0.0065, 0, Math.PI * 2);
        fc.fill();
      }
    },
    maxAnisotropy,
    false,
    0.0012
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.095, -0.068, 0.1);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.095, -0.068, -0.1);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pierreEz = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.228,
    0.042
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.228,
    ey: 0.042,
    ez: pierreEz,
    er: 0.046,
    irisColor: pal.iris || "#d9920f",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, -0.01, "#d8ecff", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.014,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 3. LEON LEPU (Lionfish — Golden Underbite Snout, 10 Feathered Spines, Banded Wing Fan)
// =====================================================================================
function createLeon3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#262004";
  const GLD = "#e5ba14";
  const GLD_HI = "#f8df44";
  const OLV = "#7d6406";
  const DK = "#322804";
  const MINT = "#c8ddc6";
  const MINT_L = "#e4efe0";
  const CREAM = "#f6f3cc";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawLeon 2D offset c.translate(-0.015, 0.02) in +Y-down -> y3 = -(y2 + 0.02)
  const ox2 = -0.015;
  const oy2 = 0.02;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.23; // -0.215 - 0.015
  const hx = 0.253; // 0.268 - 0.015
  const hy = -0.078; // -(0.058 + 0.02)
  const ux3 = 0.339; // 0.354 - 0.015
  const lx3 = 0.367; // 0.382 - 0.015 (protruding golden lower jaw underbite!)

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.215, -0.028), to3D(-0.14, -0.028), to3D(-0.09, -0.068), to3D(-0.01, -0.132)],
        [to3D(-0.01, -0.132), to3D(0.085, -0.165), to3D(0.185, -0.138), to3D(0.246, -0.085)],
        [to3D(0.246, -0.085), to3D(0.268, -0.062), to3D(0.292, -0.028), to3D(0.312, 0.004)],
        [to3D(0.312, 0.004), to3D(0.336, 0.028), to3D(0.348, 0.042), to3D(0.354, 0.052)],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.215, 0.044), to3D(-0.175, 0.05), to3D(-0.115, 0.068), to3D(-0.035, 0.1)],
        [to3D(-0.035, 0.1), to3D(0.05, 0.132), to3D(0.135, 0.15), to3D(0.225, 0.138)],
        [to3D(0.225, 0.138), to3D(0.295, 0.128), to3D(0.355, 0.105), to3D(0.386, 0.092)],
      ],
      22
    )
  );

  const evalZ = (x: number) => {
    const t = clamp((x - xTail) / (lx3 - xTail), 0, 1);
    const base = 0.02 + 0.095 * Math.sin(Math.pow(t, 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.44, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.27, 0.41, -0.18, 0.18, 512);

  // Paint Golden-Olive Zebra Lionfish Skin matching drawLeon
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = makeLin(bc, 0.04, -0.16, 0.04, 0.15, [
    [0, "#a88208"],
    [0.24, GLD_HI],
    [0.58, GLD],
    [0.86, "#8a6804"],
    [1, "#4e3e02"],
  ]);
  bc.fillRect(-0.35, -0.25, 0.85, 0.5);

  drawGlow(bc, 0.06, -0.02, 0.22, 0.11, -0.08, "255,230,90", 0.34);

  // Trunk zebra stripes (cream-lemon & deep olive)
  const flankStripes = [
    { x: 0.155, w: 0.018, c: CREAM, a: 0.86, bend: 0.014 },
    { x: 0.115, w: 0.02, c: OLV, a: 0.42, bend: 0.014 },
    { x: 0.072, w: 0.022, c: CREAM, a: 0.9, bend: 0.012 },
    { x: 0.028, w: 0.02, c: OLV, a: 0.42, bend: 0.008 },
    { x: -0.018, w: 0.02, c: CREAM, a: 0.88, bend: 0.004 },
    { x: -0.065, w: 0.02, c: OLV, a: 0.42, bend: -0.004 },
    { x: -0.108, w: 0.016, c: CREAM, a: 0.82, bend: -0.008 },
    { x: -0.158, w: 0.014, c: CREAM, a: 0.76, bend: -0.01 },
  ];
  for (const s of flankStripes) {
    bc.beginPath();
    bc.moveTo(s.x, -0.18);
    bc.quadraticCurveTo(s.x + s.bend, 0.0, s.x - 0.01, 0.18);
    bc.strokeStyle = rgbaHex(s.c, s.a);
    bc.lineWidth = s.w;
    bc.stroke();
  }

  // Snout & cheek diagonal stripes
  const headStripes = [
    [0.328, -0.01, 0.285, 0.11],
    [0.302, -0.04, 0.258, 0.125],
    [0.274, -0.07, 0.228, 0.138],
    [0.242, -0.085, 0.205, 0.14],
  ];
  for (const [x0, y0, x1, y1] of headStripes) {
    bc.beginPath();
    bc.moveTo(x0, y0);
    bc.quadraticCurveTo((x0 + x1) * 0.5 + 0.012, (y0 + y1) * 0.5, x1, y1);
    bc.strokeStyle = rgbaHex("#e6ebbb", 0.78);
    bc.lineWidth = 0.01;
    bc.stroke();
  }

  // Protruding golden lower lip cushion highlight
  bc.beginPath();
  bc.moveTo(0.285, 0.056);
  bc.quadraticCurveTo(0.34, 0.052, 0.382, 0.066);
  bc.quadraticCurveTo(0.345, 0.088, 0.285, 0.08);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.285, 0.056, 0.382, 0.088, [
    [0, "#c89608"],
    [0.5, "#f7dc44"],
    [1, "#e8b410"],
  ]);
  bc.fill();
  bc.strokeStyle = rgbaHex(DK, 0.55);
  bc.lineWidth = 0.0042;
  bc.stroke();

  // Operculum curve & cheek rim
  bc.beginPath();
  bc.moveTo(0.195, -0.035);
  bc.bezierCurveTo(0.168, 0.02, 0.18, 0.095, 0.228, 0.132);
  bc.strokeStyle = rgbaHex(DK, 0.75);
  bc.lineWidth = 0.0072;
  bc.stroke();
  bc.beginPath();
  bc.moveTo(0.204, -0.025);
  bc.bezierCurveTo(0.18, 0.025, 0.192, 0.092, 0.232, 0.122);
  bc.strokeStyle = rgbaHex("#f5eea8", 0.58);
  bc.lineWidth = 0.004;
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (ux3 - (hx - 0.012)), 0, 1);
    return hy + 0.006 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 48,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const leonMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.16, x1: 0.19, top: true },
      { x0: -0.16, x1: -0.075, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, leonMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 20,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (lx3 - (hx - 0.012)), 0, 1);
        return hy - 0.006 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x) => evalZ(x) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const teethMat = makeTeethMat(track);
  addToothConeRow(
    bodyGroup,
    track,
    5,
    hx + 0.018,
    ux3 - 0.008,
    (t) => {
      const x = hx + 0.018 + (ux3 - 0.008 - (hx + 0.018)) * t;
      return evalUpperPalate(x) - 0.001;
    },
    (t) => 0.018 * (1 - t * 0.45),
    0.0028,
    0.009,
    false,
    teethMat
  );
  addToothConeRow(
    lowerJawGroup,
    track,
    5,
    0.018,
    lx3 - hx - 0.01,
    (t) => {
      const x = hx + 0.018 + (lx3 - 0.01 - (hx + 0.018)) * t;
      const lt = clamp((x - (hx - 0.012)) / (lx3 - (hx - 0.012)), 0, 1);
      return -0.006 * lt + 0.002;
    },
    (t) => 0.018 * (1 - t * 0.45),
    0.003,
    0.01,
    true,
    teethMat
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#520e1e",
    "#d94f78",
    [0.044, 0.036, 0.028],
    [0.032, 0.012, 0.018],
    0.042
  );

  // 10 Slender Banded Dorsal Spines with Sage-Mint Feather Pennants (exact drawLeon geometry!)
  const nSp = 10;
  for (let i = 0; i < nSp; i++) {
    const f = i / (nSp - 1);
    const [rx, ry] = to3D(0.205 - f * 0.24, -0.105 - Math.sin(f * Math.PI * 0.85) * 0.042 + f * 0.045);
    const ang3 = Math.PI * (0.38 + f * 0.3);
    const spLen = 0.215 + Math.sin(f * Math.PI * 0.9) * 0.095 - f * 0.035;
    const bend = 0.012 + f * 0.028;
    const midX = rx + Math.cos(ang3) * spLen * 0.56 - bend * 0.15;
    const midY = ry + Math.sin(ang3) * spLen * 0.56;
    const tipX = rx + Math.cos(ang3) * spLen - bend;
    const tipY = ry + Math.sin(ang3) * spLen - f * 0.012;

    const dx = tipX - midX;
    const dy = tipY - midY;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const bx = -uy;
    const by = ux;
    const sign = bx < 0 ? 1 : -1;
    const nx = bx * sign;
    const ny = by * sign;

    const spineShape = new THREE.Shape();
    spineShape.moveTo(rx - nx * 0.004, ry - 0.015);
    spineShape.quadraticCurveTo(midX - nx * 0.004, midY, tipX, tipY);
    spineShape.lineTo(tipX + nx * 0.034 + ux * 0.008, tipY + ny * 0.034 + uy * 0.008);
    spineShape.lineTo(tipX - ux * 0.018 + nx * 0.02, tipY - uy * 0.018 + ny * 0.02);
    spineShape.lineTo(tipX - ux * 0.032 + nx * 0.028, tipY - uy * 0.032 + ny * 0.028);
    spineShape.lineTo(midX + nx * 0.006, midY + ny * 0.006);
    spineShape.lineTo(rx + nx * 0.005, ry - 0.015);
    spineShape.closePath();

    bodyGroup.add(
      makeSpineFinMesh(
        ctx,
        spineShape,
        0,
        0,
        0.0022,
        0.0006,
        (fc, b) => {
          // Mint feather pennant gradient
          fc.fillStyle = makeLin(fc, rx, ry, tipX, tipY, [
            [0, rgbaHex(MINT, 0.88)],
            [0.65, rgbaHex(MINT_L, 0.92)],
            [1, "#d6e6d4"],
          ]);
          fc.fillRect(b.minX - 0.1, b.minY - 0.1, 0.5, 0.6);
          // Banded spine shaft along leading spine edge
          fc.beginPath();
          fc.moveTo(rx, ry - 0.01);
          fc.quadraticCurveTo(midX, midY, tipX, tipY);
          fc.strokeStyle = "#8c8b52";
          fc.lineWidth = 0.0095;
          fc.stroke();
          fc.setLineDash([0.014, 0.016]);
          fc.strokeStyle = rgbaHex(DK, 0.85);
          fc.lineWidth = 0.0088;
          fc.stroke();
          fc.setLineDash([]);
        },
        maxAnisotropy,
        true,
        0.0009,
        undefined,
        (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
      ).mesh
    );
  }

  // Soft Spotted Rear Dorsal & Tucked Anal Fin
  const rearDShape = new THREE.Shape();
  rearDShape.moveTo(...to3D(-0.04, -0.065));
  rearDShape.quadraticCurveTo(...to3D(-0.095, -0.18), ...to3D(-0.145, -0.175));
  rearDShape.bezierCurveTo(...to3D(-0.155, -0.11), ...to3D(-0.145, -0.05), ...to3D(-0.145, -0.015));
  rearDShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      rearDShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.07, 0.02, -0.15, 0.16, [
          [0, "#c2b850"],
          [0.5, MINT],
          [1, MINT_L],
        ]);
        fc.fillRect(-0.4, -0.1, 0.6, 0.4);
        fc.fillStyle = rgbaHex("#424b28", 0.6);
        for (let r = 0; r < 3; r++) {
          for (let k = 0; k < 3; k++) {
            drawBlob(fc, -0.09 - r * 0.024, 0.05 + k * 0.028 + r * 0.012, 0.0045, 0.0035, 0);
          }
        }
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(-0.06, 0.08));
  analShape.quadraticCurveTo(...to3D(-0.095, 0.145), ...to3D(-0.135, 0.145));
  analShape.quadraticCurveTo(...to3D(-0.15, 0.095), ...to3D(-0.145, 0.045));
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0026,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.07, -0.08, -0.15, -0.18, [
          [0, "#c2b850"],
          [0.5, MINT],
          [1, MINT_L],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.4);
        fc.fillStyle = rgbaHex("#424b28", 0.56);
        for (const [sx, sy] of [
          [-0.1, -0.11],
          [-0.13, -0.13],
          [-0.12, -0.09],
        ]) {
          drawBlob(fc, sx, sy, 0.0045, 0.0035, 0);
        }
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Rounded Translucent Pale-Mint Speckled Tail Fin
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, -0.035, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.036);
  tailShape.quadraticCurveTo(-0.06, 0.105, -0.145, 0.135);
  tailShape.bezierCurveTo(-0.22, 0.095, -0.235, -0.085, -0.13, -0.148);
  tailShape.quadraticCurveTo(-0.055, -0.115, 0.01, -0.042);
  tailShape.closePath();
  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.22, 0, [
        [0, "#b4bc84"],
        [0.35, MINT],
        [1, MINT_L],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      const tRays: Pt[] = [];
      for (let i = 0; i < 7; i++) tRays.push([-0.21, -0.1 + i * 0.036]);
      drawFinRays(fc, [0.02, -0.004], tRays, rgbaHex("#eff4e4", 0.54), 0.0034);
      fc.fillStyle = rgbaHex("#303818", 0.68);
      for (let i = 0; i < 7; i++) {
        const ry = -0.088 + i * 0.031;
        for (let j = 1; j <= 4; j++) {
          const t = j * 0.22;
          drawBlob(fc, -0.03 - t * 0.17, ry * (0.35 + t * 0.85), 0.0044, 0.0036, 0);
        }
      }
    },
    maxAnisotropy,
    false,
    0.0011,
    { transparent: true, opacity: 0.9 }
  );
  tailPivot.add(tailFin.mesh);

  // Sweeping 7-Ray Banded & Ragged Feathered Pectoral Curtain
  const [pecOx, pecOy] = to3D(0.18, 0.082);
  const raysData = [
    { ang: 1.5, len: 0.215 },
    { ang: 1.76, len: 0.255 },
    { ang: 2.02, len: 0.28 },
    { ang: 2.28, len: 0.295 },
    { ang: 2.54, len: 0.295 },
    { ang: 2.8, len: 0.29 },
    { ang: 3.06, len: 0.305 },
  ];
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.035, 0.0);
  for (let i = 0; i < raysData.length; i++) {
    const r = raysData[i];
    const ex = Math.cos(r.ang) * r.len;
    const ey = -Math.sin(r.ang) * r.len;
    const nx = Math.cos(r.ang + 0.09) * (r.len * 0.92);
    const ny = -Math.sin(r.ang + 0.09) * (r.len * 0.92);
    pecShape.lineTo(ex, ey);
    pecShape.lineTo(nx, ny);
    if (i < raysData.length - 1) {
      pecShape.lineTo(
        Math.cos(r.ang + 0.14) * (r.len * 0.78),
        -Math.sin(r.ang + 0.14) * (r.len * 0.78)
      );
    }
  }
  pecShape.lineTo(-0.08, 0.025);
  pecShape.closePath();

  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.0026,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0.0, -0.16, -0.26, [
        [0, "#c89e18"],
        [0.38, "#98b888"],
        [0.72, "#d6ead8"],
        [1, "#f2f9f2"],
      ]);
      fc.fillRect(-0.4, -0.4, 0.5, 0.5);
      for (let b = 0; b < 5; b++) {
        fc.beginPath();
        fc.arc(0.01, 0.01, 0.045 + b * 0.042, -3.25, -1.55);
        fc.strokeStyle = b % 2 === 0 ? rgbaHex("#d4861a", 0.56) : rgbaHex("#f4f2cc", 0.58);
        fc.lineWidth = 0.016;
        fc.stroke();
      }
      for (const r of raysData) {
        const ex = Math.cos(r.ang) * r.len;
        const ey = -Math.sin(r.ang) * r.len;
        fc.beginPath();
        fc.moveTo(0.01, 0.0);
        fc.quadraticCurveTo(ex * 0.45 + 0.01, ey * 0.5, ex, ey);
        fc.strokeStyle = rgbaHex("#e4edd4", 0.85);
        fc.lineWidth = 0.0052;
        fc.stroke();
        fc.setLineDash([0.01, 0.013]);
        fc.strokeStyle = rgbaHex("#6a5812", 0.48);
        fc.lineWidth = 0.0042;
        fc.stroke();
        fc.setLineDash([]);
        fc.fillStyle = rgbaHex("#3a4424", 0.48);
        drawBlob(fc, ex * 0.78, ey * 0.78, 0.004, 0.0032, 0);
      }
    },
    maxAnisotropy,
    false,
    0.001,
    { transparent: true, opacity: 0.92 }
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, 0.088);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -0.088);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  // Dual Curved 3D Brow Tentacles
  const tentMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#9a8618",
      emissive: "#5e4e08",
      emissiveIntensity: 0.2,
      roughness: 0.35,
    })
  );
  for (const [bx0, by0, cx0, cy0, tx0, ty0, rad] of [
    [0.242, -0.088, 0.262, -0.142, 0.302, -0.168, 0.0042],
    [0.256, -0.082, 0.28, -0.128, 0.312, -0.145, 0.0036],
  ] as const) {
    const [p0x, p0y] = to3D(bx0, by0);
    const [p1x, p1y] = to3D(cx0, cy0);
    const [p2x, p2y] = to3D(tx0, ty0);
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(p0x, p0y, s * 0.028),
        new THREE.Vector3(p1x, p1y, s * 0.034),
        new THREE.Vector3(p2x, p2y, s * 0.036),
      ]);
      const tGeo = track(new THREE.TubeGeometry(curve, 10, rad, 6, false));
      const tMesh = new THREE.Mesh(tGeo, tentMat);
      bodyGroup.add(tMesh);
    }
  }

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const [ex, ey] = to3D(0.252, -0.044);
  const leonEz = surfaceZAt(evalTop, evalUnifiedBot, evalZ, ex, ey);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: leonEz,
    er: 0.036,
    irisColor: "#a4bc1c",
    rimColor: OL,
    lidColor: "#907206",
    lidTilt: 0.22,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, lx3 + 0.015, hy, "#f8eba2", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 4. PETER (John Dory FF2 — Deep Emerald Oval, 3 Wavy Golden Bands, Thumbprint Ocellus, 9-Spine Mohawk)
// =====================================================================================
function createPeter3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0b2410";
  const B = pal.body; // #28863c
  const D = pal.dark; // #0f421a
  const BEL = pal.belly; // #4ca850
  const FIN = pal.fin; // #6ea862
  const GOLD = pal.stripe || "#ffe61c";
  const SPOT = pal.spot || "#101a10";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.255;
  const xHead = 0.165;
  const xSnoutU = 0.345;
  const xSnoutL = 0.352;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.04],
          [-0.16, 0.175],
          [-0.03, 0.252],
          [0.08, 0.246],
        ],
        [
          [0.08, 0.246],
          [0.18, 0.22],
          [0.27, 0.125],
          [xSnoutU, -0.025],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.04],
          [-0.15, -0.172],
          [-0.02, -0.238],
          [0.09, -0.228],
        ],
        [
          [0.09, -0.228],
          [0.2, -0.205],
          [0.285, -0.145],
          [xSnoutL, -0.068],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.084 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.18 ? base * clamp(1 - (x - 0.18) / 0.22, 0.38, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.3, 0.39, -0.27, 0.27, 512);

  // Paint Deep Emerald John Dory Body with 3 Wavy Golden Bands + Thumbprint Ocellus + Black Peduncle Bar
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.25, 0, 0.25, [
    [0, D],
    [0.36, B],
    [0.74, mixHex(B, BEL, 0.55)],
    [1, mixHex(D, BEL, 0.38)],
  ]);
  bc.fillRect(-0.36, -0.3, 0.8, 0.6);

  drawGlow(bc, 0.02, -0.11, 0.18, 0.065, -0.12, "255,255,255", 0.28);

  // 3 Wavy Longitudinal Golden Bands matching sprites.ts peter!
  bc.fillStyle = GOLD;
  // Top golden sweeping band
  bc.beginPath();
  bc.moveTo(0.115, -0.08);
  bc.bezierCurveTo(0.02, -0.145, -0.095, -0.105, -0.225, -0.02);
  bc.bezierCurveTo(-0.095, -0.045, 0.02, -0.07, 0.105, -0.035);
  bc.closePath();
  bc.fill();
  // Middle-lower golden sweeping band
  bc.beginPath();
  bc.moveTo(0.068, 0.06);
  bc.bezierCurveTo(-0.03, 0.015, -0.125, 0.015, -0.225, -0.005);
  bc.bezierCurveTo(-0.125, 0.06, -0.025, 0.07, 0.062, 0.09);
  bc.closePath();
  bc.fill();
  // Bottom golden sweeping band
  bc.beginPath();
  bc.moveTo(0.132, 0.165);
  bc.bezierCurveTo(0.018, 0.11, -0.102, 0.14, -0.21, 0.025);
  bc.bezierCurveTo(-0.102, 0.19, 0.018, 0.18, 0.132, 0.195);
  bc.closePath();
  bc.fill();

  // Yellow cheek wedge & forehead spots
  bc.beginPath();
  bc.moveTo(0.228, 0.025);
  bc.lineTo(0.175, 0.07);
  bc.lineTo(0.202, 0.115);
  bc.closePath();
  bc.fill();
  for (const [sx, sy, rr] of [
    [0.088, -0.17, 0.022],
    [0.018, -0.185, 0.024],
    [-0.065, -0.165, 0.018],
    [0.155, 0.035, 0.015],
    [0.132, 0.09, 0.014],
  ]) {
    drawBlob(bc, sx, sy, rr * 1.15, rr * 0.85, -0.2);
  }

  // Signature pale-yellow-ringed dark thumbprint ocellus at center flank
  bc.fillStyle = "#e8f68c";
  drawBlob(bc, -0.02, -0.004, 0.058, 0.042, 0);
  bc.fillStyle = SPOT;
  drawBlob(bc, -0.02, -0.004, 0.044, 0.031, 0);

  // Crisp black vertical bar at tail peduncle
  bc.fillStyle = "#0b140b";
  bc.fillRect(-0.26, -0.12, 0.03, 0.24);

  // Operculum crease
  bc.strokeStyle = rgbaHex(OL, 0.55);
  bc.lineWidth = 0.0068;
  bc.beginPath();
  bc.moveTo(0.14, -0.085);
  bc.quadraticCurveTo(0.108, 0.03, 0.076, 0.13);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = xHead;
  const hy = -0.062;
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (xSnoutU - (hx - 0.012)), 0, 1);
    return hy + 0.02 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnoutU,
      uSteps: 50,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const peterMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.252, x1: 0.1, top: true },
      { x0: -0.228, x1: -0.048, top: false },
      { x0: 0.03, x1: 0.12, top: false },
    ],
    0.026
  );
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, peterMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnoutL,
      uSteps: 20,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (xSnoutL - (hx - 0.012)), 0, 1);
        return hy + 0.002 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x, t) => evalZ(x, t) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#4e1022",
    "#ec6a8e",
    [0.044, 0.038, 0.028],
    [0.032, 0.012, 0.018],
    0.042
  );

  // Truncate Rounded Tail Fin w/ Dark Base & Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.042);
  tailShape.quadraticCurveTo(-0.072, 0.125, -0.145, 0.135);
  tailShape.quadraticCurveTo(-0.162, 0, -0.145, -0.135);
  tailShape.quadraticCurveTo(-0.072, -0.125, 0.01, -0.042);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(pal.tail || FIN, D, 0.4)],
        [0.55, pal.tail || FIN],
        [1, mixHex(pal.tail || FIN, "#ffffff", 0.45)],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.14, 0.105],
          [-0.148, 0.052],
          [-0.15, 0],
          [-0.148, -0.052],
          [-0.14, -0.105],
        ],
        rgbaHex(D, 0.36),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // 9-Spine Spiky Mohawk Dorsal Crest (deep V-notches between spines!)
  const nSp = 9;
  const basePts: Pt[] = [];
  const tipPts: Pt[] = [];
  for (let i = 0; i < nSp; i++) {
    const f = i / (nSp - 1);
    const bx0 = 0.095 - f * 0.165;
    const by0 = 0.18 + Math.sin(f * Math.PI) * 0.025;
    const ang3 = Math.PI * (0.36 + f * 0.38);
    const len = 0.22 - Math.abs(f - 0.35) * 0.09;
    basePts.push([bx0, by0]);
    tipPts.push([bx0 + Math.cos(ang3) * len, by0 + Math.sin(ang3) * len]);
  }
  const crestShape = new THREE.Shape();
  crestShape.moveTo(basePts[0][0], basePts[0][1] - 0.02);
  for (let i = 0; i < nSp; i++) {
    crestShape.lineTo(tipPts[i][0], tipPts[i][1]);
    if (i < nSp - 1) {
      const vx = (basePts[i][0] + basePts[i + 1][0]) * 0.28 + (tipPts[i][0] + tipPts[i + 1][0]) * 0.22;
      const vy = (basePts[i][1] + basePts[i + 1][1]) * 0.28 + (tipPts[i][1] + tipPts[i + 1][1]) * 0.22;
      crestShape.lineTo(vx, vy);
    }
  }
  crestShape.lineTo(basePts[nSp - 1][0], basePts[nSp - 1][1] - 0.02);
  crestShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      crestShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.18, 0, 0.42, [
          [0, "#3d7a36"],
          [0.45, "#8ec868"],
          [1, "#d8f294"],
        ]);
        fc.fillRect(-0.3, 0, 0.6, 0.5);
        for (let i = 0; i < nSp; i++) {
          fc.beginPath();
          fc.moveTo(basePts[i][0], basePts[i][1]);
          fc.lineTo(tipPts[i][0], tipPts[i][1]);
          fc.strokeStyle = rgbaHex("#d8f294", 0.72);
          fc.lineWidth = 0.004;
          fc.stroke();
        }
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Scalloped Rear Soft Dorsal & Notched Anal Fin
  const rearDShape = new THREE.Shape();
  rearDShape.moveTo(-0.075, 0.175);
  rearDShape.quadraticCurveTo(-0.125, 0.258, -0.17, 0.242);
  rearDShape.quadraticCurveTo(-0.225, 0.232, -0.252, 0.148);
  rearDShape.quadraticCurveTo(-0.256, 0.095, -0.225, 0.048);
  rearDShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      rearDShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, 0.25, -0.16, 0.06, [
          [0, "rgba(148,196,130,0.88)"],
          [1, "rgba(88,132,78,0.85)"],
        ]);
        fc.fillRect(-0.4, 0, 0.4, 0.35);
      },
      maxAnisotropy,
      true,
      0.0011,
      { transparent: true, opacity: 0.9 },
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.048, -0.182);
  analShape.lineTo(-0.076, -0.258);
  analShape.lineTo(-0.11, -0.222);
  analShape.lineTo(-0.152, -0.275);
  analShape.lineTo(-0.228, -0.162);
  analShape.lineTo(-0.225, -0.052);
  analShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.14, -0.27, -0.14, -0.06, [
          [0, "rgba(148,196,130,0.88)"],
          [1, "rgba(88,132,78,0.85)"],
        ]);
        fc.fillRect(-0.4, -0.35, 0.4, 0.35);
      },
      maxAnisotropy,
      true,
      0.0011,
      { transparent: true, opacity: 0.9 },
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Broad Downward Yellow-Green Pelvic Paddle Fin w/ 5 Rays
  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.118, -0.185);
  pelvShape.bezierCurveTo(0.125, -0.285, 0.088, -0.375, 0.048, -0.392);
  pelvShape.quadraticCurveTo(0.016, -0.322, 0.032, -0.198);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.08, -0.39, 0.08, -0.19, [
          [0, "#e8d442"],
          [1, "#4f7d46"],
        ]);
        fc.fillRect(-0.1, -0.45, 0.3, 0.3);
        drawFinRays(
          fc,
          [0.082, -0.192],
          [
            [0.105, -0.355],
            [0.085, -0.375],
            [0.062, -0.382],
            [0.042, -0.365],
            [0.028, -0.335],
          ],
          rgbaHex(OL, 0.35),
          0.0034
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Pectoral Fins
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.045, 0.048, -0.118, 0.024, -0.112, -0.018);
  pecShape.bezierCurveTo(-0.095, -0.052, -0.028, -0.042, 0, -0.014);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.045,
    -0.068,
    0.0028,
    0.0008,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.42)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.045, -0.068, 0.078);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.045, -0.068, -0.078);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const peterEz = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnoutU - xTail)),
    0.195,
    0.078
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.195,
    ey: 0.078,
    ez: peterEz,
    er: 0.045,
    irisColor: pal.iris || "#a8c828",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnoutL + 0.02, -0.045, "#eaff96", 0.054);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. PUFFER (Bubu — Inflating Spiny Globe, Fused Ivory Beak Plates, Saddles & Dots)
// =====================================================================================
function createPuffer3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#4a2f0a";
  const B = pal.body; // #f2c24e
  const D = pal.dark; // #b57d1e
  const BEL = pal.belly; // #fff8e2
  const FIN = pal.fin; // #ffd970
  const SPOT = pal.spot || "#6b4312";

  const ctx = createRigContext(OL, "#565656");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const scaleGroup = new THREE.Group();
  bodyGroup.add(scaleGroup);

  const xTail = -0.255;
  const xHead = 0.18;
  const xSnout = 0.285;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.042],
          [-0.17, 0.16],
          [-0.04, 0.238],
          [0.075, 0.242],
        ],
        [
          [0.075, 0.242],
          [0.175, 0.23],
          [0.25, 0.15],
          [xSnout, 0.012],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.042],
          [-0.17, -0.155],
          [-0.04, -0.232],
          [0.075, -0.236],
        ],
        [
          [0.075, -0.236],
          [0.175, -0.22],
          [0.25, -0.14],
          [xSnout, -0.014],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.032 + 0.195 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.2 ? base * clamp(1 - (x - 0.2) / 0.12, 0.48, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.29, 0.32, -0.26, 0.26, 512);

  // Paint Golden Puffer Coat + 3 Brown Saddles + 18 Spots + Flat Skin Spines matching sprites.ts
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.24, 0, 0.24, [
    [0, D],
    [0.36, B],
    [0.68, mixHex(B, BEL, 0.55)],
    [1, BEL],
  ]);
  bc.fillRect(-0.36, -0.3, 0.76, 0.6);

  drawGlow(bc, 0.04, -0.1, 0.17, 0.06, -0.14, "255,255,255", 0.36);

  // 3 Brown dorsal saddle blotches
  bc.fillStyle = rgbaHex(SPOT, 0.56);
  for (const [sx, sy, rx0, ry0] of [
    [0.07, -0.15, 0.046, 0.034],
    [-0.048, -0.17, 0.054, 0.038],
    [-0.155, -0.12, 0.04, 0.028],
  ]) {
    drawBlob(bc, sx, sy, rx0, ry0, 0);
  }

  // 18 warm brown spots
  bc.fillStyle = rgbaHex(SPOT, 0.82);
  for (let i = 0; i < 18; i++) {
    const sx = -0.21 + ((i * 0.7548776662 + 0.2) % 1) * 0.36;
    const sy = -0.18 + ((i * 0.5698402909 + 0.4) % 1) * 0.22;
    bc.beginPath();
    bc.arc(sx, sy, 0.0085, 0, Math.PI * 2);
    bc.fill();
  }

  // Little cream micro-spines lying along the skin
  bc.fillStyle = "#fff6dc";
  bc.strokeStyle = rgbaHex(OL, 0.48);
  bc.lineWidth = 0.0028;
  for (let i = 0; i < 12; i++) {
    const sx = -0.18 + ((i * 0.7548776662 + 0.1) % 1) * 0.28;
    const sy = -0.14 + ((i * 0.5698402909 + 0.6) % 1) * 0.24;
    bc.beginPath();
    bc.moveTo(sx, sy);
    bc.lineTo(sx - 0.024, sy - 0.008);
    bc.lineTo(sx - 0.005, sy + 0.015);
    bc.closePath();
    bc.fill();
    bc.stroke();
  }

  // Fused Ivory Beak Plates under cute snout smile
  bc.fillStyle = "#fffaf0";
  bc.strokeStyle = rgbaHex(OL, 0.78);
  bc.lineWidth = 0.0036;
  bc.beginPath();
  bc.rect(0.242, 0.002, 0.028, 0.024);
  bc.fill();
  bc.stroke();
  bc.beginPath();
  bc.moveTo(0.256, 0.002);
  bc.lineTo(0.256, 0.026);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const hx = xHead;
  const hy = -0.01;
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.012)) / (xSnout - (hx - 0.012)), 0, 1);
    return hy + 0.014 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx, 0.032, 0.014);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 48,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.006,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const pufferMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.215, x1: -0.105, top: true },
      { x0: -0.215, x1: -0.11, top: false },
    ],
    0.028
  );
  scaleGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, pufferMask)), makeOutlineMat(0, 0))
  );

  // Unified cranium owns upper snout; upperJawGroup kept as empty compat group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  scaleGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  scaleGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnout - 0.006,
      uSteps: 18,
      vSteps: 22,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.012)) / (xSnout - 0.006 - (hx - 0.012)), 0, 1);
        return hy + 0.002 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: (x, t) => evalZ(x, t) * 0.96,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? 0.78 + 0.2 * clamp((x - (hx - 0.02)) / 0.02, 0, 1) : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#521022",
    "#ec6a8e",
    [0.038, 0.034, 0.028],
    [0.03, 0.011, 0.018],
    0.034
  );

  // Radial Cream Spines projecting cleanly outward across inflated shell
  const spineGeo = track(new THREE.ConeGeometry(0.012, 0.048, 7));
  const spineMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#fff6dc",
      emissive: "#ffe4b5",
      emissiveIntensity: 0.16,
      roughness: 0.35,
    })
  );
  const spineMeshes: THREE.Mesh[] = [];
  for (let row = 0; row < 4; row++) {
    const phi = ((row + 0.65) / 4.3) * Math.PI - Math.PI * 0.48;
    for (let col = 0; col < 7; col++) {
      const ang = (col / 7) * Math.PI * 2 + row * 0.45;
      const sx = Math.cos(ang) * Math.cos(phi) * 0.21;
      const sy = Math.sin(phi) * 0.22;
      const sz = Math.sin(ang) * Math.cos(phi) * 0.2;
      if (sx > 0.14 || sx < -0.2) continue;
      const sm = new THREE.Mesh(spineGeo, spineMat);
      sm.position.set(sx, sy, sz);
      const dir = new THREE.Vector3(sx, sy, sz).normalize();
      sm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scaleGroup.add(sm);
      spineMeshes.push(sm);
    }
  }

  // Compact Rounded Fan Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  scaleGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.01, 0.038);
  tailShape.bezierCurveTo(-0.045, 0.105, -0.118, 0.098, -0.135, 0.035);
  tailShape.quadraticCurveTo(-0.15, 0, -0.135, -0.035);
  tailShape.bezierCurveTo(-0.118, -0.098, -0.045, -0.105, 0.01, -0.038);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(FIN, D, 0.3)],
        [0.55, FIN],
        [1, mixHex(FIN, "#ffffff", 0.42)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      drawFinRays(
        fc,
        [0.008, 0],
        [
          [-0.125, 0.068],
          [-0.132, 0.034],
          [-0.136, 0],
          [-0.132, -0.034],
          [-0.125, -0.068],
        ],
        rgbaHex(D, 0.34),
        0.0034
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Far-Back Rounded Dorsal & Anal Fins w/ 5 rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.105, 0.182);
  dorsalShape.bezierCurveTo(-0.118, 0.275, -0.205, 0.262, -0.215, 0.145);
  dorsalShape.lineTo(-0.188, 0.082);
  dorsalShape.closePath();
  scaleGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, 0.1, -0.16, 0.26, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#ffffff", 0.4)],
        ]);
        fc.fillRect(-0.3, 0, 0.3, 0.35);
        drawFinRays(
          fc,
          [-0.145, 0.135],
          [
            [-0.132, 0.248],
            [-0.155, 0.248],
            [-0.178, 0.236],
            [-0.198, 0.212],
          ],
          rgbaHex(D, 0.34),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.11, -0.178);
  analShape.bezierCurveTo(-0.122, -0.268, -0.205, -0.255, -0.215, -0.14);
  analShape.lineTo(-0.188, -0.082);
  analShape.closePath();
  scaleGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.003,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.16, -0.1, -0.16, -0.26, [
          [0, mixHex(FIN, D, 0.3)],
          [1, mixHex(FIN, "#ffffff", 0.4)],
        ]);
        fc.fillRect(-0.3, -0.35, 0.3, 0.35);
        drawFinRays(
          fc,
          [-0.145, -0.135],
          [
            [-0.132, -0.242],
            [-0.155, -0.242],
            [-0.178, -0.23],
            [-0.198, -0.205],
          ],
          rgbaHex(D, 0.34),
          0.0032
        );
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Sculling Rounded Pectoral Fins
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.04, 0.048, -0.105, 0.025, -0.098, -0.016);
  pecShape.bezierCurveTo(-0.082, -0.048, -0.025, -0.042, 0, -0.014);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.04,
    -0.06,
    0.0028,
    0.0008,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, FIN],
        [1, mixHex(FIN, "#ffffff", 0.42)],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.04, -0.06, 0.185);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.04, -0.06, -0.185);
  pecRight.add(pecObj.mesh.clone());
  scaleGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  scaleGroup.add(pelvicFin);

  const pufferEz = surfaceZAt(
    evalTop,
    evalUnifiedBot,
    (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
    0.19,
    0.068
  );
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, scaleGroup, {
    ex: 0.19,
    ey: 0.068,
    ez: pufferEz,
    er: 0.052,
    irisColor: pal.iris || "#1f4a6e",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, -0.005, "#fff2c2", 0.056);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    scaleGroup,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    onCustomPose: (p, open) => {
      const tightClamp = p.jaw < 0 ? clamp(-p.jaw, 0, 0.4) : 0;
      const puffK = (p.puff ? 1 : 0) + clamp(p.gulpT, 0, 1) * 0.45;
      scaleGroup.scale.set(1 + puffK * 0.18, 1 + puffK * 0.24, 1 + puffK * 0.28);
      for (const sm of spineMeshes) {
        sm.scale.setScalar(0.75 + puffK * 0.65);
      }
      lowerJawGroup.rotation.z = -open * 0.72 + tightClamp * 0.12;
      const hasMouth = open > 0.03;
      mouthInterior.visible = hasMouth;
      if (hasMouth) {
        mouthInterior.scale.set(0.85 + open * 0.22, 0.35 + open * 0.95, 0.78 + open * 0.18);
      }
      tongueMesh.visible = open > 0.045;
      tongueMesh.position.y = 0.001 + open * 0.008;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. TANG (Dori — Royal-Blue Disc, Black Palette Saddle, Blue Oval Window, Yellow Wedge Tail)
// =====================================================================================
function createTang3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#07174a";
  const B = "#1b6cff";
  const BD = "#0d35b8";
  const BL = "#4ca8ff";
  const BLK = "#0b1022";
  const YEL = pal.tail || "#ffe02a";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawTang 2D offset c.translate(-0.01, 0.008) in +Y down -> y3 = -(y2 + 0.008)
  const ox2 = -0.01;
  const oy2 = 0.008;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.235;
  const hx = 0.218; // 0.228 - 0.01
  const hy = -0.064; // -(0.056 + 0.008)
  const ux3 = 0.335; // 0.345 - 0.01
  const lx3 = 0.326;

  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.225, -0.042), to3D(-0.205, -0.16), to3D(-0.1, -0.255), to3D(0.055, -0.258)],
        [to3D(0.055, -0.258), to3D(0.185, -0.258), to3D(0.275, -0.195), to3D(0.305, -0.115)],
        [to3D(0.305, -0.115), to3D(0.326, -0.045), to3D(0.34, 0.012), [ux3, -0.052]],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.225, 0.025), to3D(-0.225, 0.062), to3D(-0.202, 0.105), to3D(-0.115, 0.195)],
        [to3D(-0.115, 0.195), to3D(-0.01, 0.262), to3D(0.135, 0.236), to3D(0.225, 0.188)],
        [to3D(0.225, 0.188), to3D(0.28, 0.145), to3D(0.312, 0.105), [lx3, -0.072]],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.018 + 0.092 * Math.sin(Math.pow(clamp(t, 0, 1), 0.7) * Math.PI);
    return x > 0.19 ? base * clamp(1 - (x - 0.19) / 0.18, 0.38, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.28, 0.37, -0.28, 0.28, 512);

  // Paint Dori Regal Blue Tang Flank: Royal Blue + Black Palette Saddle + Blue Window + Yellow Tail Wedge + Smile Dimple
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = makeLin(bc, 0.1, -0.26, -0.08, 0.25, [
    [0, BL],
    [0.45, B],
    [0.85, BD],
    [1, "#09268a"],
  ]);
  bc.fillRect(-0.34, -0.34, 0.8, 0.68);

  drawGlow(bc, 0.22, 0.02, 0.16, 0.16, 0.1, "90,190,255", 0.52);

  // Iconic Regal Blue Tang black palette saddle
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.moveTo(0.225, -0.165);
  bc.bezierCurveTo(0.145, -0.258, -0.08, -0.275, -0.24, -0.055);
  bc.lineTo(-0.24, 0.038);
  bc.bezierCurveTo(-0.15, 0.065, -0.095, 0.135, -0.005, 0.132);
  bc.bezierCurveTo(0.075, 0.128, 0.105, 0.055, 0.055, -0.005);
  bc.bezierCurveTo(0.005, -0.062, 0.075, -0.145, 0.225, -0.165);
  bc.closePath();
  bc.fill();

  // Electric-blue oval window inside black palette
  bc.fillStyle = makeLin(bc, -0.09, -0.04, -0.02, 0.06, [
    [0, BL],
    [1, B],
  ]);
  bc.beginPath();
  bc.ellipse(-0.055, -0.008, 0.078, 0.048, -0.14, 0, Math.PI * 2);
  bc.fill();

  // Yellow triangle root leading into yellow tail wedge
  bc.fillStyle = YEL;
  bc.beginPath();
  bc.moveTo(-0.125, -0.005);
  bc.lineTo(-0.245, -0.044);
  bc.lineTo(-0.245, 0.038);
  bc.closePath();
  bc.fill();

  // Happy cheek dimple & eye socket rim
  bc.strokeStyle = rgbaHex(OL, 0.82);
  bc.lineWidth = 0.0052;
  bc.beginPath();
  bc.arc(0.216, 0.044, 0.014, Math.PI * 0.7, Math.PI * 1.45);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.02)) / (ux3 - (hx - 0.02)), 0, 1);
    return hy + 0.012 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const tangMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.22, x1: 0.205, top: true },
      { x0: -0.225, x1: 0.115, top: false },
    ],
    0.026
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 44,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, tangMask)), makeOutlineMat(0, 0))
  );

  // Happy Mouth Jaw (upper snout unified cleanly into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 18,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.02)) / (lx3 - (hx - 0.02)), 0, 1);
        return hy - 0.008 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? smoothstep(hx - 0.02, hx + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#220a38",
    "#c9629c",
    [0.036, 0.032, 0.024],
    [0.028, 0.01, 0.016],
    0.036
  );

  // Yellow Wedge Tail with Thick Black Top & Bottom Borders
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.232, 0.007, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.016, 0.032);
  tailShape.bezierCurveTo(-0.045, 0.068, -0.115, 0.104, -0.185, 0.122);
  tailShape.quadraticCurveTo(-0.172, 0.0, -0.182, -0.118);
  tailShape.bezierCurveTo(-0.11, -0.1, -0.042, -0.064, 0.016, -0.032);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.02, 0, -0.18, 0, [
        [0, "#d8a212"],
        [0.45, YEL],
        [1, "#fff268"],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 6; i++) pts.push([-0.18, -0.09 + i * 0.036]);
      drawFinRays(fc, [0.02, 0], pts, "rgba(170, 110, 10, 0.38)", 0.0038);
      fc.strokeStyle = BLK;
      fc.lineWidth = 0.022;
      fc.beginPath();
      fc.moveTo(0.02, 0.034);
      fc.bezierCurveTo(-0.045, 0.068, -0.115, 0.104, -0.19, 0.122);
      fc.stroke();
      fc.beginPath();
      fc.moveTo(0.02, -0.034);
      fc.bezierCurveTo(-0.042, -0.064, -0.11, -0.1, -0.19, -0.118);
      fc.stroke();
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Continuous Low Royal-Blue Dorsal & Anal Ridges w/ Black Margin & Rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(...to3D(0.205, -0.19));
  dorsalShape.bezierCurveTo(...to3D(0.11, -0.292), ...to3D(-0.08, -0.305), ...to3D(-0.22, -0.185));
  dorsalShape.quadraticCurveTo(...to3D(-0.245, -0.11), ...to3D(-0.22, -0.048));
  dorsalShape.lineTo(...to3D(-0.08, -0.12));
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.02, 0.18, -0.06, 0.3, [
          [0, BD],
          [0.6, B],
          [1, BL],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 10; i++) pts.push([0.15 - i * 0.042, 0.28 - Math.abs(i - 4) * 0.012]);
        drawFinRays(fc, [-0.03, 0.11], pts, "rgba(8, 22, 80, 0.36)", 0.0036);
        fc.strokeStyle = BLK;
        fc.lineWidth = 0.014;
        fc.beginPath();
        fc.moveTo(...to3D(0.205, -0.19));
        fc.bezierCurveTo(...to3D(0.11, -0.292), ...to3D(-0.08, -0.305), ...to3D(-0.22, -0.185));
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(0.03, 0.228));
  analShape.bezierCurveTo(...to3D(-0.06, 0.278), ...to3D(-0.175, 0.248), ...to3D(-0.225, 0.142));
  analShape.quadraticCurveTo(...to3D(-0.238, 0.085), ...to3D(-0.218, 0.04));
  analShape.lineTo(...to3D(-0.08, 0.13));
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.06, -0.16, -0.12, -0.27, [
          [0, BD],
          [0.65, B],
          [1, BL],
        ]);
        fc.fillRect(-0.4, -0.4, 0.6, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 8; i++) pts.push([-0.01 - i * 0.032, -0.27 + i * 0.01]);
        drawFinRays(fc, [-0.09, -0.12], pts, "rgba(8, 22, 80, 0.36)", 0.0036);
        fc.strokeStyle = BLK;
        fc.lineWidth = 0.014;
        fc.beginPath();
        fc.moveTo(...to3D(0.03, 0.228));
        fc.bezierCurveTo(...to3D(-0.06, 0.278), ...to3D(-0.175, 0.248), ...to3D(-0.225, 0.142));
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Small Pelvic Fin
  const pelvShape = new THREE.Shape();
  pelvShape.moveTo(0.115, -0.205);
  pelvShape.quadraticCurveTo(0.09, -0.295, 0.015, -0.328);
  pelvShape.quadraticCurveTo(0.035, -0.25, 0.055, -0.215);
  pelvShape.closePath();
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  pelvicFin.add(
    makeSpineFinMesh(
      ctx,
      pelvShape,
      0,
      0,
      0.0028,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.08, -0.2, 0.02, -0.33, [
          [0, BD],
          [1, BL],
        ]);
        fc.fillRect(-0.1, -0.4, 0.3, 0.3);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Swept Pointed Pectoral Wing with Black Frame & Bright Yellow Wing Tip
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.045, 0.048, -0.115, 0.042, -0.155, 0.01);
  pecShape.bezierCurveTo(-0.11, -0.036, -0.045, -0.045, 0, -0.018);
  pecShape.closePath();

  const [pecOx, pecOy] = to3D(0.052, 0.068);
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.003,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.15, 0, [
        [0, B],
        [0.45, BL],
        [0.52, BLK],
        [1, BLK],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
      fc.fillStyle = YEL;
      drawBlob(fc, -0.1, 0.002, 0.042, 0.018, -0.05);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  pecObj.mesh.rotation.z = 0.62;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, 0.082);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -0.082);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const [ex, ey] = to3D(0.252, -0.072);
  const tangEz = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (ux3 - xTail)), ex, ey);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: tangEz,
    er: 0.052,
    sx: 0.88,
    irisColor: pal.iris || "#7c2228",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, ux3 + 0.02, hy, "#80c8ff", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.232,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 7. IDOL (Gill — Moorish Idol, Slender Kite Crest, Bulbous White Beak, Nasal Saddle & Whip)
// =====================================================================================
function createIdol3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const DK = "#261640";
  const DK2 = "#120822";
  const PUR = "#51397a";
  const WH = "#fffdf6";
  const CREAM = "#f6ecc2";
  const YEL = "#efd98a";
  const OL = pal.outline || "#0c0412";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Exact drawIdol 2D offset c.translate(0, 0.012) in +Y-down -> y3 = -(y2 + 0.012)
  const ox2 = 0.0;
  const oy2 = 0.012;
  const to3D = (x2: number, y2: number): Pt => [x2 + ox2, -(y2 + oy2)];

  const xTail = -0.056;
  const hx = 0.284;
  const hy = -0.004; // -(-0.008 + 0.012)
  const ux3 = 0.464;
  const lx3 = 0.454;

  // Strictly ascending-X upper profile matching drawIdol forehead, brow, concave bridge & arched bulbous beak!
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.056, -0.016), to3D(-0.025, -0.115), to3D(0.035, -0.235), to3D(0.114, -0.322)],
        [to3D(0.114, -0.322), to3D(0.185, -0.305), to3D(0.255, -0.215), to3D(0.305, -0.104)],
        [to3D(0.305, -0.104), to3D(0.326, -0.072), to3D(0.365, -0.09), to3D(0.422, -0.064)],
        [to3D(0.422, -0.064), to3D(0.448, -0.038), to3D(0.458, -0.022), to3D(0.464, -0.014)],
      ],
      24
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [to3D(-0.056, 0.016), to3D(-0.03, 0.095), to3D(0.085, 0.215), to3D(0.205, 0.277)],
        [to3D(0.205, 0.277), to3D(0.245, 0.248), to3D(0.288, 0.195), to3D(0.336, 0.138)],
        [to3D(0.336, 0.138), to3D(0.376, 0.072), to3D(0.408, 0.022), to3D(0.454, -0.006)],
      ],
      24
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.016 + 0.068 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.28 ? base * clamp(1 - (x - 0.28) / 0.22, 0.28, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.1, 0.5, -0.35, 0.35, 512);

  // Paint Exact Moorish Idol Coat: Yellow Stalk -> Cream-White Band -> Purple-Black Crescent Band -> Dark Mask w/ White Snout + Nasal Yellow Saddle!
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, ox2, oy2);

  bc.fillStyle = WH;
  bc.fillRect(-0.14, -0.38, 0.7, 0.76);

  // Warm cream fading to yellow at tail stalk
  bc.fillStyle = makeLin(bc, 0.02, 0, -0.06, 0, [
    [0, "#fbf3d0"],
    [1, YEL],
  ]);
  bc.fillRect(-0.1, -0.35, 0.12, 0.7);

  // Middle pure white band
  bc.fillStyle = makeLin(bc, 0, -0.3, 0, 0.3, [
    [0, "#ffffff"],
    [0.55, WH],
    [1, "#efe6c6"],
  ]);
  bc.fillRect(0.02, -0.35, 0.16, 0.7);

  // Rear purple-black band
  bc.beginPath();
  bc.moveTo(0.078, -0.32);
  bc.quadraticCurveTo(0.046, -0.03, 0.082, 0.22);
  bc.lineTo(0.125, 0.335);
  bc.lineTo(0.0, 0.38);
  bc.lineTo(0.01, 0.22);
  bc.quadraticCurveTo(-0.012, 0.0, -0.004, -0.19);
  bc.lineTo(0.0, -0.32);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.08, 0, -0.01, 0, [
    [0, DK],
    [1, DK2],
  ]);
  bc.fill();

  // Dark face mask + purple satin forehead/cheek sheen
  bc.beginPath();
  bc.moveTo(0.158, -0.36);
  bc.bezierCurveTo(0.126, -0.2, 0.122, -0.05, 0.138, 0.07);
  bc.quadraticCurveTo(0.15, 0.19, 0.19, 0.32);
  bc.lineTo(0.52, 0.32);
  bc.lineTo(0.52, -0.36);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.14, -0.1, 0.33, 0.05, [
    [0, DK2],
    [0.5, DK],
    [1, "#2e1c4c"],
  ]);
  bc.fill();

  drawGlow(bc, 0.215, -0.21, 0.09, 0.035, 0.95, "120,92,176", 0.52);
  drawGlow(bc, 0.2, 0.1, 0.05, 0.09, 0.2, "104,80,160", 0.32);

  // Swept white snout & cheek mask
  bc.beginPath();
  bc.moveTo(0.32, -0.082);
  bc.bezierCurveTo(0.285, -0.062, 0.228, -0.044, 0.205, 0.008);
  bc.bezierCurveTo(0.192, 0.062, 0.212, 0.145, 0.278, 0.212);
  bc.lineTo(0.34, 0.28);
  bc.lineTo(0.5, 0.28);
  bc.lineTo(0.5, -0.18);
  bc.closePath();
  bc.fillStyle = makeLin(bc, 0.32, -0.07, 0.34, 0.2, [
    [0, "#ffffff"],
    [0.55, "#f3f6fa"],
    [1, "#cad3e0"],
  ]);
  bc.fill();
  bc.strokeStyle = rgbaHex(DK2, 0.58);
  bc.lineWidth = 0.0044;
  bc.stroke();

  // Chin contour crease
  bc.beginPath();
  bc.moveTo(0.352, 0.038);
  bc.quadraticCurveTo(0.322, 0.07, 0.32, 0.112);
  bc.strokeStyle = "rgba(130, 140, 165, 0.34)";
  bc.lineWidth = 0.004;
  bc.stroke();

  // Bright yellow saddle tucked into concave nasal bridge
  bc.fillStyle = "#f4cb3c";
  bc.beginPath();
  bc.moveTo(0.292, -0.078);
  bc.quadraticCurveTo(0.314, -0.088, 0.338, -0.068);
  bc.quadraticCurveTo(0.315, -0.056, 0.288, -0.064);
  bc.closePath();
  bc.fill();
  bc.strokeStyle = rgbaHex(DK2, 0.45);
  bc.lineWidth = 0.0032;
  bc.stroke();

  // Heavy purple brow ridge & lower eye bag
  const [ex2, ey2, er2] = [0.238, -0.094, 0.038];
  bc.beginPath();
  bc.moveTo(ex2 - er2 * 1.3, ey2 - er2 * 1.02);
  bc.quadraticCurveTo(ex2 + er2 * 0.1, ey2 - er2 * 1.25, ex2 + er2 * 1.55, ey2 - er2 * 0.18);
  bc.strokeStyle = rgbaHex(PUR, 0.95);
  bc.lineWidth = 0.0085;
  bc.stroke();
  bc.beginPath();
  bc.ellipse(ex2, ey2 + 0.006, er2 * 1.18, er2 * 1.12, 0, Math.PI * 0.12, Math.PI * 0.82);
  bc.strokeStyle = rgbaHex(PUR, 0.9);
  bc.lineWidth = 0.0055;
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.02)) / (ux3 - (hx - 0.02)), 0, 1);
    return hy + 0.006 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const idolMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.058, x1: 0.16, top: true },
      { x0: -0.052, x1: 0.26, top: false },
    ],
    0.024
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 44,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, idolMask)), makeOutlineMat(0, 0))
  );

  // Bulbous White Arched Upper Beak (unified into cranium) & Concave Lower Chin Jaw
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 20,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.02)) / (lx3 - (hx - 0.02)), 0, 1);
        return hy - 0.002 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? smoothstep(hx - 0.02, hx + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#4a1020",
    "#e8708a",
    [0.036, 0.03, 0.022],
    [0.028, 0.01, 0.014],
    0.038
  );

  // Dark Tail Triangle w/ Cream Base & Purple Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.045, -0.057, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.012, 0.034);
  tailShape.bezierCurveTo(-0.05, 0.062, -0.12, 0.11, -0.18, 0.148);
  tailShape.quadraticCurveTo(-0.186, 0.13, -0.172, 0.112);
  tailShape.bezierCurveTo(-0.128, 0.07, -0.108, 0.03, -0.112, 0.008);
  tailShape.bezierCurveTo(-0.112, -0.02, -0.122, -0.055, -0.136, -0.082);
  tailShape.quadraticCurveTo(-0.118, -0.084, -0.098, -0.07);
  tailShape.bezierCurveTo(-0.06, -0.05, -0.02, -0.036, 0.012, -0.03);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0032,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.17, 0, [
        [0, CREAM],
        [0.16, YEL],
        [0.3, DK],
        [1, DK2],
      ]);
      fc.fillRect(-0.3, -0.3, 0.4, 0.6);
      drawFinRays(
        fc,
        [0.02, 0],
        [
          [-0.18, 0.12],
          [-0.17, 0.07],
          [-0.15, 0.02],
          [-0.15, -0.03],
          [-0.16, -0.075],
        ],
        rgbaHex(PUR, 0.52),
        0.0038
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Iconic Super-Long Soaring White Dorsal Streamer Whip w/ Dark Ribbon & Soft Yellow Rear Membrane!
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(...to3D(0.158, -0.29));
  dorsalShape.bezierCurveTo(...to3D(0.11, -0.385), ...to3D(0.01, -0.43), ...to3D(-0.085, -0.422));
  dorsalShape.bezierCurveTo(...to3D(-0.21, -0.41), ...to3D(-0.33, -0.365), ...to3D(-0.452, -0.31));
  dorsalShape.bezierCurveTo(...to3D(-0.33, -0.33), ...to3D(-0.22, -0.352), ...to3D(-0.13, -0.35));
  dorsalShape.bezierCurveTo(...to3D(-0.07, -0.348), ...to3D(-0.044, -0.262), ...to3D(-0.04, -0.13));
  dorsalShape.bezierCurveTo(...to3D(-0.07, -0.09), ...to3D(-0.075, -0.04), ...to3D(-0.058, 0.01));
  dorsalShape.lineTo(...to3D(0.06, -0.05));
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.003,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0.1, 0.2, -0.2, 0.42, [
          [0, WH],
          [0.5, "#fffbe8"],
          [1, "#f4eccc"],
        ]);
        fc.fillRect(-0.6, -0.1, 0.9, 0.65);
        // Soft yellow rear membrane
        fc.fillStyle = rgbaHex(YEL, 0.55);
        fc.beginPath();
        fc.moveTo(...to3D(-0.006, -0.16));
        fc.lineTo(...to3D(-0.1, -0.16));
        fc.lineTo(...to3D(-0.1, 0.05));
        fc.lineTo(...to3D(0.02, 0.05));
        fc.closePath();
        fc.fill();
        // Dark purple-black inner ribbon along underside of whip
        fc.beginPath();
        fc.moveTo(...to3D(0.06, -0.22));
        fc.bezierCurveTo(...to3D(0.034, -0.322), ...to3D(-0.03, -0.376), ...to3D(-0.1, -0.372));
        fc.bezierCurveTo(...to3D(-0.21, -0.362), ...to3D(-0.33, -0.336), ...to3D(-0.452, -0.31));
        fc.bezierCurveTo(...to3D(-0.33, -0.31), ...to3D(-0.22, -0.33), ...to3D(-0.13, -0.33));
        fc.bezierCurveTo(...to3D(-0.05, -0.33), ...to3D(-0.012, -0.26), ...to3D(-0.006, -0.16));
        fc.closePath();
        fc.fillStyle = makeLin(fc, 0, 0.2, -0.3, 0.38, [
          [0, DK2],
          [1, DK],
        ]);
        fc.fill();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Pointed Yellow-Black Anal Fin
  const analShape = new THREE.Shape();
  analShape.moveTo(...to3D(0.215, 0.262));
  analShape.bezierCurveTo(...to3D(0.17, 0.315), ...to3D(0.1, 0.35), ...to3D(0.03, 0.356));
  analShape.quadraticCurveTo(...to3D(0.012, 0.352), ...to3D(0.014, 0.334));
  analShape.bezierCurveTo(...to3D(0.0, 0.25), ...to3D(-0.032, 0.15), ...to3D(-0.052, 0.074));
  analShape.lineTo(...to3D(0.1, 0.08));
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, -0.1, 0, -0.36, [
          [0, CREAM],
          [1, YEL],
        ]);
        fc.fillRect(-0.2, -0.5, 0.6, 0.5);
        fc.beginPath();
        fc.moveTo(...to3D(0.3, 0.2));
        fc.lineTo(...to3D(0.075, 0.2));
        fc.quadraticCurveTo(...to3D(0.03, 0.26), ...to3D(0.012, 0.37));
        fc.lineTo(...to3D(0.3, 0.4));
        fc.closePath();
        fc.fillStyle = makeLin(fc, 0.05, -0.2, 0.15, -0.36, [
          [0, DK2],
          [1, DK],
        ]);
        fc.fill();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  // Twin Long Dark Purple-Black Pelvic Spikes
  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);
  for (const [bx0, by0, bx1, by1, tx, ty] of [
    [0.196, 0.262, 0.166, 0.262, 0.156, 0.412],
    [0.25, 0.23, 0.222, 0.248, 0.262, 0.37],
  ] as const) {
    const spShape = new THREE.Shape();
    spShape.moveTo(...to3D(bx0, by0));
    spShape.quadraticCurveTo(...to3D((bx0 + tx) / 2 + 0.016, (by0 + ty) / 2), ...to3D(tx, ty));
    spShape.quadraticCurveTo(...to3D((bx1 + tx) / 2 - 0.004, (by1 + ty) / 2), ...to3D(bx1, by1));
    spShape.closePath();
    pelvicFin.add(
      makeSpineFinMesh(
        ctx,
        spShape,
        0,
        0,
        0.0026,
        0.0007,
        (fc) => {
          fc.fillStyle = makeLin(fc, 0, -(by0 + oy2), 0, -(ty + oy2), [
            [0, DK2],
            [1, PUR],
          ]);
          fc.fillRect(-0.1, -0.5, 0.5, 0.4);
        },
        maxAnisotropy,
        true,
        0.001,
        undefined,
        (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
      ).mesh
    );
  }

  // Long Upward-Swept Dark Blade Pectoral Fin
  const [pecOx, pecOy] = to3D(0.14, 0.1);
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0.012, 0.018);
  pecShape.bezierCurveTo(-0.04, 0.082, -0.1, 0.15, -0.166, 0.19);
  pecShape.quadraticCurveTo(-0.166, 0.165, -0.142, 0.122);
  pecShape.bezierCurveTo(-0.1, 0.05, -0.062, -0.002, -0.024, -0.028);
  pecShape.quadraticCurveTo(0.012, -0.022, 0.012, 0.018);
  pecShape.closePath();

  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    pecOx,
    pecOy,
    0.0026,
    0.0007,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0.18, [
        [0, DK2],
        [0.6, DK],
        [1, PUR],
      ]);
      fc.fillRect(-0.3, -0.1, 0.4, 0.4);
      drawFinRays(
        fc,
        [0, 0],
        [
          [-0.16, 0.18],
          [-0.15, 0.145],
          [-0.12, 0.095],
        ],
        rgbaHex(PUR, 0.75),
        0.0036
      );
    },
    maxAnisotropy,
    false,
    0.001
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(pecOx, pecOy, 0.065);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(pecOx, pecOy, -0.065);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const [ex, ey] = to3D(0.238, -0.094);
  const idolEz = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (ux3 - xTail)), ex, ey);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex,
    ey,
    ez: idolEz,
    er: 0.038,
    irisColor: pal.iris || "#8a3324",
    rimColor: OL,
    lidColor: "#2f1e4e",
    lidTilt: 0.28,
    happyColor: "#d9ccf5",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, ux3 + 0.02, hy, "#fff0c4", 0.044);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.045,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 8. PARROT (Kakatua — Prominent Forehead Hump, Aqua Beak Lips, 6 Zigzag Chevrons)
// =====================================================================================
function createParrot3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#04261c";
  const B = pal.body; // #12b84a
  const D = pal.dark; // #06662c
  const BEL = pal.belly; // #3ae276
  const CYAN = pal.stripe || "#0098d8";
  const CHEV = pal.spot || "#06562a";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.21;
  const xSnout = 0.375;

  // Exact sprites.ts parrot profile: tall rounded cyan forehead hump + stout protruding beak!
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, 0.052],
          [-0.22, 0.155],
          [-0.08, 0.205],
          [0.08, 0.212],
        ],
        [
          [0.08, 0.212],
          [0.2, 0.224],
          [0.275, 0.212],
          [0.325, 0.115],
        ],
        [
          [0.325, 0.115],
          [0.348, 0.068],
          [0.365, 0.032],
          [xSnout, 0.005],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [xTail, -0.052],
          [-0.22, -0.142],
          [-0.08, -0.188],
          [0.08, -0.194],
        ],
        [
          [0.08, -0.194],
          [0.2, -0.175],
          [0.285, -0.125],
          [0.355, -0.042],
        ],
        [
          [0.355, -0.042],
          [0.365, -0.025],
          [0.37, -0.014],
          [xSnout - 0.004, -0.008],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.024 + 0.105 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.19, 0.38, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.36, 0.42, -0.24, 0.24, 512);

  // Paint Emerald -> Ocean Cyan Parrot Coat + Aqua Beak Lips + 6 Vertical Zigzag Chevrons
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0, -0.21, 0, 0.21, [
    [0, D],
    [0.42, B],
    [0.82, BEL],
    [1, mixHex(D, BEL, 0.45)],
  ]);
  bc.fillRect(-0.42, -0.28, 0.9, 0.56);

  // Cyan-blue ocean head transition fading smoothly into emerald body
  const hg = makeLin(bc, 0.05, 0, 0.34, 0, [
    [0, "rgba(0, 168, 216, 0)"],
    [0.45, "rgba(0, 168, 216, 0.85)"],
    [1, CYAN],
  ]);
  bc.fillStyle = hg;
  bc.fillRect(0.0, -0.28, 0.46, 0.56);

  drawGlow(bc, 0.08, -0.1, 0.18, 0.055, -0.12, "255,255,255", 0.34);

  // 6 Vertical Zigzag Dark-Green Chevron Stripes along body
  bc.strokeStyle = rgbaHex(CHEV, 0.76);
  bc.lineWidth = 0.011;
  bc.lineCap = "round";
  bc.lineJoin = "round";
  for (let c = 0; c < 6; c++) {
    const cx = 0.085 - c * 0.058;
    bc.beginPath();
    for (let s = 0; s <= 10; s++) {
      const sy = -0.18 + s * 0.036;
      const sx = cx + (s % 2 ? 0.012 : -0.012);
      if (s === 0) bc.moveTo(sx, sy);
      else bc.lineTo(sx, sy);
    }
    bc.stroke();
  }

  // Thick aqua-blue fused parrot beak lips highlight
  bc.fillStyle = "#5cf2ff";
  drawBlob(bc, 0.355, -0.01, 0.028, 0.016, 0);
  drawBlob(bc, 0.35, 0.014, 0.024, 0.015, 0);

  // Operculum arc
  bc.strokeStyle = rgbaHex(OL, 0.55);
  bc.lineWidth = 0.0068;
  bc.beginPath();
  bc.moveTo(0.185, -0.075);
  bc.quadraticCurveTo(0.155, 0.02, 0.125, 0.1);
  bc.stroke();

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const hx = xHead;
  const hy = -0.015;
  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.02)) / (xSnout - (hx - 0.02)), 0, 1);
    return hy + 0.022 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const parrotMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.258, x1: 0.145, top: true },
      { x0: -0.255, x1: -0.025, top: false },
    ],
    0.026
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xSnout,
      uSteps: 44,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0042, parrotMask)), makeOutlineMat(0, 0))
  );

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: xSnout - 0.004,
      uSteps: 18,
      vSteps: 22,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.02)) / (xSnout - 0.004 - (hx - 0.02)), 0, 1);
        return hy + 0.008 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? smoothstep(hx - 0.02, hx + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#4e1022",
    "#ec6a8e",
    [0.042, 0.036, 0.026],
    [0.03, 0.011, 0.016],
    0.04
  );

  // Truncate Teal Tail w/ Horizontal Dark-Green Ray Bands
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.012, 0.048);
  tailShape.quadraticCurveTo(-0.078, 0.118, -0.165, 0.125);
  tailShape.quadraticCurveTo(-0.18, 0, -0.165, -0.125);
  tailShape.quadraticCurveTo(-0.078, -0.118, 0.012, -0.048);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0036,
    0.001,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, mixHex(pal.tail || "#1ab8c8", D, 0.35)],
        [0.55, pal.tail || "#1ab8c8"],
        [1, mixHex(pal.tail || "#1ab8c8", "#ffffff", 0.42)],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      // Horizontal dark green ray bands matching sprites.ts parrot
      fc.strokeStyle = rgbaHex(CHEV, 0.62);
      fc.lineWidth = 0.016;
      for (const k of [-0.62, -0.3, 0, 0.3, 0.62]) {
        fc.beginPath();
        fc.moveTo(-0.02, k * 0.042);
        fc.lineTo(-0.17, k * 0.112);
        fc.stroke();
      }
      drawFinRays(
        fc,
        [0.01, 0],
        [
          [-0.16, 0.095],
          [-0.17, 0.045],
          [-0.172, 0],
          [-0.17, -0.045],
          [-0.16, -0.095],
        ],
        rgbaHex(OL, 0.32),
        0.0034
      );
    },
    maxAnisotropy,
    false,
    0.0012
  );
  tailPivot.add(tailFin.mesh);

  // Long Sweeping Cyan-Blue & Cobalt-Rimmed Dorsal & Anal Fins
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.145, 0.178);
  dorsalShape.bezierCurveTo(0.01, 0.278, -0.165, 0.285, -0.258, 0.185);
  dorsalShape.quadraticCurveTo(-0.25, 0.105, -0.232, 0.055);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.1, 0, 0.28, [
          [0, "#0b6276"],
          [1, "#18b8e0"],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.095 - i * 0.042, 0.268]);
        drawFinRays(fc, [-0.05, 0.12], pts, rgbaHex("#04261c", 0.35), 0.0036);
        fc.strokeStyle = "#125c88";
        fc.lineWidth = 0.012;
        fc.beginPath();
        fc.moveTo(0.145, 0.178);
        fc.bezierCurveTo(0.01, 0.278, -0.165, 0.285, -0.258, 0.185);
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(-0.025, -0.172);
  analShape.bezierCurveTo(-0.09, -0.272, -0.205, -0.268, -0.255, -0.172);
  analShape.quadraticCurveTo(-0.245, -0.1, -0.232, -0.055);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0036,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, -0.1, 0, -0.27, [
          [0, "#0b6276"],
          [1, "#18b8e0"],
        ]);
        fc.fillRect(-0.4, -0.4, 0.5, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 6; i++) pts.push([-0.06 - i * 0.036, -0.255]);
        drawFinRays(fc, [-0.14, -0.11], pts, rgbaHex("#04261c", 0.35), 0.0036);
        fc.strokeStyle = "#125c88";
        fc.lineWidth = 0.012;
        fc.beginPath();
        fc.moveTo(-0.025, -0.172);
        fc.bezierCurveTo(-0.09, -0.272, -0.205, -0.268, -0.255, -0.172);
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0012,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.012);
  pecShape.bezierCurveTo(-0.044, 0.052, -0.125, 0.028, -0.118, -0.018);
  pecShape.bezierCurveTo(-0.1, -0.056, -0.03, -0.045, 0, -0.015);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.095,
    -0.06,
    0.003,
    0.0009,
    (fc, b) => {
      fc.fillStyle = makeLin(fc, b.maxX, 0, b.minX, 0, [
        [0, "#18a8d8"],
        [1, "#7ff2ff"],
      ]);
      fc.fillRect(-0.3, -0.2, 0.4, 0.4);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.095, -0.06, 0.094);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.095, -0.06, -0.094);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const parrotEz = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (xSnout - xTail)), 0.228, 0.058);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.228,
    ey: 0.058,
    ez: parrotEz,
    er: 0.042,
    irisColor: pal.iris || "#143850",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#5cf2ff", 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.014,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 9. BUTTERFLY (Koral — Lemon-Gold Disc, Smooth Concave Snout, Eye Band & False Ocellus)
// =====================================================================================
function createButterfly3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const YEL = pal.body || "#ffd426";
  const GOLD = pal.dark || "#d9820a";
  const YEL_L = mixHex(YEL, "#ffffff", 0.38);
  const WH = pal.belly || "#fffef2";
  const BLK = pal.stripe || "#1b1412";
  const OL = pal.outline || "#291806";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.23;
  const hx = 0.305;
  const hy = -0.024;
  const ux3 = 0.435;
  const lx3 = 0.428;

  // Exact drawButterfly profile in +Y-up (y3 = -y2)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.23, 0.038],
          [-0.215, 0.17],
          [-0.112, 0.275],
          [0.032, 0.275],
        ],
        [
          [0.032, 0.275],
          [0.142, 0.275],
          [0.228, 0.205],
          [0.272, 0.105],
        ],
        [
          [0.272, 0.105],
          [0.305, 0.032],
          [0.365, 0.006],
          [ux3, -0.014],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.23, -0.045],
          [-0.212, -0.16],
          [-0.145, -0.255],
          [-0.035, -0.265],
        ],
        [
          [-0.035, -0.265],
          [0.082, -0.272],
          [0.185, -0.23],
          [0.245, -0.118],
        ],
        [
          [0.245, -0.118],
          [0.305, -0.068],
          [0.375, -0.042],
          [lx3, -0.026],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.016 + 0.072 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.22, 0.28, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.27, 0.47, -0.3, 0.3, 512);

  // Paint Lemon-Gold Butterfly Coat + Pearly Throat + Tapered Charcoal Eye Band + 4 Stripes + False Ocellus
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.02, -0.27, -0.04, 0.27, [
    [0, YEL_L],
    [0.48, YEL],
    [0.9, GOLD],
    [1, mixHex(GOLD, "#7c2d12", 0.28)],
  ]);
  bc.fillRect(-0.34, -0.34, 0.88, 0.68);

  // Soft pearly-white gill & throat gradient
  bc.fillStyle = makeLin(bc, 0.18, 0.02, 0.42, 0.06, [
    [0, WH],
    [0.65, rgbaHex(WH, 0.85)],
    [1, rgbaHex(YEL, 0)],
  ]);
  bc.beginPath();
  bc.moveTo(0.19, -0.06);
  bc.bezierCurveTo(0.175, 0.05, 0.185, 0.14, 0.235, 0.22);
  bc.lineTo(0.45, 0.12);
  bc.lineTo(0.45, -0.06);
  bc.closePath();
  bc.fill();

  // Smooth tapered charcoal eye-band curving from forehead through eye to cheek
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.moveTo(0.142, -0.265);
  bc.bezierCurveTo(0.205, -0.175, 0.242, -0.075, 0.248, 0.045);
  bc.quadraticCurveTo(0.238, 0.088, 0.202, 0.108);
  bc.bezierCurveTo(0.195, -0.02, 0.155, -0.14, 0.088, -0.275);
  bc.closePath();
  bc.fill();

  // 4 subtle vertical reef stripes
  bc.strokeStyle = rgbaHex(GOLD, 0.34);
  bc.lineWidth = 0.0075;
  for (let i = 0; i < 4; i++) {
    const sx = 0.065 - i * 0.062;
    bc.beginPath();
    bc.moveTo(sx, -0.21);
    bc.quadraticCurveTo(sx + 0.022, 0, sx - 0.005, 0.21);
    bc.stroke();
  }

  // White-ringed black false ocellus near rear dorsal fin
  bc.fillStyle = WH;
  bc.beginPath();
  bc.arc(-0.138, -0.128, 0.04, 0, Math.PI * 2);
  bc.fill();
  bc.fillStyle = BLK;
  bc.beginPath();
  bc.arc(-0.138, -0.128, 0.028, 0, Math.PI * 2);
  bc.fill();

  // Top highlight
  bc.fillStyle = "rgba(255, 255, 255, 0.26)";
  drawBlob(bc, 0.0, -0.205, 0.105, 0.03, -0.06);

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.02)) / (ux3 - (hx - 0.02)), 0, 1);
    return hy + 0.01 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const butterflyMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.228, x1: 0.11, top: true },
      { x0: -0.225, x1: 0.025, top: false },
    ],
    0.024
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 44,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, butterflyMask)), makeOutlineMat(0, 0))
  );

  // Slender Reef Pincer Jaw (upper beak unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 18,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.02)) / (lx3 - (hx - 0.02)), 0, 1);
        return hy - 0.002 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? smoothstep(hx - 0.02, hx + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0036, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#2b0f26",
    "#ec6a8e",
    [0.032, 0.024, 0.018],
    [0.024, 0.008, 0.012],
    0.032
  );

  // Translucent Cream-Gold Rounded Tail Fan w/ 7 Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.228, -0.014, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.018, 0.036);
  tailShape.bezierCurveTo(-0.048, 0.092, -0.122, 0.132, -0.172, 0.1);
  tailShape.bezierCurveTo(-0.19, 0.036, -0.19, -0.046, -0.17, -0.106);
  tailShape.bezierCurveTo(-0.118, -0.134, -0.045, -0.092, 0.018, -0.036);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.175, 0, [
        [0, YEL],
        [0.45, pal.tail || "#fff2a8"],
        [1, "rgba(255, 252, 232, 0.9)"],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.172, -0.084 + i * 0.028]);
      drawFinRays(fc, [0.015, 0], pts, rgbaHex(GOLD, 0.34), 0.0035);
    },
    maxAnisotropy,
    false,
    0.0011,
    { transparent: true, opacity: 0.92 }
  );
  tailPivot.add(tailFin.mesh);

  // Smooth Swept Dorsal (w/ black rear rim & 9 rays) & Anal Fin (8 rays)
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.11, 0.235);
  dorsalShape.bezierCurveTo(0.055, 0.342, -0.045, 0.382, -0.15, 0.33);
  dorsalShape.bezierCurveTo(-0.22, 0.275, -0.245, 0.15, -0.228, 0.045);
  dorsalShape.lineTo(-0.08, 0.155);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.18, -0.08, 0.37, [
          [0, GOLD],
          [0.45, YEL],
          [1, YEL_L],
        ]);
        fc.fillRect(-0.4, 0, 0.6, 0.5);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.075 - i * 0.036, 0.35 - Math.abs(i - 4) * 0.014]);
        drawFinRays(fc, [-0.06, 0.14], pts, rgbaHex(GOLD, 0.36), 0.0036);
        fc.strokeStyle = rgbaHex(BLK, 0.7);
        fc.lineWidth = 0.01;
        fc.beginPath();
        fc.moveTo(-0.148, 0.32);
        fc.quadraticCurveTo(-0.212, 0.255, -0.226, 0.075);
        fc.stroke();
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  const analShape = new THREE.Shape();
  analShape.moveTo(0.025, -0.242);
  analShape.bezierCurveTo(-0.045, -0.338, -0.155, -0.332, -0.222, -0.205);
  analShape.quadraticCurveTo(-0.242, -0.13, -0.225, -0.055);
  analShape.lineTo(-0.075, -0.15);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.04, -0.18, -0.12, -0.33, [
          [0, GOLD],
          [0.5, YEL],
          [1, YEL_L],
        ]);
        fc.fillRect(-0.4, -0.5, 0.5, 0.5);
        const pts: Pt[] = [];
        for (let i = 0; i < 8; i++) pts.push([0.0 - i * 0.032, -0.32 + i * 0.013]);
        drawFinRays(fc, [-0.09, -0.14], pts, rgbaHex(GOLD, 0.36), 0.0036);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Delicate White Pectoral Fin
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.01);
  pecShape.bezierCurveTo(-0.04, 0.042, -0.095, 0.035, -0.122, 0.005);
  pecShape.bezierCurveTo(-0.088, -0.032, -0.035, -0.042, 0, -0.015);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.135,
    -0.072,
    0.0024,
    0.0007,
    (fc) => {
      fc.fillStyle = rgbaHex(WH, 0.78);
      fc.fillRect(-0.25, -0.15, 0.4, 0.3);
    },
    maxAnisotropy,
    false,
    0.001,
    { transparent: true, opacity: 0.85 }
  );
  pecObj.mesh.rotation.z = 0.45;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.135, -0.072, 0.072);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.135, -0.072, -0.072);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const butterflyEz = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (ux3 - xTail)), 0.198, 0.092);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.198,
    ey: 0.092,
    ez: butterflyEz,
    er: 0.046,
    sx: 0.9,
    irisColor: pal.iris || "#1e293b",
    rimColor: "#ffffff",
    happyColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, ux3 + 0.02, hy, "#fff0a8", 0.046);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.228,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 10. SNAPPER (Kakap Merah — Proud Sloped Forehead, Pearl Scales, Two-Lobe Dorsal, V-Fork Tail)
// =====================================================================================
function createSnapper3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const R = pal.body || "#eb404c";
  const DK = pal.dark || "#9e1924";
  const RL = mixHex(R, "#ffad9e", 0.38);
  const BELLY = pal.belly || "#ffece8";
  const FIN = pal.fin || "#ff5c4d";
  const OL = pal.outline || "#3a0b10";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat, makeFishMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.248;
  const hx = 0.265;
  const hy = -0.042;
  const ux3 = 0.408;
  const lx3 = 0.4;

  // Exact drawSnapper profile in +Y-up (y3 = -y2)
  const topPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.248, 0.028],
          [-0.2, 0.115],
          [-0.085, 0.175],
          [0.055, 0.172],
        ],
        [
          [0.055, 0.172],
          [0.19, 0.168],
          [0.325, 0.088],
          [ux3, -0.026],
        ],
      ],
      22
    )
  );
  const botPts = sortAscX(
    sampleBezierChain(
      [
        [
          [-0.248, -0.024],
          [-0.236, -0.054],
          [-0.205, -0.078],
          [-0.08, -0.148],
        ],
        [
          [-0.08, -0.148],
          [0.05, -0.175],
          [0.165, -0.145],
          [0.24, -0.095],
        ],
        [
          [0.24, -0.095],
          [0.305, -0.086],
          [0.352, -0.068],
          [lx3, -0.038],
        ],
      ],
      22
    )
  );

  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.096 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.25 ? base * clamp(1 - (x - 0.25) / 0.19, 0.34, 1) : base;
  };

  const { mapUV, beginCanvas2D } = createWorldMapper(-0.28, 0.44, -0.2, 0.2, 512);

  // Paint Crimson Snapper -> Warm Pearl Belly + Subtle Overlapping Pearl Scales + Gill Arc
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  beginCanvas2D(bc, 0, 0);

  bc.fillStyle = makeLin(bc, 0.05, -0.175, 0.02, 0.175, [
    [0, DK],
    [0.36, R],
    [0.64, RL],
    [0.84, BELLY],
    [1, "#ffd8d2"],
  ]);
  bc.fillRect(-0.34, -0.26, 0.85, 0.52);

  // Subtle pearly scale shimmer arcs
  bc.strokeStyle = "rgba(255, 228, 220, 0.26)";
  bc.lineWidth = 0.0042;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const sx = 0.11 - col * 0.054 - (row % 2) * 0.024;
      const sy = -0.05 + row * 0.048;
      bc.beginPath();
      bc.arc(sx, sy, 0.021, -Math.PI * 0.36, Math.PI * 0.36);
      bc.stroke();
    }
  }

  // Gill operculum curve
  bc.strokeStyle = rgbaHex(DK, 0.74);
  bc.lineWidth = 0.0058;
  bc.lineCap = "round";
  bc.beginPath();
  bc.moveTo(0.215, -0.072);
  bc.bezierCurveTo(0.192, -0.01, 0.195, 0.048, 0.224, 0.095);
  bc.stroke();

  // Specular back sheen
  bc.fillStyle = "rgba(255, 220, 210, 0.28)";
  drawBlob(bc, 0.06, -0.125, 0.135, 0.02, 0.06);

  bc.restore();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const evalTop = (x: number) => interpCurveY(topPts, x);
  const evalBot = (x: number) => interpCurveY(botPts, x);
  const evalUpperPalate = (x: number) => {
    const t = clamp((x - (hx - 0.02)) / (ux3 - (hx - 0.02)), 0, 1);
    return hy + 0.014 * t;
  };
  const evalUnifiedBot = blendBotToPalate(evalBot, evalUpperPalate, hx);
  const evalMidY = (x: number) => (evalTop(x) + evalUnifiedBot(x)) * 0.5;
  const snapperMask = bodySpineOutlineMask(
    evalMidY,
    [
      { x0: -0.185, x1: 0.145, top: true },
      { x0: -0.182, x1: -0.02, top: false },
    ],
    0.026
  );

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: ux3,
      uSteps: 44,
      vSteps: 28,
      evalTopY: evalTop,
      evalBotY: evalUnifiedBot,
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      roundFront: true,
    })
  );
  const bodyMat = makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.004, snapperMask)), makeOutlineMat(0, 0))
  );

  // Clean Pointed Snapper Jaw (upper snout unified into cranium)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(upperJawGroup);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(hx, hy, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: hx - 0.02,
      xEnd: lx3,
      uSteps: 18,
      vSteps: 20,
      evalTopY: (x) => {
        const t = clamp((x - (hx - 0.02)) / (lx3 - (hx - 0.02)), 0, 1);
        return hy + 0.002 * t;
      },
      evalBotY: evalBot,
      evalHalfZ: evalZ,
      mapUV,
      localOffsetX: hx,
      localOffsetY: hy,
      roundFront: true,
      rearInsetAt: (x) => (x < hx ? smoothstep(hx - 0.02, hx + 0.008, x) * 0.92 + 0.08 : 1),
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0036, jawOutlineMask(0.008, 0.044))), makeOutlineMat(hx, hy))
  );

  const { mouthInterior, tongueMesh } = createOralParts(
    ctx,
    bodyGroup,
    lowerJawGroup,
    hx,
    hy,
    "#2b0918",
    "#e05a7e",
    [0.04, 0.034, 0.025],
    [0.032, 0.011, 0.016],
    0.042
  );

  // V-Forked Crimson Snapper Tail w/ 7 Rays
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.242, -0.008, 0);
  bodyGroup.add(tailPivot);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.015, 0.026);
  tailShape.bezierCurveTo(-0.052, 0.078, -0.125, 0.125, -0.175, 0.135);
  tailShape.quadraticCurveTo(-0.145, 0.042, -0.118, 0);
  tailShape.quadraticCurveTo(-0.145, -0.042, -0.172, -0.132);
  tailShape.bezierCurveTo(-0.122, -0.122, -0.05, -0.075, 0.015, -0.026);
  tailShape.closePath();

  const tailFin = makeSpineFinMesh(
    ctx,
    tailShape,
    0,
    0,
    0.0034,
    0.0009,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0.01, 0, -0.17, 0, [
        [0, DK],
        [0.5, pal.tail || "#d92b3a"],
        [1, FIN],
      ]);
      fc.fillRect(-0.3, -0.25, 0.4, 0.5);
      const pts: Pt[] = [];
      for (let i = 0; i < 7; i++) pts.push([-0.165, -0.105 + i * 0.035]);
      drawFinRays(fc, [0.015, 0], pts, rgbaHex(DK, 0.36), 0.0036);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  tailPivot.add(tailFin.mesh);

  // Smoothly Webbed Two-Lobe Snapper Dorsal Fin w/ Coral Margin & 9 Rays
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0.145, 0.145);
  dorsalShape.bezierCurveTo(0.118, 0.215, 0.065, 0.242, 0.0, 0.232);
  dorsalShape.bezierCurveTo(-0.068, 0.248, -0.145, 0.235, -0.182, 0.172);
  dorsalShape.quadraticCurveTo(-0.2, 0.118, -0.185, 0.062);
  dorsalShape.lineTo(-0.02, 0.12);
  dorsalShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dorsalShape,
      0,
      0,
      0.0034,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.14, -0.05, 0.24, [
          [0, DK],
          [0.58, FIN],
          [1, "#ff9e7d"],
        ]);
        fc.fillRect(-0.4, 0, 0.7, 0.4);
        const pts: Pt[] = [];
        for (let i = 0; i < 9; i++) pts.push([0.115 - i * 0.036, 0.235]);
        drawFinRays(fc, [-0.01, 0.11], pts, rgbaHex(DK, 0.38), 0.0036);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalTop(x) - 0.006, evalTop(x) + 0.018, y)
    ).mesh
  );

  // Clean Crimson Anal Fin w/ Coral Edge
  const analShape = new THREE.Shape();
  analShape.moveTo(-0.02, -0.145);
  analShape.bezierCurveTo(-0.06, -0.218, -0.135, -0.222, -0.18, -0.168);
  analShape.quadraticCurveTo(-0.198, -0.118, -0.182, -0.058);
  analShape.lineTo(-0.065, -0.115);
  analShape.closePath();

  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      analShape,
      0,
      0,
      0.0032,
      0.0009,
      (fc) => {
        fc.fillStyle = makeLin(fc, -0.06, -0.13, -0.12, -0.22, [
          [0, DK],
          [0.55, FIN],
          [1, "#ff9e7d"],
        ]);
        fc.fillRect(-0.4, -0.4, 0.5, 0.4);
      },
      maxAnisotropy,
      true,
      0.0011,
      undefined,
      (x, y) => smoothstep(evalBot(x) + 0.006, evalBot(x) - 0.018, y)
    ).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Swept Coral Pectoral Fin
  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0.009);
  pecShape.bezierCurveTo(-0.042, 0.042, -0.108, 0.036, -0.135, 0.004);
  pecShape.bezierCurveTo(-0.098, -0.034, -0.04, -0.042, 0, -0.015);
  pecShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pecShape,
    0.155,
    -0.048,
    0.0028,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.13, 0, [
        [0, R],
        [0.6, FIN],
        [1, "#ffb09c"],
      ]);
      fc.fillRect(-0.25, -0.15, 0.4, 0.3);
    },
    maxAnisotropy,
    false,
    0.0011
  );
  pecObj.mesh.rotation.z = 0.38;
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.155, -0.048, 0.082);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.155, -0.048, -0.082);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const snapperEz = surfaceZAt(evalTop, evalUnifiedBot, (x) => evalZ(x, (x - xTail) / (ux3 - xTail)), 0.285, 0.038);
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.285,
    ey: 0.038,
    ez: snapperEz,
    er: 0.042,
    sx: 0.92,
    irisColor: pal.iris || "#f59e0b",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, ux3 + 0.02, hy, "#ffd8d8", 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: -0.242,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    upperJawGroup,
    lowerJawGroup,
    mouthInterior,
    tongueMesh,
    tailPivot,
    pecLeft,
    pecRight,
    pelvicFin,
    eyesNormal,
    eyesPupil,
    eyesHappy,
    biteRing,
    biteRingMat,
    uniforms,
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// DISPATCHER
// =====================================================================================
export function createReefFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "minnow":
      return createMinnow3DRig(sp, maxAnisotropy);
    case "pierre":
      return createPierre3DRig(sp, maxAnisotropy);
    case "leon":
      return createLeon3DRig(sp, maxAnisotropy);
    case "peter":
      return createPeter3DRig(sp, maxAnisotropy);
    case "puffer":
      return createPuffer3DRig(sp, maxAnisotropy);
    case "tang":
      return createTang3DRig(sp, maxAnisotropy);
    case "idol":
      return createIdol3DRig(sp, maxAnisotropy);
    case "parrot":
      return createParrot3DRig(sp, maxAnisotropy);
    case "butterfly":
      return createButterfly3DRig(sp, maxAnisotropy);
    case "snapper":
      return createSnapper3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}
