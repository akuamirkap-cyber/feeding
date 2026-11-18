import * as THREE from "three";
import type { Species } from "./species";
import {
  addToothConeRow,
  baseGroups,
  buildLoftedSurface,
  buildOutlineGeometry,
  clamp,
  createBiteRing,
  createEyePair,
  createExtrudedFin,
  createOralParts,
  createRigContext,
  drawBlob,
  drawGlow,
  injectSpineShader,
  interpCurveY,
  makeLin,
  makePaintedFinTex,
  makeSpineFinMesh,
  mixHex,
  rgbaHex,
} from "./fish3dShared";
import type { Fish3DRig, Pt } from "./fish3dShared";

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

  const xTail = -0.33;
  const xHead = 0.24;
  const xSnout = 0.36;

  const topProf: Pt[] = [
    [xTail, 0.036],
    [-0.22, 0.085],
    [-0.08, 0.148],
    [0.08, 0.162],
    [0.2, 0.132],
    [xHead, 0.095],
    [0.31, 0.048],
    [xSnout, 0.008],
  ];
  const botProf: Pt[] = [
    [xTail, -0.036],
    [-0.22, -0.078],
    [-0.08, -0.135],
    [0.08, -0.148],
    [0.2, -0.118],
    [xHead, -0.082],
    [0.31, -0.042],
    [xSnout, -0.008],
  ];

  const evalZ = (x: number, t: number) => {
    const base = 0.024 + 0.088 * Math.sin(Math.pow(clamp(t, 0, 1), 0.78) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.16, 0.4, 1) : base;
  };

  // Painted body texture
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.28, B],
    [0.64, mixHex(B, BEL, 0.48)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Dorsal sheen
  drawGlow(bc, 270, 165, 195, 58, -0.04, "255,255,255", 0.3);

  // Stripe (fry_ekorkuning yellow stripe or fry_lentera cyan stripe)
  if (STR) {
    bc.fillStyle = rgbaHex(STR, isLentera ? 0.88 : 0.94);
    bc.beginPath();
    bc.moveTo(45, 250);
    bc.quadraticCurveTo(260, 224, 448, 252);
    bc.quadraticCurveTo(260, 258, 45, 272);
    bc.closePath();
    bc.fill();
  }

  // Minnow lateral teal spots (Hiromi Teri)
  if (sp.spots && pal.spot) {
    bc.fillStyle = rgbaHex(pal.spot, 0.68);
    for (let i = 0; i < 6; i++) {
      drawBlob(bc, 130 + i * 38, 240 + Math.sin(i * 0.9) * 10, 9, 14, 0.12);
    }
  }

  // Gill arc
  bc.strokeStyle = rgbaHex(D, 0.72);
  bc.lineWidth = 7;
  bc.lineCap = "round";
  bc.beginPath();
  bc.arc(388, 266, 46, -0.78, 0.84);
  bc.stroke();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.175) / 0.35, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 34,
      vSteps: 24,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.18 * s * s,
      rearBulge: 0.004,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, {
    emissiveIntensity: isLentera ? 0.38 : 0.26,
  });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  const bodyOl = new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0));
  bodyGroup.add(bodyMesh, bodyOl);

  // Bioluminescent 3D flank dots for Ikan Lentera (FRY_LENTERA)
  if (LURE) {
    const lureMat = track(
      new THREE.MeshBasicMaterial({
        color: LURE,
      })
    );
    const dotGeo = track(new THREE.SphereGeometry(0.011, 10, 8));
    for (let i = 0; i < 5; i++) {
      const lx = -0.17 + i * 0.075;
      const ly = -0.078 - Math.sin(i * 0.65) * 0.015;
      const lz = evalZ(lx, (lx - xTail) / (xSnout - xTail)) * 0.94;
      for (const s of [1, -1]) {
        const dm = new THREE.Mesh(dotGeo, lureMat);
        dm.position.set(lx, ly, s * lz);
        bodyGroup.add(dm);
      }
    }
  }

  // Upper Jaw Group
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => (x - xHead) * 0.02 - 0.006,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0045)), makeOutlineMat(xHead, 0.006))
  );

  // Lower Jaw Group
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.006, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.012,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.006,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045)), makeOutlineMat(xHead, -0.006))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.008, -0.002);

  // Forked Tail Fin
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.015, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.026);
  tShape.quadraticCurveTo(-0.085, 0.11, -0.155, 0.148);
  tShape.quadraticCurveTo(-0.105, 0.04, -0.075, 0);
  tShape.quadraticCurveTo(-0.105, -0.04, -0.155, -0.148);
  tShape.quadraticCurveTo(-0.085, -0.11, 0, -0.026);
  tShape.closePath();
  const tailMeshObj = makeSpineFinMesh(
    ctx,
    tShape,
    xTail + 0.015,
    0,
    0.004,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, -0.15, -0.16, 0.15, [
        [0, B],
        [0.45, TAIL],
        [1, mixHex(TAIL, "#ffffff", 0.35)],
      ]);
      fc.fillRect(-0.2, -0.2, 0.25, 0.4);
    },
    maxAnisotropy,
    false,
    0.0028,
    { transparent: true, opacity: 0.94, emissiveIntensity: isLentera ? 0.42 : 0.25 }
  );
  tailPivot.add(tailMeshObj.mesh);

  // Dorsal & Anal Fins
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.075, 0.13);
  dShape.quadraticCurveTo(-0.025, 0.26, 0.035, 0.24);
  dShape.quadraticCurveTo(0.055, 0.175, 0.068, 0.145);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.12, 0, 0.26, [
          [0, B],
          [0.65, FIN],
          [1, mixHex(FIN, "#ffffff", 0.32)],
        ]);
        fc.fillRect(-0.15, 0.05, 0.3, 0.28);
      },
      maxAnisotropy,
      true,
      0.0025
    ).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.15, -0.105);
  aShape.quadraticCurveTo(-0.09, -0.21, -0.025, -0.19);
  aShape.lineTo(-0.015, -0.128);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.2, -0.25, 0.25, 0.2);
      },
      maxAnisotropy,
      true,
      0.0022
    ).mesh
  );

  // Pectoral Fins
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.015);
  pShape.quadraticCurveTo(-0.06, 0.032, -0.095, -0.018);
  pShape.quadraticCurveTo(-0.05, -0.046, 0, -0.014);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.1, 0, [
        [0, B],
        [1, FIN],
      ]);
      fc.fillRect(-0.15, -0.08, 0.2, 0.16);
    },
    maxAnisotropy,
    false,
    0.002,
    { transparent: true, opacity: 0.9 }
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.115, -0.042, 0.098);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.115, -0.042, -0.098);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.228,
    ey: 0.032,
    ez: 0.068,
    er: 0.042,
    irisColor: pal.iris || "#1e56a0",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, LURE || "#d8f8ff", 0.046);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.015,
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
// 2. PIERRE (Kerapu Bintik — Blue Grouper with Pale Halo Spots & Spiny Dorsal Crest)
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
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.325;
  const xHead = 0.21;
  const xSnout = 0.345;

  const topProf: Pt[] = [
    [xTail, 0.065],
    [-0.22, 0.145],
    [-0.08, 0.238],
    [0.08, 0.246],
    [0.19, 0.205],
    [xHead, 0.185],
    [0.29, 0.115],
    [xSnout, 0.025],
  ];
  const botProf: Pt[] = [
    [xTail, -0.062],
    [-0.22, -0.142],
    [-0.08, -0.224],
    [0.08, -0.232],
    [0.19, -0.188],
    [xHead, -0.172],
    [0.29, -0.105],
    [xSnout, -0.022],
  ];

  const evalZ = (x: number, t: number) => {
    const base = 0.036 + 0.115 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.17, 0.35, 1) : base;
  };

  // Paint spotted blue grouper skin
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.34, B],
    [0.72, mixHex(B, BEL, 0.65)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);
  drawGlow(bc, 260, 130, 180, 62, -0.04, "255,255,255", 0.24);

  // Haloed pale grouper spots
  const spots: [number, number, number][] = [
    [95, 195, 16], [148, 160, 14], [202, 135, 18], [260, 130, 16], [316, 152, 14],
    [118, 256, 18], [176, 224, 15], [234, 210, 20], [295, 222, 17], [346, 208, 14],
    [142, 326, 15], [206, 294, 18], [264, 286, 16], [322, 292, 14], [240, 355, 14],
  ];
  for (const [sx, sy, sr] of spots) {
    bc.fillStyle = rgbaHex(SPOT, 0.28);
    drawBlob(bc, sx, sy, sr * 1.45, sr * 1.15, 0.15);
    bc.fillStyle = rgbaHex(SPOT, 0.88);
    drawBlob(bc, sx, sy, sr * 0.72, sr * 0.56, 0.15);
  }

  // Gill curve
  bc.strokeStyle = rgbaHex(OL, 0.7);
  bc.lineWidth = 8;
  bc.beginPath();
  bc.arc(368, 285, 72, -0.9, 0.85);
  bc.stroke();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.255) / 0.51, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0058)), makeOutlineMat(0, 0))
  );

  // Upper Jaw
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.01, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.01,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.01,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0045)), makeOutlineMat(xHead, 0.01))
  );

  // Lower Jaw (sturdy grouper under-lip)
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.02, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout + 0.006,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.005,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.94,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.02,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045)), makeOutlineMat(xHead, -0.02))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.01, "#4c1428", "#ff8da8");

  // Rounded Grouper Broom Tail with spots
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.015, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.055);
  tShape.bezierCurveTo(-0.08, 0.14, -0.15, 0.125, -0.155, 0.04);
  tShape.quadraticCurveTo(-0.165, 0, -0.155, -0.04);
  tShape.bezierCurveTo(-0.15, -0.125, -0.08, -0.14, 0, -0.055);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.015,
      0,
      0.005,
      0.0012,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
          [0, D],
          [0.65, FIN],
          [1, B],
        ]);
        fc.fillRect(-0.2, -0.18, 0.25, 0.36);
        fc.fillStyle = rgbaHex(SPOT, 0.85);
        for (const [sx, sy] of [[-0.05, 0.04], [-0.09, -0.02], [-0.11, 0.05], [-0.06, -0.05]]) {
          drawBlob(fc, sx, sy, 0.014, 0.012);
        }
      },
      maxAnisotropy,
      false,
      0.003
    ).mesh
  );

  // Spiny Serrated Dorsal Crest + Soft Rear Lobe
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.22, 0.125);
  dShape.quadraticCurveTo(-0.245, 0.245, -0.15, 0.265);
  dShape.lineTo(-0.08, 0.295);
  for (let i = 0; i < 6; i++) {
    const sx = -0.05 + i * 0.038;
    dShape.lineTo(sx, 0.315 - i * 0.006);
    dShape.lineTo(sx + 0.018, 0.275 - i * 0.005);
  }
  dShape.lineTo(0.16, 0.265);
  dShape.lineTo(0.175, 0.185);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.0045,
      0.0012,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.14, 0, 0.32, [
          [0, D],
          [0.65, FIN],
          [1, mixHex(FIN, "#ffffff", 0.28)],
        ]);
        fc.fillRect(-0.28, 0.1, 0.5, 0.25);
        fc.fillStyle = rgbaHex(SPOT, 0.82);
        for (let i = 0; i < 5; i++) drawBlob(fc, -0.16 + i * 0.07, 0.21 + (i % 2) * 0.03, 0.014, 0.011);
      },
      maxAnisotropy,
      true,
      0.0028
    ).mesh
  );

  // Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.22, -0.125);
  aShape.quadraticCurveTo(-0.18, -0.25, -0.09, -0.245);
  aShape.quadraticCurveTo(-0.03, -0.225, -0.02, -0.185);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.0045,
      0.0012,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.25, -0.28, 0.26, 0.2);
        fc.fillStyle = rgbaHex(SPOT, 0.78);
        drawBlob(fc, -0.14, -0.19, 0.014, 0.012);
        drawBlob(fc, -0.08, -0.2, 0.012, 0.01);
      },
      maxAnisotropy,
      true,
      0.0028
    ).mesh
  );

  // Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.032);
  pShape.bezierCurveTo(-0.085, 0.065, -0.14, 0.015, -0.125, -0.045);
  pShape.quadraticCurveTo(-0.06, -0.075, 0, -0.025);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.004,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.14, 0, [
        [0, B],
        [1, FIN],
      ]);
      fc.fillRect(-0.18, -0.1, 0.22, 0.2);
      fc.fillStyle = rgbaHex(SPOT, 0.8);
      drawBlob(fc, -0.07, 0.005, 0.012, 0.01);
    },
    maxAnisotropy,
    false,
    0.0024
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.065, 0.13);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.065, -0.13);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.225,
    ey: 0.076,
    ez: 0.095,
    er: 0.048,
    irisColor: pal.iris || "#d9920f",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, 0, "#d8f8ff", 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.015,
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
// 3. LEON LEPU (Lionfish Kipas — Zebra Stripes, 10-Spine Crown & Ragged Fan Pectorals)
// =====================================================================================
function createLeon3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#282206";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#d8e2c4";
  const STR = pal.stripe || "#f5f4c8";
  const SPOT = pal.spot || "#3c4828";

  const ctx = createRigContext(OL, "#545454");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.31;
  const xHead = 0.2;
  const xSnout = 0.34;

  const topProf: Pt[] = [
    [xTail, 0.048],
    [-0.2, 0.135],
    [-0.06, 0.205],
    [0.08, 0.215],
    [xHead, 0.17],
    [0.28, 0.098],
    [xSnout, 0.015],
  ];
  const botProf: Pt[] = [
    [xTail, -0.045],
    [-0.2, -0.125],
    [-0.06, -0.19],
    [0.08, -0.195],
    [xHead, -0.15],
    [0.28, -0.088],
    [xSnout, -0.015],
  ];

  const evalZ = (x: number, t: number) => {
    const base = 0.03 + 0.105 * Math.sin(Math.pow(clamp(t, 0, 1), 0.74) * Math.PI);
    return x > 0.21 ? base * clamp(1 - (x - 0.21) / 0.16, 0.36, 1) : base;
  };

  // Paint cream & olive-gold lionfish vertical zebra stripes
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.36, B],
    [0.74, mixHex(B, BEL, 0.55)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Cream & dark olive vertical zebra bars
  for (let i = 0; i < 8; i++) {
    const sx = 55 + i * 52;
    bc.fillStyle = rgbaHex(STR, 0.85);
    bc.beginPath();
    bc.moveTo(sx, 0);
    bc.quadraticCurveTo(sx + 16, 256, sx - 6, 512);
    bc.lineTo(sx + 18, 512);
    bc.quadraticCurveTo(sx + 38, 256, sx + 22, 0);
    bc.closePath();
    bc.fill();

    bc.fillStyle = rgbaHex(D, 0.6);
    bc.fillRect(sx - 9, 0, 9, 512);
  }
  // Golden lip cushion highlight near snout
  drawGlow(bc, 472, 270, 52, 42, 0, "245,215,90", 0.55);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.22) / 0.44, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Brow Horn Tentacles
  const tentGeo = track(new THREE.ConeGeometry(0.014, 0.095, 8));
  const tentMat = track(
    new THREE.MeshPhysicalMaterial({
      color: mixHex(B, STR, 0.35),
      emissive: B,
      emissiveIntensity: 0.22,
      roughness: 0.38,
    })
  );
  for (const s of [1, -1]) {
    const tm = new THREE.Mesh(tentGeo, tentMat);
    tm.position.set(0.21, 0.185, s * 0.048);
    tm.rotation.z = -0.35;
    tm.rotation.x = s * 0.22;
    bodyGroup.add(tm);
  }

  // Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.008, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.008,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.008,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0045)), makeOutlineMat(xHead, 0.008))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.012, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.005,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.012,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045)), makeOutlineMat(xHead, -0.012))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.005);

  // Sweeping Spiny 10-Ray Lionfish Dorsal Crown
  const crownShape = new THREE.Shape();
  crownShape.moveTo(-0.22, 0.11);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const xBase = -0.2 + t * 0.36;
    const xTip = -0.26 + t * 0.44;
    const yTip = 0.28 + Math.sin(t * Math.PI * 0.9) * 0.14;
    crownShape.lineTo(xTip, yTip);
    crownShape.lineTo(xBase + 0.022, 0.22 + Math.sin(t * Math.PI) * 0.05);
  }
  crownShape.lineTo(0.18, 0.15);
  crownShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      crownShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.12, 0, 0.44, [
          [0, B],
          [0.55, FIN],
          [1, STR],
        ]);
        fc.fillRect(-0.32, 0.08, 0.56, 0.4);
        fc.fillStyle = rgbaHex(SPOT, 0.72);
        for (let i = 0; i < 9; i++) {
          drawBlob(fc, -0.22 + i * 0.05, 0.26 + (i % 2) * 0.05, 0.009, 0.018, 0.2);
        }
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.22, -0.11);
  aShape.lineTo(-0.24, -0.26);
  aShape.lineTo(-0.14, -0.27);
  aShape.lineTo(-0.06, -0.25);
  aShape.lineTo(-0.01, -0.17);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.28, -0.32, 0.32, 0.24);
        fc.fillStyle = rgbaHex(SPOT, 0.68);
        for (let i = 0; i < 4; i++) drawBlob(fc, -0.2 + i * 0.048, -0.21, 0.01, 0.012);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Speckled Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.045);
  tShape.quadraticCurveTo(-0.09, 0.14, -0.17, 0.125);
  tShape.quadraticCurveTo(-0.19, 0, -0.17, -0.125);
  tShape.quadraticCurveTo(-0.09, -0.14, 0, -0.045);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.0035,
      0.001,
      (fc) => {
        fc.fillStyle = rgbaHex(TAIL, 0.88);
        fc.fillRect(-0.22, -0.16, 0.25, 0.32);
        fc.fillStyle = rgbaHex(SPOT, 0.72);
        for (let i = 0; i < 8; i++) {
          drawBlob(fc, -0.04 - (i % 3) * 0.045, -0.08 + Math.floor(i / 3) * 0.075, 0.009, 0.008);
        }
      },
      maxAnisotropy,
      false,
      0.0022,
      { transparent: true, opacity: 0.92 }
    ).mesh
  );

  // Broad Ragged Lionfish Curtain Pectoral Wings!
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.03);
  pShape.lineTo(-0.14, 0.09);
  pShape.lineTo(-0.2, 0.04);
  pShape.lineTo(-0.23, -0.03);
  pShape.lineTo(-0.2, -0.11);
  pShape.lineTo(-0.14, -0.17);
  pShape.lineTo(-0.04, -0.13);
  pShape.lineTo(0.02, -0.04);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.06, -0.22, -0.14, [
        [0, B],
        [0.45, FIN],
        [1, STR],
      ]);
      fc.fillRect(-0.28, -0.22, 0.34, 0.36);
      fc.fillStyle = rgbaHex(SPOT, 0.75);
      for (let i = 0; i < 10; i++) {
        drawBlob(fc, -0.05 - (i % 4) * 0.042, 0.03 - Math.floor(i / 4) * 0.058, 0.011, 0.009);
      }
    },
    maxAnisotropy,
    false,
    0.0024
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.06, 0.125);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.06, -0.125);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.21,
    ey: 0.068,
    ez: 0.088,
    er: 0.046,
    irisColor: pal.iris || "#987408",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#ffe89e", 0.05);

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
// 4. PETER (John Dory FF2 — Tall Emerald Disc, Gold Stripes, Famous Black Ocellus)
// =====================================================================================
function createPeter3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0b2410";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#688c66";
  const STR = pal.stripe || "#ffe61c";
  const SPOT = pal.spot || "#101a10";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.295;
  const xHead = 0.19;
  const xSnout = 0.345;

  const topProf: Pt[] = [
    [xTail, 0.046],
    [-0.19, 0.185],
    [-0.04, 0.292],
    [0.1, 0.298],
    [xHead, 0.245],
    [0.275, 0.135],
    [xSnout, 0.015],
  ];
  const botProf: Pt[] = [
    [xTail, -0.046],
    [-0.19, -0.18],
    [-0.04, -0.275],
    [0.1, -0.28],
    [xHead, -0.228],
    [0.275, -0.125],
    [xSnout, -0.025],
  ];

  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.08 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.2 ? base * clamp(1 - (x - 0.2) / 0.18, 0.34, 1) : base;
  };

  // Paint emerald body with gold longitudinal stripes & John Dory ocellus thumbprint
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.35, B],
    [0.72, mixHex(B, BEL, 0.65)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Longitudinal wavy gold stripes
  bc.strokeStyle = rgbaHex(STR, 0.78);
  bc.lineWidth = 10;
  for (let i = 0; i < 4; i++) {
    const sy = 155 + i * 58;
    bc.beginPath();
    bc.moveTo(42, sy);
    bc.bezierCurveTo(175, sy - 22, 310, sy + 20, 420, sy - 6);
    bc.stroke();
  }

  // Dark thumbprint ocellus ringed in pale yellow
  bc.fillStyle = "#fff49e";
  drawBlob(bc, 238, 252, 42, 42);
  bc.fillStyle = SPOT;
  drawBlob(bc, 238, 252, 29, 29);
  drawGlow(bc, 245, 244, 16, 16, 0, "140,180,140", 0.32);

  // Peduncle black bar near tail
  bc.fillStyle = rgbaHex(SPOT, 0.72);
  bc.fillRect(10, 170, 26, 170);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.31) / 0.62, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.25 * s * s,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.01, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.01,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.01,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0045)), makeOutlineMat(xHead, 0.01))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.016, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.006,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.006,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.94,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.016,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045)), makeOutlineMat(xHead, -0.016))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.006);

  // Tall 9-spine Mohawk Dorsal Crest
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.2, 0.175);
  dShape.lineTo(-0.18, 0.3);
  for (let i = 0; i < 8; i++) {
    const sx = -0.14 + i * 0.04;
    const peak = 0.44 - Math.abs(i - 3) * 0.025;
    dShape.lineTo(sx, peak);
    dShape.lineTo(sx + 0.02, peak - 0.045);
  }
  dShape.lineTo(0.16, 0.24);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.18, 0, 0.45, [
          [0, D],
          [0.6, FIN],
          [1, STR],
        ]);
        fc.fillRect(-0.24, 0.15, 0.44, 0.34);
      },
      maxAnisotropy,
      true,
      0.0026
    ).mesh
  );

  // Long Ventral Pelvic Paddle + Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.2, -0.175);
  aShape.lineTo(-0.16, -0.295);
  aShape.lineTo(0.02, -0.34);
  aShape.lineTo(0.09, -0.255);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.24, -0.38, 0.38, 0.24);
      },
      maxAnisotropy,
      true,
      0.0025
    ).mesh
  );

  // Broom Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.044);
  tShape.quadraticCurveTo(-0.08, 0.13, -0.155, 0.125);
  tShape.quadraticCurveTo(-0.17, 0, -0.155, -0.125);
  tShape.quadraticCurveTo(-0.08, -0.13, 0, -0.044);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
          [0, SPOT],
          [0.32, TAIL],
          [1, FIN],
        ]);
        fc.fillRect(-0.2, -0.16, 0.24, 0.32);
      },
      maxAnisotropy,
      false,
      0.0026
    ).mesh
  );

  // Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.026);
  pShape.quadraticCurveTo(-0.075, 0.052, -0.105, -0.02);
  pShape.quadraticCurveTo(-0.055, -0.056, 0, -0.02);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.14, -0.08, 0.18, 0.16);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.06, 0.098);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.06, -0.098);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.21,
    ey: 0.082,
    ez: 0.072,
    er: 0.044,
    irisColor: pal.iris || "#a8c828",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.022, 0, "#d8f8ff", 0.05);

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
// 5. PUFFER (Buntal Duri — Plump Yellow Puffer, Fused Ivory Beak & Bristling 3D Spines!)
// =====================================================================================
function createPuffer3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#4a2f0a";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const SPOT = pal.spot || "#6b4312";

  const ctx = createRigContext(OL, "#5a5a5a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const scaleGroup = new THREE.Group();
  bodyGroup.add(scaleGroup);

  const xTail = -0.27;
  const xHead = 0.22;
  const xSnout = 0.295;

  const topProf: Pt[] = [
    [xTail, 0.042],
    [-0.18, 0.175],
    [-0.04, 0.275],
    [0.11, 0.27],
    [xHead, 0.195],
    [xSnout, 0.035],
  ];
  const botProf: Pt[] = [
    [xTail, -0.042],
    [-0.18, -0.17],
    [-0.04, -0.275],
    [0.11, -0.268],
    [xHead, -0.19],
    [xSnout, -0.035],
  ];

  const evalZ = (x: number, t: number) => {
    const base = 0.038 + 0.185 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.2 ? base * clamp(1 - (x - 0.2) / 0.15, 0.42, 1) : base;
  };

  // Paint spotted yellow-cream puffer skin
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.36, B],
    [0.58, mixHex(B, BEL, 0.48)],
    [0.75, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Dorsal warm brown saddles
  bc.fillStyle = rgbaHex(SPOT, 0.56);
  drawBlob(bc, 155, 70, 58, 42, -0.15);
  drawBlob(bc, 295, 65, 64, 44, 0.12);
  // Flank dark spots
  bc.fillStyle = rgbaHex(SPOT, 0.76);
  for (const [sx, sy, sr] of [
    [110, 180, 14], [175, 160, 16], [242, 155, 15], [308, 175, 17],
    [135, 240, 13], [208, 226, 16], [278, 232, 14], [340, 215, 13],
  ]) {
    drawBlob(bc, sx, sy, sr, sr * 0.85, 0.2);
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.29) / 0.58, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead + 0.02,
      uSteps: 34,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      roundFront: true,
      rearBulge: 0.005,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  scaleGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0058)), makeOutlineMat(0, 0))
  );

  // Cute Fused Ivory Parrot Beak Jaws (Upper + Lower)
  const beakMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#fff8e8",
      emissive: "#fff4d8",
      emissiveIntensity: 0.22,
      roughness: 0.22,
      clearcoat: 0.65,
    })
  );
  const beakGeo = track(new THREE.SphereGeometry(0.036, 14, 10));
  beakGeo.scale(1.1, 0.56, 1.35);

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(0.245, 0.006, 0);
  scaleGroup.add(upperJawGroup);
  const ub = new THREE.Mesh(beakGeo, beakMat);
  ub.position.set(0.028, 0.004, 0);
  upperJawGroup.add(ub, new THREE.Mesh(track(buildOutlineGeometry(beakGeo, 0.003)), makeOutlineMat(0.245, 0.006, false)));
  ub.children[0]?.position.set(0, 0, 0);

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(0.245, -0.012, 0);
  scaleGroup.add(lowerJawGroup);
  const lb = new THREE.Mesh(beakGeo, beakMat);
  lb.position.set(0.025, -0.004, 0);
  lowerJawGroup.add(lb);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, scaleGroup, lowerJawGroup, 0.252, -0.004, "#54182a", "#ff8aa8", [0.03, 0.026, 0.024]);

  // Bristling 3D Cream Spines attached around torso
  const spineGeo = track(new THREE.ConeGeometry(0.011, 0.054, 6));
  spineGeo.translate(0, 0.025, 0);
  const spineMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#fff4d6",
      emissive: "#ffe4a8",
      emissiveIntensity: 0.2,
      roughness: 0.34,
    })
  );
  const spineMeshes: THREE.Mesh[] = [];
  const spinePts: [number, number][] = [
    [-0.14, 0.22], [-0.02, 0.265], [0.1, 0.25],
    [-0.14, -0.21], [-0.02, -0.26], [0.1, -0.24],
    [-0.08, 0.09], [0.04, 0.1], [-0.08, -0.09], [0.04, -0.09],
  ];
  for (const [sx, sy] of spinePts) {
    const t = clamp((sx - xTail) / (xSnout - xTail), 0.1, 0.9);
    const hz = evalZ(sx, t);
    const onSide = Math.abs(sy) < 0.14;
    for (const s of onSide ? [1, -1] : [0]) {
      const spMesh = new THREE.Mesh(spineGeo, spineMat);
      spMesh.position.set(sx, sy, s * hz * 0.92);
      if (onSide) {
        spMesh.rotation.x = s * (Math.PI * 0.48);
        spMesh.rotation.z = sy > 0 ? 0.25 : -0.25;
      } else {
        spMesh.rotation.z = sy > 0 ? 0.18 : Math.PI - 0.18;
      }
      scaleGroup.add(spMesh);
      spineMeshes.push(spMesh);
    }
  }

  // Compact Tail & Dorsal/Anal/Pectoral Fins
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  scaleGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.038);
  tShape.quadraticCurveTo(-0.07, 0.105, -0.125, 0.085);
  tShape.quadraticCurveTo(-0.14, 0, -0.125, -0.085);
  tShape.quadraticCurveTo(-0.07, -0.105, 0, -0.038);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.16, -0.14, 0.2, 0.28);
      },
      maxAnisotropy,
      false,
      0.0024
    ).mesh
  );

  const dShape = new THREE.Shape();
  dShape.moveTo(-0.2, 0.15);
  dShape.quadraticCurveTo(-0.21, 0.28, -0.12, 0.27);
  dShape.quadraticCurveTo(-0.08, 0.21, -0.09, 0.17);
  dShape.closePath();
  scaleGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.25, 0.1, 0.22, 0.22);
      },
      maxAnisotropy,
      true,
      0.0022
    ).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.025);
  pShape.quadraticCurveTo(-0.065, 0.065, -0.09, 0);
  pShape.quadraticCurveTo(-0.065, -0.065, 0, -0.025);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.12, -0.09, 0.16, 0.18);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.055, -0.02, 0.195);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.055, -0.02, -0.195);
  pecRight.add(pecObj.mesh.clone());
  scaleGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  scaleGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, scaleGroup, {
    ex: 0.165,
    ey: 0.085,
    ez: 0.145,
    er: 0.054,
    irisColor: pal.iris || "#1f4a6e",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, 0, "#fff4b8", 0.055);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.012,
    root,
    pitchGroup,
    yawGroup,
    bodyGroup,
    scaleGroup,
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
      const puffK = p.puff ? 1 : clamp(p.gulpT, 0, 1) * 0.7;
      scaleGroup.scale.set(1 + puffK * 0.08, 1 + puffK * 0.14, 1 + puffK * 0.14);
      for (const sm of spineMeshes) {
        const s = 0.75 + puffK * 0.65;
        sm.scale.set(s, s, s);
      }
      upperJawGroup.rotation.z = open * 0.22;
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. TANG (Dori — Royal Blue Disc, Black Painter's Palette Saddle, Sunny Yellow Tail)
// =====================================================================================
function createTang3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#07174a";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#ffd91f";
  const STR = pal.stripe || "#0b1026";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.31;
  const xHead = 0.21;
  const xSnout = 0.335;

  const topProf: Pt[] = [
    [xTail, 0.046],
    [-0.2, 0.165],
    [-0.04, 0.25],
    [0.1, 0.248],
    [xHead, 0.19],
    [0.29, 0.1],
    [xSnout, 0.014],
  ];
  const botProf: Pt[] = [
    [xTail, -0.046],
    [-0.2, -0.162],
    [-0.04, -0.245],
    [0.1, -0.242],
    [xHead, -0.184],
    [0.29, -0.095],
    [xSnout, -0.014],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.088 * Math.sin(Math.pow(clamp(t, 0, 1), 0.74) * Math.PI);
    return x > 0.21 ? base * clamp(1 - (x - 0.21) / 0.16, 0.35, 1) : base;
  };

  // Paint Royal Blue + Black Painter's Palette Saddle with Blue Window
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.36, B],
    [0.75, BEL],
    [1, B],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Black painter's palette saddle sweeping from eye back to peduncle
  bc.fillStyle = STR;
  bc.beginPath();
  bc.moveTo(42, 195);
  bc.bezierCurveTo(145, 70, 315, 75, 415, 195);
  bc.bezierCurveTo(360, 228, 345, 295, 275, 310);
  bc.bezierCurveTo(185, 326, 95, 285, 42, 240);
  bc.closePath();
  bc.fill();

  // Signature Blue Oval Window inside the black saddle
  bc.fillStyle = B;
  drawBlob(bc, 215, 200, 68, 42, -0.08);
  // Bright yellow surgeonfish peduncle scalpel spine near tail
  bc.fillStyle = TAIL;
  drawBlob(bc, 36, 256, 22, 10, 0);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.26) / 0.52, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.006,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0042)), makeOutlineMat(xHead, 0.006))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.008, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.008,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.008,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0042)), makeOutlineMat(xHead, -0.008))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.008, -0.003);

  // Sunny Yellow Tail Wedge with Black Edges
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.036);
  tShape.lineTo(-0.155, 0.128);
  tShape.quadraticCurveTo(-0.13, 0, -0.155, -0.128);
  tShape.lineTo(0, -0.036);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = TAIL;
        fc.fillRect(-0.2, -0.16, 0.24, 0.32);
        fc.fillStyle = STR;
        fc.fillRect(-0.2, 0.095, 0.24, 0.065);
        fc.fillRect(-0.2, -0.16, 0.24, 0.065);
      },
      maxAnisotropy,
      false,
      0.0026
    ).mesh
  );

  // Dorsal & Anal Fins (blue with black border)
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.22, 0.145);
  dShape.quadraticCurveTo(-0.18, 0.27, -0.02, 0.285);
  dShape.quadraticCurveTo(0.11, 0.275, 0.14, 0.215);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.26, 0.12, 0.44, 0.2);
        fc.fillStyle = STR;
        fc.fillRect(-0.26, 0.245, 0.44, 0.06);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.22, -0.145);
  aShape.quadraticCurveTo(-0.16, -0.265, -0.01, -0.275);
  aShape.quadraticCurveTo(0.08, -0.255, 0.095, -0.215);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.26, -0.32, 0.4, 0.2);
        fc.fillStyle = STR;
        fc.fillRect(-0.26, -0.32, 0.4, 0.065);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Yellow-tipped Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.025);
  pShape.quadraticCurveTo(-0.085, 0.055, -0.115, -0.02);
  pShape.quadraticCurveTo(-0.065, -0.058, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.12, 0, [
        [0, B],
        [0.55, B],
        [0.82, TAIL],
        [1, TAIL],
      ]);
      fc.fillRect(-0.16, -0.09, 0.2, 0.18);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.09, -0.055, 0.095);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.09, -0.055, -0.095);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.215,
    ey: 0.066,
    ez: 0.072,
    er: 0.046,
    irisColor: pal.iris || "#7c2228",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#ffe46b", 0.048);

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
// 7. IDOL (Gill — Moorish Idol, Tall Black/Cream Crescent, Arched Beak & Long Dorsal Whip)
// =====================================================================================
function createIdol3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0c0412";
  const B = pal.body; // cream-white
  const D = pal.dark;
  const STR = pal.stripe || "#1b0b26"; // deep ink black
  const SPOT = pal.spot || "#f2b838"; // golden saddle
  const TAIL = pal.tail || "#1d0c28";

  const ctx = createRigContext(OL, "#505050");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.255;
  const xHead = 0.165;
  const xSnout = 0.365;

  const topProf: Pt[] = [
    [xTail, 0.048],
    [-0.14, 0.28],
    [0.01, 0.365],
    [0.12, 0.295],
    [xHead, 0.18],
    [0.26, 0.062],
    [xSnout, 0.022],
  ];
  const botProf: Pt[] = [
    [xTail, -0.048],
    [-0.14, -0.275],
    [0.01, -0.35],
    [0.12, -0.275],
    [xHead, -0.165],
    [0.26, -0.065],
    [xSnout, -0.022],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.072 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.18 ? base * clamp(1 - (x - 0.18) / 0.21, 0.28, 1) : base;
  };

  // Paint Crisp Vertical Moorish Idol Cream / Black / Golden Saddle Bands
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = B;
  bc.fillRect(0, 0, 512, 512);

  // Rear cream-gold tint band
  bc.fillStyle = makeLin(bc, 0, 0, 512, 0, [
    [0, B],
    [0.4, mixHex(B, SPOT, 0.25)],
    [0.65, B],
    [1, B],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Rear black crescent band
  bc.fillStyle = STR;
  bc.beginPath();
  bc.moveTo(45, 0);
  bc.quadraticCurveTo(95, 256, 45, 512);
  bc.lineTo(148, 512);
  bc.quadraticCurveTo(185, 256, 148, 0);
  bc.closePath();
  bc.fill();

  // Iconic Anterior Bold Black Band through Eye
  bc.fillStyle = STR;
  bc.beginPath();
  bc.moveTo(260, 0);
  bc.quadraticCurveTo(290, 256, 260, 512);
  bc.lineTo(368, 512);
  bc.quadraticCurveTo(388, 256, 368, 0);
  bc.closePath();
  bc.fill();

  // Golden-Orange Saddle Patch on Snout!
  bc.fillStyle = SPOT;
  bc.beginPath();
  bc.ellipse(425, 215, 36, 42, 0.2, 0, Math.PI * 2);
  bc.fill();
  // Cute black chin dot / beak tip outline
  bc.fillStyle = STR;
  bc.fillRect(482, 232, 32, 46);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.37) / 0.74, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.26 * s * s,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Arched White Beak Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.008, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 18,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.006,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.008,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0042)), makeOutlineMat(xHead, 0.008))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.008, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.01,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.008,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0042)), makeOutlineMat(xHead, -0.008))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.015, -0.002, "#541428", "#ff8aa8", [0.032, 0.02, 0.018]);

  // Iconic Super-Long Soaring White Dorsal Whip!
  const whipShape = new THREE.Shape();
  whipShape.moveTo(-0.14, 0.255);
  whipShape.bezierCurveTo(-0.12, 0.39, -0.34, 0.42, -0.49, 0.365);
  whipShape.quadraticCurveTo(-0.32, 0.395, -0.09, 0.355);
  whipShape.quadraticCurveTo(-0.04, 0.35, 0.03, 0.32);
  whipShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      whipShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.25, -0.45, 0.4, [
          [0, STR],
          [0.24, B],
          [1, "#ffffff"],
        ]);
        fc.fillRect(-0.55, 0.2, 0.62, 0.26);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Dark Tail Wedge
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.044);
  tShape.lineTo(-0.14, 0.135);
  tShape.quadraticCurveTo(-0.12, 0, -0.14, -0.135);
  tShape.lineTo(0, -0.044);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = TAIL;
        fc.fillRect(-0.18, -0.16, 0.22, 0.32);
        fc.fillStyle = "#fff8dc";
        fc.fillRect(-0.18, -0.16, 0.032, 0.32);
      },
      maxAnisotropy,
      false,
      0.0024
    ).mesh
  );

  // Long Swept Ventral Pelvic Fins
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.15, -0.25);
  aShape.quadraticCurveTo(-0.22, -0.37, -0.09, -0.395);
  aShape.quadraticCurveTo(0.02, -0.36, 0.04, -0.29);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = STR;
        fc.fillRect(-0.26, -0.44, 0.34, 0.24);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Yellow-gold Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.quadraticCurveTo(-0.075, 0.045, -0.098, -0.018);
  pShape.quadraticCurveTo(-0.05, -0.048, 0, -0.016);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0032,
    0.0008,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.1, 0, [
        [0, B],
        [1, D],
      ]);
      fc.fillRect(-0.14, -0.08, 0.18, 0.16);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.06, -0.065, 0.082);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.06, -0.065, -0.082);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.135,
    ey: 0.078,
    ez: 0.068,
    er: 0.036,
    irisColor: pal.iris || "#7a2c24",
    rimColor: "#ffffff",
    lidColor: STR,
    lidTilt: -0.22,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#fff4b8", 0.046);

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
// 8. PARROT (Raja — Emerald Torso, Cyan Forehead Hump, Aqua Beak & Chevron Scales)
// =====================================================================================
function createParrot3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#04261c";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#1ab8c8";
  const STR = pal.stripe || "#0098d8";
  const SPOT = pal.spot || "#06562a";

  const ctx = createRigContext(OL, "#4c4c4c");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.22;
  const xSnout = 0.345;

  const topProf: Pt[] = [
    [xTail, 0.052],
    [-0.2, 0.145],
    [-0.04, 0.215],
    [0.12, 0.22],
    [xHead, 0.195],
    [0.295, 0.13],
    [xSnout, 0.018],
  ];
  const botProf: Pt[] = [
    [xTail, -0.05],
    [-0.2, -0.14],
    [-0.04, -0.205],
    [0.12, -0.21],
    [xHead, -0.178],
    [0.295, -0.11],
    [xSnout, -0.018],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.03 + 0.11 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.16, 0.38, 1) : base;
  };

  // Paint emerald-green body transitioning to electric cyan head + dark green chevrons
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 512, 0, [
    [0, D],
    [0.32, B],
    [0.64, mixHex(B, STR, 0.52)],
    [0.82, STR],
    [1, "#44e2ff"],
  ]);
  bc.fillRect(0, 0, 512, 512);
  bc.fillStyle = makeLin(bc, 0, 310, 0, 512, [
    [0, "rgba(0,0,0,0)"],
    [1, rgbaHex(BEL, 0.65)],
  ]);
  bc.fillRect(0, 310, 512, 202);

  // Dark emerald chevron vertical scale bars on flanks
  bc.strokeStyle = rgbaHex(SPOT, 0.65);
  bc.lineWidth = 10;
  bc.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const cx = 92 + i * 44;
    bc.beginPath();
    bc.moveTo(cx, 110);
    bc.lineTo(cx + 22, 256);
    bc.lineTo(cx, 400);
    bc.stroke();
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.23) / 0.46, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Aqua-blue fused Parrot Beak Plates on Upper/Lower Jaws
  const beakMat = track(
    new THREE.MeshPhysicalMaterial({
      color: "#5eeeff",
      emissive: "#22d3ee",
      emissiveIntensity: 0.26,
      roughness: 0.2,
      clearcoat: 0.75,
    })
  );
  const beakGeo = track(new THREE.SphereGeometry(0.036, 14, 10));
  beakGeo.scale(1.15, 0.6, 1.25);

  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.012,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.005,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  const uBeak = new THREE.Mesh(beakGeo, beakMat);
  uBeak.position.set(0.115, 0.008, 0);
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    uBeak,
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0042)), makeOutlineMat(xHead, 0.006))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.01, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.018,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.01,
      roundFront: true,
    })
  );
  const lBeak = new THREE.Mesh(beakGeo, beakMat);
  lBeak.position.set(0.105, -0.006, 0);
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    lBeak,
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0042)), makeOutlineMat(xHead, -0.01))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.012, -0.004);

  // Truncate Striped Cyan/Teal Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.048);
  tShape.lineTo(-0.155, 0.138);
  tShape.quadraticCurveTo(-0.135, 0, -0.155, -0.138);
  tShape.lineTo(0, -0.048);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
          [0, D],
          [0.45, TAIL],
          [1, FIN],
        ]);
        fc.fillRect(-0.2, -0.18, 0.24, 0.36);
        fc.fillStyle = "#ffe668";
        fc.fillRect(-0.18, 0.1, 0.2, 0.045);
        fc.fillRect(-0.18, -0.145, 0.2, 0.045);
      },
      maxAnisotropy,
      false,
      0.0026
    ).mesh
  );

  // Long Striped Cyan/Emerald Dorsal & Anal Ribbon Fins
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.23, 0.13);
  dShape.quadraticCurveTo(-0.22, 0.265, -0.04, 0.265);
  dShape.lineTo(0.14, 0.25);
  dShape.lineTo(0.16, 0.195);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.13, 0, 0.27, [
          [0, B],
          [0.5, "#ffe668"],
          [1, FIN],
        ]);
        fc.fillRect(-0.26, 0.1, 0.46, 0.22);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.23, -0.13);
  aShape.quadraticCurveTo(-0.21, -0.255, -0.04, -0.25);
  aShape.lineTo(0.07, -0.19);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, -0.13, 0, -0.26, [
          [0, B],
          [0.5, "#ffe668"],
          [1, FIN],
        ]);
        fc.fillRect(-0.26, -0.3, 0.36, 0.2);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.025);
  pShape.quadraticCurveTo(-0.08, 0.05, -0.115, -0.022);
  pShape.quadraticCurveTo(-0.06, -0.055, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.15, -0.08, 0.18, 0.16);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.09, -0.05, 0.115);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.09, -0.05, -0.115);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.215,
    ey: 0.072,
    ez: 0.088,
    er: 0.042,
    irisColor: pal.iris || "#143850",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#5eeeff", 0.05);

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
// 9. BUTTERFLY (Koral — Butterflyfish Disc, Pincer Snout, Eye Mask Band & Rear Ocellus)
// =====================================================================================
function createButterfly3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#291806";
  const B = pal.body; // sunny yellow
  const D = pal.dark;
  const BEL = pal.belly; // pearl cream
  const FIN = pal.fin;
  const TAIL = pal.tail || "#fff2a8";
  const STR = pal.stripe || "#1b1412"; // black mask band
  const SPOT = pal.spot || "#16110f";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.27;
  const xHead = 0.17;
  const xSnout = 0.355;

  const topProf: Pt[] = [
    [xTail, 0.044],
    [-0.16, 0.21],
    [-0.01, 0.3],
    [0.12, 0.245],
    [xHead, 0.135],
    [0.26, 0.046],
    [xSnout, 0.014],
  ];
  const botProf: Pt[] = [
    [xTail, -0.044],
    [-0.16, -0.205],
    [-0.01, -0.295],
    [0.12, -0.238],
    [xHead, -0.132],
    [0.26, -0.046],
    [xSnout, -0.014],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.075 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.18 ? base * clamp(1 - (x - 0.18) / 0.2, 0.26, 1) : base;
  };

  // Paint yellow/pearl body + black vertical eye band + rear false eyespot
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 512, 0, [
    [0, D],
    [0.28, B],
    [0.65, mixHex(B, BEL, 0.55)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Subtle diagonal scale lines
  bc.strokeStyle = rgbaHex(D, 0.28);
  bc.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    bc.beginPath();
    bc.moveTo(90 + i * 38, 120);
    bc.lineTo(135 + i * 38, 410);
    bc.stroke();
  }

  // Bold tapered Black Vertical Mask Band over the Eye!
  bc.fillStyle = STR;
  bc.beginPath();
  bc.moveTo(318, 0);
  bc.quadraticCurveTo(352, 256, 336, 512);
  bc.lineTo(395, 512);
  bc.quadraticCurveTo(405, 256, 372, 0);
  bc.closePath();
  bc.fill();

  // Rear False Eyespot haloed in cream
  bc.fillStyle = "#fffef2";
  drawBlob(bc, 118, 165, 34, 34);
  bc.fillStyle = SPOT;
  drawBlob(bc, 118, 165, 22, 22);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.31) / 0.62, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 34,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.24 * s * s,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Delicate Pincer Snout Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.005, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 16,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.004,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.005,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.004)), makeOutlineMat(xHead, 0.005))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.005, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.008,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.003,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.005,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004)), makeOutlineMat(xHead, -0.005))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.014, 0, "#5c1428", "#ff90b2", [0.028, 0.018, 0.016]);

  // Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.036);
  tShape.lineTo(-0.125, 0.115);
  tShape.quadraticCurveTo(-0.11, 0, -0.125, -0.115);
  tShape.lineTo(0, -0.036);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.0035,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.13, 0, [
          [0, FIN],
          [1, TAIL],
        ]);
        fc.fillRect(-0.16, -0.14, 0.2, 0.28);
      },
      maxAnisotropy,
      false,
      0.0022,
      { transparent: true, opacity: 0.92 }
    ).mesh
  );

  // Dorsal & Anal Fins
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.22, 0.135);
  dShape.quadraticCurveTo(-0.21, 0.34, -0.02, 0.34);
  dShape.quadraticCurveTo(0.11, 0.295, 0.115, 0.22);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.26, 0.1, 0.42, 0.28);
      },
      maxAnisotropy,
      true,
      0.0022
    ).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.22, -0.135);
  aShape.quadraticCurveTo(-0.2, -0.32, -0.02, -0.325);
  aShape.quadraticCurveTo(0.08, -0.28, 0.09, -0.215);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.26, -0.36, 0.38, 0.26);
      },
      maxAnisotropy,
      true,
      0.0022
    ).mesh
  );

  // Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.quadraticCurveTo(-0.07, 0.045, -0.092, -0.018);
  pShape.quadraticCurveTo(-0.05, -0.048, 0, -0.015);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.003,
    0.0008,
    (fc) => {
      fc.fillStyle = TAIL;
      fc.fillRect(-0.14, -0.08, 0.18, 0.16);
    },
    maxAnisotropy,
    false,
    0.0018,
    { transparent: true, opacity: 0.9 }
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.075, -0.045, 0.08);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.075, -0.045, -0.08);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.15,
    ey: 0.068,
    ez: 0.068,
    er: 0.042,
    irisColor: pal.iris || "#1e293b",
    rimColor: "#ffffff",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#fff4a8", 0.045);

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
// 10. SNAPPER (Kakap — Crimson Red Snapper, Silvery Belly, Serrated Crest, Forked Tail)
// =====================================================================================
function createSnapper3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#3a0b10";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#d92b3a";
  const STR = pal.stripe || "#ff8c75";

  const ctx = createRigContext(OL, "#525252");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.21;
  const xSnout = 0.35;

  const topProf: Pt[] = [
    [xTail, 0.05],
    [-0.2, 0.145],
    [-0.04, 0.23],
    [0.1, 0.228],
    [xHead, 0.18],
    [0.295, 0.105],
    [xSnout, 0.018],
  ];
  const botProf: Pt[] = [
    [xTail, -0.048],
    [-0.2, -0.138],
    [-0.04, -0.212],
    [0.1, -0.215],
    [xHead, -0.165],
    [0.295, -0.095],
    [xSnout, -0.016],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.028 + 0.105 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.16, 0.35, 1) : base;
  };

  // Paint Crimson Red Snapper skin
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.36, B],
    [0.72, mixHex(B, BEL, 0.58)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Subtle horizontal golden-salmon scale bands
  bc.strokeStyle = rgbaHex(STR, 0.45);
  bc.lineWidth = 6;
  for (let i = 0; i < 4; i++) {
    const sy = 155 + i * 48;
    bc.beginPath();
    bc.moveTo(45, sy);
    bc.quadraticCurveTo(240, sy - 14, 410, sy + 6);
    bc.stroke();
  }
  bc.strokeStyle = rgbaHex(OL, 0.65);
  bc.lineWidth = 7;
  bc.beginPath();
  bc.arc(368, 276, 68, -0.9, 0.8);
  bc.stroke();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.24) / 0.48, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 26,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Snapper Jaws (pointed snout + slight canine teeth)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.008, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.008,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.008,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0044)), makeOutlineMat(xHead, 0.008))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.01, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.005,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.92,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.01,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0044)), makeOutlineMat(xHead, -0.01))
  );

  const toothMat = track(new THREE.MeshBasicMaterial({ color: "#fffaf0" }));
  addToothConeRow(upperJawGroup, track, 3, 0.075, 0.125, () => -0.01, (t) => 0.028 * (1 - t * 0.4), 0.005, 0.015, false, toothMat);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.004);

  // Forked Crimson Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.044);
  tShape.lineTo(-0.16, 0.145);
  tShape.quadraticCurveTo(-0.105, 0.035, -0.08, 0);
  tShape.quadraticCurveTo(-0.105, -0.035, -0.16, -0.145);
  tShape.lineTo(0, -0.044);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
          [0, D],
          [0.5, TAIL],
          [1, FIN],
        ]);
        fc.fillRect(-0.2, -0.18, 0.24, 0.36);
      },
      maxAnisotropy,
      false,
      0.0026
    ).mesh
  );

  // Serrated Spiny Crimson Dorsal Crest
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.22, 0.13);
  dShape.lineTo(-0.2, 0.26);
  for (let i = 0; i < 6; i++) {
    const sx = -0.12 + i * 0.045;
    dShape.lineTo(sx, 0.305 - i * 0.008);
    dShape.lineTo(sx + 0.02, 0.268 - i * 0.006);
  }
  dShape.lineTo(0.14, 0.245);
  dShape.lineTo(0.15, 0.18);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      dShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.14, 0, 0.31, [
          [0, D],
          [0.55, FIN],
          [1, B],
        ]);
        fc.fillRect(-0.26, 0.1, 0.45, 0.24);
      },
      maxAnisotropy,
      true,
      0.0025
    ).mesh
  );

  // Crimson Anal Fin
  const aShape = new THREE.Shape();
  aShape.moveTo(-0.22, -0.125);
  aShape.lineTo(-0.18, -0.245);
  aShape.lineTo(-0.07, -0.235);
  aShape.lineTo(-0.03, -0.175);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      aShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = FIN;
        fc.fillRect(-0.26, -0.28, 0.26, 0.18);
      },
      maxAnisotropy,
      true,
      0.0024
    ).mesh
  );

  // Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.025);
  pShape.quadraticCurveTo(-0.085, 0.055, -0.115, -0.02);
  pShape.quadraticCurveTo(-0.06, -0.055, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(
    ctx,
    pShape,
    0,
    0,
    0.0035,
    0.001,
    (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.15, -0.08, 0.18, 0.16);
    },
    maxAnisotropy,
    false,
    0.002
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.09, -0.05, 0.11);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.09, -0.05, -0.11);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.21,
    ey: 0.068,
    ez: 0.084,
    er: 0.046,
    irisColor: pal.iris || "#f59e0b",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, "#ffd8d8", 0.05);

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
