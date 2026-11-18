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
// 1. BARRACUDA (Robert — Elongated Silver-Aqua Torpedo, Chevron Bars, Jutting Fang Jaw)
// =====================================================================================
function createBarracuda3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1b3d4a";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const STR = pal.stripe || "#2d5563";
  const SPOT = pal.spot || "#1b3540";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.4;
  const xHead = 0.22;
  const xSnout = 0.41;

  const topProf: Pt[] = [
    [xTail, 0.026],
    [-0.28, 0.065],
    [-0.1, 0.098],
    [0.08, 0.102],
    [xHead, 0.09],
    [0.33, 0.056],
    [xSnout, 0.012],
  ];
  const botProf: Pt[] = [
    [xTail, -0.026],
    [-0.28, -0.06],
    [-0.1, -0.092],
    [0.08, -0.096],
    [xHead, -0.085],
    [0.34, -0.052],
    [xSnout + 0.02, -0.008],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.072 * Math.sin(Math.pow(clamp(t, 0, 1), 0.78) * Math.PI);
    return x > 0.24 ? base * clamp(1 - (x - 0.24) / 0.2, 0.34, 1) : base;
  };

  // Paint Silver-Aqua Torpedo with 8 Dorsal Chevron Bars + Rear Charcoal Blotches
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.35, B],
    [0.64, mixHex(B, BEL, 0.5)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);
  drawGlow(bc, 260, 270, 210, 48, 0, "255,255,255", 0.34);

  // 8 dark slate dorsal chevron bars
  bc.fillStyle = rgbaHex(STR, 0.78);
  for (let i = 0; i < 8; i++) {
    const sx = 95 + i * 38;
    bc.beginPath();
    bc.moveTo(sx, 0);
    bc.lineTo(sx + 20, 0);
    bc.lineTo(sx + 6, 205);
    bc.lineTo(sx - 10, 175);
    bc.closePath();
    bc.fill();
  }
  // Charcoal rear flank blotches
  bc.fillStyle = rgbaHex(SPOT, 0.72);
  drawBlob(bc, 125, 290, 22, 16, 0.15);
  drawBlob(bc, 185, 305, 18, 14, -0.1);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout + 0.02 - xTail), 0.01, 0.99),
    clamp((y + 0.115) / 0.23, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 38,
      vSteps: 24,
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
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0048)), makeOutlineMat(0, 0))
  );

  // Upper Jaw + Sharp Fangs
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
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
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.004)), makeOutlineMat(xHead, 0.006))
  );

  // Jutting Underbite Lower Jaw + Prominent Fangs
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.01, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout + 0.022,
      uSteps: 18,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.94,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.01,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004)), makeOutlineMat(xHead, -0.01))
  );

  const toothMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  addToothConeRow(upperJawGroup, track, 5, 0.045, 0.165, () => -0.008, (t) => 0.026 * (1 - t * 0.45), 0.0042, 0.018, false, toothMat);
  addToothConeRow(lowerJawGroup, track, 5, 0.055, 0.185, () => 0.008, (t) => 0.024 * (1 - t * 0.45), 0.0042, 0.02, true, toothMat);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.015, -0.002);

  // Forked Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.026);
  tShape.lineTo(-0.175, 0.138);
  tShape.quadraticCurveTo(-0.11, 0.032, -0.085, 0);
  tShape.quadraticCurveTo(-0.11, -0.032, -0.175, -0.138);
  tShape.lineTo(0, -0.026);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.012,
      0,
      0.0038,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.17, 0, [
          [0, D],
          [0.6, FIN],
          [1, "#e8f6cc"],
        ]);
        fc.fillRect(-0.22, -0.18, 0.26, 0.36);
      },
      maxAnisotropy,
      false,
      0.0024
    ).mesh
  );

  // Twin Barracuda Dorsal Fins & Anal Fin
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(-0.04, 0.095);
  d1Shape.lineTo(-0.02, 0.21);
  d1Shape.lineTo(0.055, 0.175);
  d1Shape.lineTo(0.075, 0.095);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0035, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.1, 0.06, 0.22, 0.18);
    }, maxAnisotropy, true, 0.002).mesh
  );

  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.26, 0.065);
  d2Shape.lineTo(-0.27, 0.17);
  d2Shape.lineTo(-0.185, 0.145);
  d2Shape.lineTo(-0.16, 0.08);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0035, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.32, 0.04, 0.2, 0.16);
    }, maxAnisotropy, true, 0.002).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.26, -0.062);
  aShape.lineTo(-0.27, -0.16);
  aShape.lineTo(-0.175, -0.13);
  aShape.lineTo(-0.155, -0.078);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0035, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.32, -0.2, 0.2, 0.16);
    }, maxAnisotropy, true, 0.002).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.015);
  pShape.quadraticCurveTo(-0.075, 0.036, -0.1, -0.02);
  pShape.quadraticCurveTo(-0.05, -0.044, 0, -0.015);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0032, 0.0008, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.14, -0.08, 0.18, 0.16);
  }, maxAnisotropy, false, 0.002);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.115, -0.035, 0.084);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.115, -0.035, -0.084);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.245,
    ey: 0.035,
    ez: 0.06,
    er: 0.034,
    irisColor: pal.iris || "#d49b1a",
    rimColor: OL,
    lidColor: D,
    lidTilt: -0.22,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.03, 0, "#d8f8ff", 0.048);

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
// 2. SHARK / SHARK_SLEEK / LEOPARD (Bruce, Bruce Elegan, Toto)
// =====================================================================================
function createSharkFamily3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1a2130";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || pal.fin;
  const SPOT = pal.spot;
  const isClassic = sp.style === "shark";
  const isLeopard = sp.style === "leopard";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.37;
  const xHead = 0.21;
  const xSnout = isClassic ? 0.395 : 0.415;
  const bodyH = isClassic ? 0.165 : isLeopard ? 0.138 : 0.145;

  const topProf: Pt[] = [
    [xTail, 0.035],
    [-0.24, 0.088],
    [-0.06, bodyH],
    [0.12, bodyH * 0.94],
    [xHead, bodyH * 0.78],
    [0.32, 0.075],
    [xSnout, 0.008],
  ];
  const botProf: Pt[] = [
    [xTail, -0.032],
    [-0.24, -0.078],
    [-0.06, -bodyH * 0.88],
    [0.12, -bodyH * 0.86],
    [xHead, -bodyH * 0.7],
    [0.31, -0.072],
    [0.365, -0.025],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.024 + (isClassic ? 0.105 : 0.088) * Math.sin(Math.pow(clamp(t, 0, 1), 0.76) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.22, 0.3, 1) : base;
  };

  // Paint Counter-Shaded Shark Torso (Flame-Serrated for Bruce, Saddled Spots for Toto, Smooth for Bruce Elegan)
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.45, B],
    [1, B],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Belly counter-shading
  bc.fillStyle = BEL;
  bc.beginPath();
  bc.moveTo(0, 315);
  if (isClassic) {
    // Signature jagged flame-serrated belly border for Bruce
    for (let x = 25; x <= 490; x += 48) {
      bc.lineTo(x, 290 + Math.sin(x * 0.09) * 26);
      bc.lineTo(x + 24, 336);
    }
  } else {
    bc.quadraticCurveTo(256, 295, 512, 310);
  }
  bc.lineTo(512, 512);
  bc.lineTo(0, 512);
  bc.closePath();
  bc.fill();

  // Toto Leopard Saddles & Spots
  if (isLeopard && SPOT) {
    bc.fillStyle = rgbaHex(SPOT, 0.72);
    for (let i = 0; i < 6; i++) {
      drawBlob(bc, 85 + i * 62, 68, 28, 44, 0.1);
    }
    for (let i = 0; i < 16; i++) {
      drawBlob(bc, 70 + (i * 27) % 380, 130 + ((i * 53) % 140), 10 + (i % 3) * 3, 9 + (i % 2) * 3, 0.3);
    }
  }

  // Shark Gill Slits
  const gills = isClassic ? 4 : isLeopard ? 4 : 3;
  bc.strokeStyle = rgbaHex(OL, 0.75);
  bc.lineWidth = 6;
  bc.lineCap = "round";
  for (let i = 0; i < gills; i++) {
    const gx = 328 + i * 16;
    bc.beginPath();
    bc.arc(gx, 278, 38, -0.58, 0.62);
    bc.stroke();
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + bodyH * 1.1) / (bodyH * 2.2), 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 38,
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

  // Upper Jaw + Conical Shark Snout
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
      evalBotY: () => -0.018,
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

  // Underslung Lower Shark Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.025, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.04,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => 0.006,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.025,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0045)), makeOutlineMat(xHead, -0.025))
  );

  // Razor White Shark Teeth Rows!
  const toothMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  addToothConeRow(upperJawGroup, track, 6, 0.035, 0.145, () => -0.024, (t) => 0.042 * (1 - t * 0.55), 0.0055, 0.021, false, toothMat);
  addToothConeRow(lowerJawGroup, track, 5, 0.035, 0.125, () => 0.012, (t) => 0.035 * (1 - t * 0.52), 0.005, 0.018, true, toothMat);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.012, "#4f1024", "#ff7c9c", [0.042, 0.032, 0.03]);

  // Asymmetrical Heterocercal Shark Tail!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.032);
  tShape.bezierCurveTo(-0.085, 0.145, -0.175, 0.21, -0.22, 0.225);
  tShape.bezierCurveTo(-0.155, 0.12, -0.105, 0.04, -0.095, 0);
  tShape.bezierCurveTo(-0.11, -0.045, -0.15, -0.115, -0.185, -0.165);
  tShape.quadraticCurveTo(-0.085, -0.11, 0, -0.03);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.014,
      0,
      0.0045,
      0.0012,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.2, 0, -0.16, [
          [0, D],
          [0.55, TAIL],
          [1, B],
        ]);
        fc.fillRect(-0.26, -0.22, 0.3, 0.5);
        if (isLeopard && SPOT) {
          fc.fillStyle = rgbaHex(SPOT, 0.72);
          drawBlob(fc, -0.09, 0.1, 0.015, 0.012);
          drawBlob(fc, -0.15, 0.16, 0.013, 0.011);
        }
      },
      maxAnisotropy,
      false,
      0.0028
    ).mesh
  );

  // Tall Swept Shark Dorsal + Tiny 2nd Dorsal
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(-0.06, bodyH * 0.85);
  d1Shape.bezierCurveTo(-0.03, bodyH + 0.17, 0.025, bodyH + 0.185, 0.06, bodyH + 0.18);
  d1Shape.bezierCurveTo(0.055, bodyH + 0.09, 0.09, bodyH * 0.92, 0.11, bodyH * 0.88);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0045, 0.0012, (fc) => {
      fc.fillStyle = makeLin(fc, 0, bodyH, 0, bodyH + 0.18, [
        [0, B],
        [1, FIN],
      ]);
      fc.fillRect(-0.1, 0.06, 0.26, 0.32);
    }, maxAnisotropy, true, 0.0026).mesh
  );

  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.27, 0.065);
  d2Shape.lineTo(-0.28, 0.145);
  d2Shape.lineTo(-0.22, 0.115);
  d2Shape.lineTo(-0.2, 0.08);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0035, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.32, 0.04, 0.18, 0.15);
    }, maxAnisotropy, true, 0.002).mesh
  );

  // Swept Shark Pectoral Wings
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.024);
  pShape.bezierCurveTo(-0.06, 0.038, -0.155, -0.055, -0.175, -0.115);
  pShape.quadraticCurveTo(-0.075, -0.085, 0, -0.022);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.004, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.22, -0.15, 0.26, 0.22);
  }, maxAnisotropy, false, 0.0024);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.068, 0.115);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.068, -0.115);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.24,
    ey: 0.046,
    ez: 0.078,
    er: 0.036,
    irisColor: pal.iris || "#7a3b12",
    rimColor: OL,
    lidColor: D,
    lidTilt: -0.2,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, -0.005, "#d8f8ff", 0.056);

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
// 3. SAILFISH (Kilat — Cobalt/Gold/Silver Torpedo, Razor Bill, Towering Sail Dorsal!)
// =====================================================================================
function createSailfish3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#071638";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#123c96";
  const STR = pal.stripe || "#38beff";
  const SPOT = pal.spot || "#ffaa08";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.37;
  const xHead = 0.2;
  const xSnout = 0.34;
  const xBillTip = 0.56;

  const topProf: Pt[] = [
    [xTail, 0.028],
    [-0.24, 0.078],
    [-0.06, 0.125],
    [0.1, 0.132],
    [xHead, 0.112],
    [0.29, 0.065],
    [xSnout, 0.02],
  ];
  const botProf: Pt[] = [
    [xTail, -0.026],
    [-0.24, -0.072],
    [-0.06, -0.115],
    [0.1, -0.122],
    [xHead, -0.1],
    [0.29, -0.056],
    [xSnout, -0.015],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.018 + 0.072 * Math.sin(Math.pow(clamp(t, 0, 1), 0.78) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.3, 1) : base;
  };

  // Paint Cobalt/Gold/Silver Torpedo + 12 Cyan Vertical Bar Dot Columns
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.32, B],
    [0.54, SPOT],
    [0.72, mixHex(B, BEL, 0.72)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // 12 vertical glowing cyan dot-bar columns
  bc.fillStyle = rgbaHex(STR, 0.88);
  for (let col = 0; col < 11; col++) {
    const cx = 86 + col * 29;
    for (let row = 0; row < 4; row++) {
      drawBlob(bc, cx, 145 + row * 38, 6, 9);
    }
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.145) / 0.29, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 24,
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
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.005)), makeOutlineMat(0, 0))
  );

  // Upper Jaw + Razor Spear Bill
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
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.004)), makeOutlineMat(xHead, 0.006))
  );

  // Spear Bill Cone extending to xBillTip
  const billLen = xBillTip - (xSnout - 0.04);
  const billGeo = track(new THREE.ConeGeometry(0.014, billLen, 10));
  billGeo.rotateZ(-Math.PI * 0.5);
  const billMat = track(
    new THREE.MeshPhysicalMaterial({
      color: mixHex(D, "#4a6ca8", 0.35),
      emissive: D,
      emissiveIntensity: 0.22,
      roughness: 0.24,
      clearcoat: 0.6,
    })
  );
  const billMesh = new THREE.Mesh(billGeo, billMat);
  billMesh.position.set(xSnout - xHead + billLen * 0.36, 0.006, 0);
  billMesh.add(new THREE.Mesh(track(buildOutlineGeometry(billGeo, 0.0028)), makeOutlineMat(0, 0, false)));
  upperJawGroup.add(billMesh);

  // Lower Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.008, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout + 0.045,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.85,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.008,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038)), makeOutlineMat(xHead, -0.008))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.002);

  // Towering Scalloped Sailfish Dorsal Sail!
  const sailShape = new THREE.Shape();
  sailShape.moveTo(-0.24, 0.082);
  const peaks = 8;
  for (let i = 0; i < peaks; i++) {
    const t0 = i / (peaks - 1);
    const sx = -0.22 + t0 * 0.38;
    const h = 0.24 + Math.sin(t0 * Math.PI * 0.82) * 0.24;
    sailShape.lineTo(sx, h);
    if (i < peaks - 1) sailShape.lineTo(sx + 0.026, h - 0.032);
  }
  sailShape.lineTo(0.18, 0.11);
  sailShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(
      ctx,
      sailShape,
      0,
      0,
      0.004,
      0.001,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0.1, 0, 0.48, [
          [0, D],
          [0.45, FIN],
          [0.85, STR],
          [1, SPOT],
        ]);
        fc.fillRect(-0.28, 0.06, 0.5, 0.45);
        fc.fillStyle = rgbaHex("#071638", 0.52);
        for (let i = 0; i < 12; i++) {
          drawBlob(fc, -0.18 + (i % 4) * 0.095, 0.18 + Math.floor(i / 4) * 0.075, 0.011, 0.011);
        }
      },
      maxAnisotropy,
      true,
      0.0026
    ).mesh
  );

  // Trailing Long Pelvic Blades
  const pelShape = new THREE.Shape();
  pelShape.moveTo(0.06, -0.105);
  pelShape.quadraticCurveTo(-0.04, -0.24, -0.19, -0.265);
  pelShape.quadraticCurveTo(-0.06, -0.185, 0.09, -0.115);
  pelShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, pelShape, 0, 0, 0.0032, 0.0008, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.22, -0.3, 0.34, 0.22);
    }, maxAnisotropy, true, 0.002).mesh
  );

  // Crescent Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.025);
  tShape.bezierCurveTo(-0.08, 0.135, -0.15, 0.2, -0.19, 0.215);
  tShape.bezierCurveTo(-0.135, 0.11, -0.09, 0.035, -0.08, 0);
  tShape.bezierCurveTo(-0.09, -0.035, -0.135, -0.11, -0.19, -0.215);
  tShape.bezierCurveTo(-0.15, -0.2, -0.08, -0.135, 0, -0.025);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.012, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = TAIL;
      fc.fillRect(-0.24, -0.25, 0.28, 0.5);
    }, maxAnisotropy, false, 0.0024).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.018);
  pShape.quadraticCurveTo(-0.09, 0.04, -0.135, -0.035);
  pShape.quadraticCurveTo(-0.06, -0.055, 0, -0.016);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0035, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.18, -0.08, 0.22, 0.16);
  }, maxAnisotropy, false, 0.002);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.085, -0.048, 0.09);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.085, -0.048, -0.09);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.22,
    ey: 0.036,
    ez: 0.064,
    er: 0.036,
    irisColor: pal.iris || "#7a3b12",
    rimColor: SPOT,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xBillTip + 0.01, 0, STR, 0.052);

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
// 4. STINGRAY (Pari — Undulating Sapphire Diamond Wings, Sky-Blue Spots & Whip Tail)
// =====================================================================================
function createStingray3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#071638";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const SPOT = pal.spot || "#74c2f6";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  // Slightly pitch/roll ray posture inside bodyGroup? Keep neutral here and let 3D wings extend generously in Z & Y-camber!
  const xBack = -0.22;
  const xNose = 0.28;

  const topProf: Pt[] = [
    [xBack, 0.025],
    [-0.1, 0.068],
    [0.04, 0.092],
    [0.16, 0.088],
    [0.24, 0.048],
    [xNose, 0.01],
  ];
  const botProf: Pt[] = [
    [xBack, -0.022],
    [-0.1, -0.048],
    [0.04, -0.06],
    [0.16, -0.056],
    [0.24, -0.036],
    [xNose, -0.01],
  ];
  // Broad flat central cranial ridge + diamond wings
  const evalZ = (_x: number, t: number) => 0.04 + 0.26 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);

  // Paint Sapphire Mantle speckled with sky-blue spots + cream belly
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.45, B],
    [0.56, mixHex(B, BEL, 0.4)],
    [0.64, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Sky-blue leopard ray spots across dorsal mantle
  bc.fillStyle = rgbaHex(SPOT, 0.9);
  for (let i = 0; i < 20; i++) {
    const sx = 64 + ((i * 67) % 375);
    const sy = 36 + ((i * 43) % 210);
    drawBlob(bc, sx, sy, 12 + (i % 3) * 4, 8 + (i % 2) * 3, 0.18);
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xBack) / (xNose - xBack), 0.01, 0.99),
    clamp((y + 0.095) / 0.19, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xBack,
      xEnd: xNose,
      uSteps: 36,
      vSteps: 28,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      taper: (s) => 1 - 0.06 * s * s,
      roundFront: true,
      rearBulge: 0.004,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex);
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Broad Diamond Pectoral Wings (angled down/out in +-Z, hinged for graceful manta-ray wing undulation!)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.18, 0.02);
  wingShape.bezierCurveTo(-0.08, 0.24, 0.06, 0.27, 0.18, 0.14);
  wingShape.lineTo(0.21, 0.01);
  wingShape.closePath();
  const wingObj = makeSpineFinMesh(
    ctx,
    wingShape,
    0,
    0,
    0.008,
    0.002,
    (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, 0, 0.28, [
        [0, B],
        [0.65, D],
        [1, mixHex(D, SPOT, 0.25)],
      ]);
      fc.fillRect(-0.24, -0.02, 0.5, 0.34);
      fc.fillStyle = rgbaHex(SPOT, 0.88);
      for (const [wx, wy, wr] of [
        [-0.08, 0.09, 0.018], [-0.01, 0.15, 0.02], [0.06, 0.12, 0.016],
        [0.02, 0.06, 0.015], [0.11, 0.07, 0.015], [-0.04, 0.2, 0.014],
      ]) {
        drawBlob(fc, wx, wy, wr, wr * 0.85, 0.15);
      }
    },
    maxAnisotropy,
    true,
    0.0028
  );
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0, 0, 0.16);
  const wL = wingObj.mesh;
  wL.rotation.x = Math.PI * 0.42; // cambered wing extending outward +Z and slightly arched up/down
  pecLeft.add(wL);

  const pecRight = new THREE.Group();
  pecRight.position.set(0, 0, -0.16);
  const wR = wingObj.mesh.clone();
  wR.rotation.x = -Math.PI * 0.42;
  pecRight.add(wR);
  bodyGroup.add(pecLeft, pecRight);

  // Underslung Smiling Mouth Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(0.22, -0.02, 0);
  bodyGroup.add(upperJawGroup);
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(0.2, -0.032, 0);
  bodyGroup.add(lowerJawGroup);
  const lJawGeo = track(new THREE.SphereGeometry(0.032, 12, 10));
  lJawGeo.scale(0.85, 0.42, 1.45);
  const lJawMat = track(new THREE.MeshPhysicalMaterial({ color: BEL, emissive: BEL, emissiveIntensity: 0.25, roughness: 0.35 }));
  const lJawMesh = new THREE.Mesh(lJawGeo, lJawMat);
  lJawMesh.position.set(0.02, 0, 0);
  lowerJawGroup.add(lJawMesh);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, 0.205, -0.028, "#521428", "#ff8aa8", [0.028, 0.02, 0.032]);

  // Long Whip Tail!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xBack + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const whipShape = new THREE.Shape();
  whipShape.moveTo(0, 0.018);
  whipShape.quadraticCurveTo(-0.16, 0.012, -0.34, 0.004);
  whipShape.lineTo(-0.34, -0.004);
  whipShape.quadraticCurveTo(-0.16, -0.012, 0, -0.018);
  whipShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, whipShape, xBack + 0.012, 0, 0.005, 0.001, (fc) => {
      fc.fillStyle = D;
      fc.fillRect(-0.38, -0.04, 0.42, 0.08);
    }, maxAnisotropy, false, 0.0022).mesh
  );

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  // Raised Warm-Brown Eyes on Top of Cranium!
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.145,
    ey: 0.072,
    ez: 0.076,
    er: 0.032,
    yawRot: 0.12,
    irisColor: pal.iris || "#7a3b12",
    rimColor: D,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xNose + 0.02, -0.02, SPOT, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xBack + 0.012,
    skipDefaultFins: true,
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
      // Gentle diamond wing undulation
      const flap = Math.sin(p.tailPh) * (0.22 + p.swimSpeed * 0.16);
      pecLeft.rotation.x = flap;
      pecRight.rotation.x = -flap;
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      // Subtle graceful pitch bank in view so diamond wings show off
      bodyGroup.rotation.x = 0.26 + Math.sin(p.tailPh * 0.5) * 0.06;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 5. TUNA (Bima — Metallic Cobalt & Silver Torpedo, Gold Stripe, 8 Yellow Finlets!)
// =====================================================================================
function createTuna3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#081940";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin; // bright tuna yellow
  const TAIL = pal.tail || "#183e88";
  const STR = pal.stripe || "#4cb4ff";
  const SPOT = pal.spot || "#ffe96b";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.35;
  const xHead = 0.2;
  const xSnout = 0.37;

  const topProf: Pt[] = [
    [xTail, 0.028],
    [-0.23, 0.095],
    [-0.06, 0.172],
    [0.1, 0.175],
    [xHead, 0.132],
    [0.3, 0.072],
    [xSnout, 0.012],
  ];
  const botProf: Pt[] = [
    [xTail, -0.026],
    [-0.23, -0.09],
    [-0.06, -0.165],
    [0.1, -0.168],
    [xHead, -0.125],
    [0.3, -0.068],
    [xSnout, -0.012],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.115 * Math.sin(Math.pow(clamp(t, 0, 1), 0.74) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.34, 1) : base;
  };

  // Paint Metallic Cobalt Blue, Cyan-Gold Lateral Band & Bright Silver Belly
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.34, B],
    [0.52, STR],
    [0.64, mixHex(B, BEL, 0.78)],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Golden tuna lateral stripe
  bc.fillStyle = rgbaHex(SPOT, 0.85);
  bc.beginPath();
  bc.moveTo(40, 240);
  bc.quadraticCurveTo(260, 226, 445, 250);
  bc.quadraticCurveTo(260, 246, 40, 260);
  bc.closePath();
  bc.fill();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.19) / 0.38, 0.01, 0.99),
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
  const bodyMat = ctx.makeFishMat(bodyTex, { clearcoat: 0.55 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0052)), makeOutlineMat(0, 0))
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
      xEnd: xSnout - 0.006,
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

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.003);

  // Sickle Golden 2nd Dorsal & Anal Fins + Dark 1st Dorsal
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(-0.02, 0.16);
  d1Shape.lineTo(0.025, 0.28);
  d1Shape.lineTo(0.075, 0.255);
  d1Shape.lineTo(0.095, 0.165);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = D;
      fc.fillRect(-0.06, 0.12, 0.2, 0.2);
    }, maxAnisotropy, true, 0.0022).mesh
  );

  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.16, 0.11);
  d2Shape.bezierCurveTo(-0.18, 0.23, -0.14, 0.3, -0.1, 0.315);
  d2Shape.quadraticCurveTo(-0.09, 0.22, -0.065, 0.155);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.22, 0.08, 0.2, 0.26);
    }, maxAnisotropy, true, 0.0022).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.16, -0.105);
  aShape.bezierCurveTo(-0.18, -0.22, -0.14, -0.285, -0.1, -0.3);
  aShape.quadraticCurveTo(-0.09, -0.21, -0.065, -0.148);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.22, -0.32, 0.2, 0.24);
    }, maxAnisotropy, true, 0.0022).mesh
  );

  // 4 Upper + 4 Lower Bright Yellow Tuna Peduncle Finlets!
  const finletGeo = track(new THREE.ConeGeometry(0.011, 0.032, 5));
  const finletMat = track(
    new THREE.MeshPhysicalMaterial({ color: FIN, emissive: FIN, emissiveIntensity: 0.26, roughness: 0.3 })
  );
  for (let i = 0; i < 4; i++) {
    const fx = -0.31 + i * 0.036;
    const fu = new THREE.Mesh(finletGeo, finletMat);
    fu.position.set(fx, interpCurveY(topProf, fx) + 0.012, 0);
    fu.rotation.z = 0.42;
    const fl = new THREE.Mesh(finletGeo, finletMat);
    fl.position.set(fx, interpCurveY(botProf, fx) - 0.012, 0);
    fl.rotation.z = Math.PI - 0.42;
    bodyGroup.add(fu, fl);
  }

  // Crescent Tuna Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.025);
  tShape.bezierCurveTo(-0.08, 0.135, -0.145, 0.2, -0.175, 0.215);
  tShape.bezierCurveTo(-0.12, 0.11, -0.08, 0.035, -0.072, 0);
  tShape.bezierCurveTo(-0.08, -0.035, -0.12, -0.11, -0.175, -0.215);
  tShape.bezierCurveTo(-0.145, -0.2, -0.08, -0.135, 0, -0.025);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.012, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.18, 0, [
        [0, TAIL],
        [0.85, B],
        [1, FIN],
      ]);
      fc.fillRect(-0.22, -0.25, 0.26, 0.5);
    }, maxAnisotropy, false, 0.0024).mesh
  );

  // Swept Tuna Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.018);
  pShape.quadraticCurveTo(-0.09, 0.042, -0.14, -0.035);
  pShape.quadraticCurveTo(-0.06, -0.052, 0, -0.016);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0035, 0.001, (fc) => {
    fc.fillStyle = D;
    fc.fillRect(-0.18, -0.08, 0.22, 0.16);
  }, maxAnisotropy, false, 0.002);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.085, -0.048, 0.105);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.085, -0.048, -0.105);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.225,
    ey: 0.042,
    ez: 0.082,
    er: 0.042,
    irisColor: pal.iris || "#f59e0b",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, 0, FIN, 0.052);

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
// 6. HAMMERHEAD (Martil — Shark Body + Iconic Wide 3D Cephalofoil Mallet + Outer Tip Eyes!)
// =====================================================================================
function createHammerhead3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1b2432";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#475569";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.37;
  const xHead = 0.21;
  const xSnout = 0.36;

  const topProf: Pt[] = [
    [xTail, 0.03],
    [-0.24, 0.082],
    [-0.06, 0.142],
    [0.12, 0.138],
    [xHead, 0.105],
    [0.3, 0.055],
    [xSnout, 0.015],
  ];
  const botProf: Pt[] = [
    [xTail, -0.028],
    [-0.24, -0.075],
    [-0.06, -0.132],
    [0.12, -0.126],
    [xHead, -0.095],
    [0.3, -0.05],
    [xSnout, -0.012],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.095 * Math.sin(Math.pow(clamp(t, 0, 1), 0.76) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.18, 0.35, 1) : base;
  };

  // Paint slate shark body + 5 gill slits
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.44, B],
    [0.54, mixHex(B, BEL, 0.55)],
    [0.64, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);
  bc.strokeStyle = rgbaHex(OL, 0.72);
  bc.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const gx = 320 + i * 14;
    bc.beginPath();
    bc.arc(gx, 275, 36, -0.55, 0.6);
    bc.stroke();
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.155) / 0.31, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 36,
      vSteps: 24,
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
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0052)), makeOutlineMat(0, 0))
  );

  // Iconic T-Shaped Cephalofoil Hammer Head attached to Upper Jaw Group!
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.02,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.012,
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

  // Broad Flat Mallet Crossbar extending wide in +-Z!
  const malletGeo = track(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 18));
  malletGeo.rotateX(Math.PI * 0.5);
  malletGeo.scale(1.42, 0.65, 1.0);
  const malletMat = track(
    new THREE.MeshPhysicalMaterial({
      color: B,
      emissive: D,
      emissiveIntensity: 0.25,
      roughness: 0.34,
      clearcoat: 0.32,
    })
  );
  const malletMesh = new THREE.Mesh(malletGeo, malletMat);
  malletMesh.position.set(0.105, 0.015, 0);
  malletMesh.add(new THREE.Mesh(track(buildOutlineGeometry(malletGeo, 0.004)), makeOutlineMat(xHead, 0.006)));
  upperJawGroup.add(malletMesh);

  // Eyes mounted directly on the OUTER +-Z tips of the Cephalofoil Mallet!
  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, upperJawGroup, {
    ex: 0.115,
    ey: 0.018,
    ez: 0.172,
    er: 0.034,
    yawRot: 0.45,
    irisColor: pal.iris || "#b45309",
    rimColor: OL,
  });

  // Lower Shark Jaw + Teeth
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.02, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.055,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.005,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.88,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.02,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004)), makeOutlineMat(xHead, -0.02))
  );

  const toothMat = track(new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  addToothConeRow(upperJawGroup, track, 5, 0.025, 0.11, () => -0.016, (t) => 0.036 * (1 - t * 0.45), 0.0045, 0.016, false, toothMat);
  addToothConeRow(lowerJawGroup, track, 5, 0.025, 0.095, () => 0.01, (t) => 0.03 * (1 - t * 0.45), 0.0042, 0.015, true, toothMat);

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.005, -0.01);

  // Heterocercal Shark Tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.028);
  tShape.bezierCurveTo(-0.08, 0.135, -0.175, 0.215, -0.225, 0.23);
  tShape.bezierCurveTo(-0.155, 0.115, -0.105, 0.04, -0.095, 0);
  tShape.bezierCurveTo(-0.11, -0.045, -0.15, -0.115, -0.18, -0.16);
  tShape.quadraticCurveTo(-0.08, -0.1, 0, -0.026);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.012, 0, 0.0042, 0.001, (fc) => {
      fc.fillStyle = TAIL;
      fc.fillRect(-0.26, -0.2, 0.3, 0.48);
    }, maxAnisotropy, false, 0.0024).mesh
  );

  // Tall Swept Dorsal + Tiny 2nd Dorsal + Pectorals
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(-0.055, 0.125);
  d1Shape.bezierCurveTo(-0.025, 0.31, 0.03, 0.325, 0.068, 0.318);
  d1Shape.bezierCurveTo(0.06, 0.225, 0.095, 0.14, 0.11, 0.125);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.0042, 0.001, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.1, 0.08, 0.24, 0.28);
    }, maxAnisotropy, true, 0.0024).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.bezierCurveTo(-0.06, 0.035, -0.15, -0.05, -0.165, -0.105);
  pShape.quadraticCurveTo(-0.07, -0.075, 0, -0.02);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0038, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.2, -0.14, 0.24, 0.2);
  }, maxAnisotropy, false, 0.0022);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.06, 0.105);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.06, -0.105);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, -0.008, "#d8f8ff", 0.054);

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
// 7. LUMBA (Dolfin & Rosie — Melon Forehead, Smiling Bottlenose Beak & Horizontal Fluke!)
// =====================================================================================
function createLumba3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#0b2447";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#1d589c";
  const STR = pal.stripe || "#8ed0ff";

  const ctx = createRigContext(OL, "#484848");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.355;
  const xHead = 0.21;
  const xSnout = 0.41;

  const topProf: Pt[] = [
    [xTail, 0.025],
    [-0.22, 0.088],
    [-0.04, 0.16],
    [0.12, 0.165],
    [xHead, 0.14],
    [0.29, 0.095], // rounded dolphin melon forehead!
    [0.335, 0.032], // gentle crease to bottlenose beak
    [xSnout, 0.01],
  ];
  const botProf: Pt[] = [
    [xTail, -0.024],
    [-0.22, -0.078],
    [-0.04, -0.14],
    [0.12, -0.145],
    [xHead, -0.118],
    [0.31, -0.052],
    [xSnout - 0.015, -0.012],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.02 + 0.105 * Math.sin(Math.pow(clamp(t, 0, 1), 0.75) * Math.PI);
    return x > 0.28 ? base * clamp(1 - (x - 0.28) / 0.16, 0.25, 1) : base;
  };

  // Paint smooth dolphin counter-shaded body + sweeping flank stripe
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.42, B],
    [0.58, mixHex(B, BEL, 0.7)],
    [0.72, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Flowing lateral accent ribbon
  bc.fillStyle = rgbaHex(STR, 0.52);
  bc.beginPath();
  bc.moveTo(60, 260);
  bc.bezierCurveTo(195, 195, 325, 225, 435, 275);
  bc.quadraticCurveTo(315, 260, 185, 250);
  bc.closePath();
  bc.fill();

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.18) / 0.36, 0.01, 0.99),
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
  const bodyMat = ctx.makeFishMat(bodyTex, { clearcoat: 0.65, roughness: 0.26 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.005)), makeOutlineMat(0, 0))
  );

  // Bottlenose Head + Upper Beak
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.004, 0);
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
      localOffsetY: 0.004,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0042)), makeOutlineMat(xHead, 0.004))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.012, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.014,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.012,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.004)), makeOutlineMat(xHead, -0.012))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.016, -0.004, "#5c1428", "#ff8aa8");

  // Falcate Dolphin Dorsal Fin
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.085, 0.145);
  dShape.bezierCurveTo(-0.06, 0.285, -0.01, 0.305, 0.02, 0.295);
  dShape.bezierCurveTo(-0.005, 0.225, 0.025, 0.16, 0.065, 0.15);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.0045, 0.0012, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.14, 0, 0.3, [
        [0, B],
        [1, D],
      ]);
      fc.fillRect(-0.12, 0.12, 0.24, 0.22);
    }, maxAnisotropy, true, 0.0024).mesh
  );

  // Horizontal Cetacean Tail Fluke!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.015, 0, 0);
  bodyGroup.add(tailPivot);
  const fShape = new THREE.Shape();
  fShape.moveTo(0, 0.025);
  fShape.bezierCurveTo(-0.065, 0.095, -0.12, 0.15, -0.15, 0.155);
  fShape.bezierCurveTo(-0.105, 0.075, -0.07, 0.025, -0.055, 0);
  fShape.bezierCurveTo(-0.07, -0.025, -0.105, -0.075, -0.15, -0.155);
  fShape.bezierCurveTo(-0.12, -0.15, -0.065, -0.095, 0, -0.025);
  fShape.closePath();
  const flukeObj = makeSpineFinMesh(ctx, fShape, xTail + 0.015, 0, 0.0045, 0.0012, (fc) => {
    fc.fillStyle = TAIL;
    fc.fillRect(-0.2, -0.18, 0.24, 0.36);
  }, maxAnisotropy, false, 0.0024);
  flukeObj.mesh.rotation.x = Math.PI * 0.5;
  tailPivot.add(flukeObj.mesh);

  // Paddle Flippers
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.bezierCurveTo(-0.055, 0.03, -0.125, -0.04, -0.14, -0.092);
  pShape.quadraticCurveTo(-0.055, -0.065, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0038, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.18, -0.12, 0.22, 0.18);
  }, maxAnisotropy, false, 0.0022);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.08, -0.065, 0.095);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.08, -0.065, -0.095);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.245,
    ey: 0.038,
    ez: 0.072,
    er: 0.036,
    irisColor: pal.iris || "#1e3a8a",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, 0, STR, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.015,
    isFluke: true,
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
      upperJawGroup.rotation.z = open * 0.2;
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      // Vertical cetacean fluke beat!
      tailPivot.rotation.y = 0;
      tailPivot.rotation.z = Math.sin(p.tailPh - 2.3) * (0.34 + p.swimSpeed * 0.22);
      tailPivot.position.y = Math.sin(p.tailPh - 1.6) * 0.02;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// DISPATCHER
// =====================================================================================
export function createPelagicFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "barracuda":
      return createBarracuda3DRig(sp, maxAnisotropy);
    case "shark":
    case "shark_sleek":
    case "leopard":
      return createSharkFamily3DRig(sp, maxAnisotropy);
    case "sailfish":
      return createSailfish3DRig(sp, maxAnisotropy);
    case "stingray":
      return createStingray3DRig(sp, maxAnisotropy);
    case "tuna":
      return createTuna3DRig(sp, maxAnisotropy);
    case "hammerhead":
      return createHammerhead3DRig(sp, maxAnisotropy);
    case "lumba":
      return createLumba3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}
