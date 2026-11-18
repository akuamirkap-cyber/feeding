import * as THREE from "three";
import type { Species } from "./species";
import {
  baseGroups,
  buildLoftedSurface,
  buildOutlineGeometry,
  clamp,
  createBiteRing,
  createEyePair,
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
// 1. MANDARIN (Naga Karang Langka — Sapphire Dragonet, Cyan-Outlined Tangerine Swirls)
// =====================================================================================
function createMandarin3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#041033";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#ff4757";
  const STR = pal.stripe || "#ff7b1c";
  const SPOT = pal.spot || "#2cf5e8"; // electric cyan highlight outline

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.32;
  const xHead = 0.21;
  const xSnout = 0.35;

  const topProf: Pt[] = [
    [xTail, 0.044],
    [-0.2, 0.13],
    [-0.04, 0.185],
    [0.12, 0.195],
    [xHead, 0.165],
    [0.29, 0.1],
    [xSnout, 0.014],
  ];
  const botProf: Pt[] = [
    [xTail, -0.042],
    [-0.2, -0.122],
    [-0.04, -0.175],
    [0.12, -0.18],
    [xHead, -0.155],
    [0.29, -0.09],
    [xSnout, -0.014],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.028 + 0.115 * Math.sin(Math.pow(clamp(t, 0, 1), 0.74) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.16, 0.38, 1) : base;
  };

  // Paint Psychedelic Sapphire + Electric-Cyan-Outlined Tangerine Swirls
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.4, B],
    [0.78, BEL],
    [1, D],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Flowing S-swirls (cyan halo border + tangerine fill)
  const drawSwirl = (pts: number[][], width: number) => {
    for (const [col, w] of [[SPOT, width + 12], [STR, width]] as const) {
      bc.strokeStyle = col;
      bc.lineWidth = w;
      bc.lineCap = "round";
      bc.beginPath();
      bc.moveTo(pts[0][0], pts[0][1]);
      bc.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      bc.stroke();
    }
  };
  drawSwirl([[85, 195], [145, 95], [205, 315], [275, 210]], 26);
  drawSwirl([[260, 145], [320, 85], [365, 290], [425, 225]], 24);
  drawSwirl([[115, 345], [185, 275], [255, 400], [345, 340]], 22);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.21) / 0.42, 0.01, 0.99),
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
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.34 });
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
      evalBotY: () => -0.005,
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

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.002);

  // Tall Sickle 1st Dorsal Sail + Rounded 2nd Dorsal + Anal Fin
  const d1Shape = new THREE.Shape();
  d1Shape.moveTo(0.01, 0.16);
  d1Shape.bezierCurveTo(0.04, 0.34, -0.04, 0.4, -0.14, 0.38);
  d1Shape.bezierCurveTo(-0.08, 0.29, -0.05, 0.21, -0.06, 0.165);
  d1Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d1Shape, 0, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.15, -0.12, 0.39, [
        [0, B],
        [0.45, FIN],
        [1, SPOT],
      ]);
      fc.fillRect(-0.18, 0.12, 0.26, 0.3);
    }, maxAnisotropy, true, 0.0024).mesh
  );

  const d2Shape = new THREE.Shape();
  d2Shape.moveTo(-0.24, 0.11);
  d2Shape.quadraticCurveTo(-0.23, 0.26, -0.13, 0.25);
  d2Shape.quadraticCurveTo(-0.08, 0.19, -0.09, 0.15);
  d2Shape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, d2Shape, 0, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, -0.24, 0.11, -0.1, 0.26, [
        [0, B],
        [0.6, FIN],
        [1, SPOT],
      ]);
      fc.fillRect(-0.28, 0.08, 0.24, 0.22);
    }, maxAnisotropy, true, 0.0024).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.23, -0.11);
  aShape.quadraticCurveTo(-0.2, -0.24, -0.08, -0.22);
  aShape.lineTo(-0.04, -0.16);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.0038, 0.001, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.26, -0.27, 0.26, 0.18);
    }, maxAnisotropy, true, 0.0022).mesh
  );

  // Ornate Peacock Tail Fan
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.012, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.044);
  tShape.bezierCurveTo(-0.09, 0.16, -0.175, 0.145, -0.18, 0.04);
  tShape.quadraticCurveTo(-0.19, 0, -0.18, -0.04);
  tShape.bezierCurveTo(-0.175, -0.145, -0.09, -0.16, 0, -0.044);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.012, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.18, 0, [
        [0, B],
        [0.5, TAIL],
        [1, SPOT],
      ]);
      fc.fillRect(-0.22, -0.2, 0.26, 0.4);
      fc.fillStyle = rgbaHex(STR, 0.8);
      drawBlob(fc, -0.09, 0.04, 0.025, 0.014, -0.2);
      drawBlob(fc, -0.09, -0.04, 0.025, 0.014, 0.2);
    }, maxAnisotropy, false, 0.0024).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.024);
  pShape.quadraticCurveTo(-0.085, 0.058, -0.125, -0.02);
  pShape.quadraticCurveTo(-0.06, -0.06, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0035, 0.001, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.13, 0, [
      [0, SPOT],
      [1, FIN],
    ]);
    fc.fillRect(-0.16, -0.09, 0.2, 0.18);
  }, maxAnisotropy, false, 0.002);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.085, -0.05, 0.118);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.085, -0.05, -0.118);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.215,
    ey: 0.065,
    ez: 0.086,
    er: 0.048,
    irisColor: pal.iris || "#18c98f",
    rimColor: "#ffd23f",
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, SPOT, 0.052);

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
// 2. AURORA (Cupang Surgawi Langka — Rose-Opal Betta + Colossal 180° Halfmoon Veils!)
// =====================================================================================
function createAurora3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#2a0b4a";
  const B = pal.body; // rose-pink
  const D = pal.dark; // deep orchid
  const BEL = pal.belly; // pearl blush
  const FIN = pal.fin; // lavender violet
  const TAIL = pal.tail || "#4df5e8"; // iridescent cyan veil tip
  const STR = pal.stripe || "#ffb3e6";

  const ctx = createRigContext(OL, "#464646");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.18;
  const xHead = 0.22;
  const xSnout = 0.345;

  const topProf: Pt[] = [
    [xTail, 0.046],
    [-0.08, 0.092],
    [0.06, 0.128],
    [0.18, 0.118],
    [xHead, 0.105],
    [0.29, 0.058],
    [xSnout, 0.01],
  ];
  const botProf: Pt[] = [
    [xTail, -0.044],
    [-0.08, -0.086],
    [0.06, -0.122],
    [0.18, -0.112],
    [xHead, -0.098],
    [0.29, -0.052],
    [xSnout, -0.012],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.078 * Math.sin(Math.pow(clamp(t, 0, 1), 0.76) * Math.PI);
    return x > 0.22 ? base * clamp(1 - (x - 0.22) / 0.16, 0.36, 1) : base;
  };

  // Paint Iridescent Rose-Opal Scale Shimmer Body
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 512, 512, [
    [0, D],
    [0.35, B],
    [0.72, STR],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);
  drawGlow(bc, 280, 210, 180, 75, -0.1, "125,249,255", 0.32);

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.14) / 0.28, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xHead,
      uSteps: 32,
      vSteps: 22,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.34, clearcoat: 0.6 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0048)), makeOutlineMat(0, 0))
  );

  // Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.005, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
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
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0038)), makeOutlineMat(xHead, 0.005))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.006, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.005,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.003,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
      mapUV,
      localOffsetX: xHead,
      localOffsetY: -0.006,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0038)), makeOutlineMat(xHead, -0.006))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.008, -0.002);

  // Colossal 180° Halfmoon Iridescent Flowing Tail Veil!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.01, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.044);
  tShape.bezierCurveTo(-0.08, 0.25, -0.26, 0.34, -0.37, 0.21);
  tShape.bezierCurveTo(-0.42, 0.1, -0.43, -0.1, -0.37, -0.21);
  tShape.bezierCurveTo(-0.26, -0.34, -0.08, -0.25, 0, -0.044);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(
      ctx,
      tShape,
      xTail + 0.01,
      0,
      0.003,
      0.0008,
      (fc) => {
        fc.fillStyle = makeLin(fc, 0, 0, -0.42, 0, [
          [0, D],
          [0.35, B],
          [0.68, FIN],
          [1, TAIL],
        ]);
        fc.fillRect(-0.46, -0.38, 0.5, 0.76);
        fc.strokeStyle = rgbaHex("#ffffff", 0.55);
        fc.lineWidth = 0.004;
        for (let i = -6; i <= 6; i++) {
          fc.beginPath();
          fc.moveTo(-0.01, i * 0.005);
          fc.quadraticCurveTo(-0.2, i * 0.032, -0.4, i * 0.045);
          fc.stroke();
        }
      },
      maxAnisotropy,
      false,
      0.002,
      { transparent: true, opacity: 0.9, emissiveIntensity: 0.38 }
    ).mesh
  );

  // Flowing Crown Dorsal & Ventral Silk Veils
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.18, 0.045);
  dShape.bezierCurveTo(-0.26, 0.28, -0.12, 0.37, 0.02, 0.31);
  dShape.bezierCurveTo(0.08, 0.25, 0.09, 0.16, 0.095, 0.12);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.003, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0.06, -0.15, 0.36, [
        [0, B],
        [0.55, FIN],
        [1, TAIL],
      ]);
      fc.fillRect(-0.32, 0.02, 0.46, 0.4);
    }, maxAnisotropy, true, 0.002, { transparent: true, opacity: 0.9, emissiveIntensity: 0.35 }).mesh
  );

  const aShape = new THREE.Shape();
  aShape.moveTo(-0.18, -0.045);
  aShape.bezierCurveTo(-0.27, -0.27, -0.14, -0.36, 0.0, -0.3);
  aShape.bezierCurveTo(0.06, -0.22, 0.075, -0.15, 0.08, -0.115);
  aShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, aShape, 0, 0, 0.003, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0, -0.06, -0.15, -0.36, [
        [0, B],
        [0.55, FIN],
        [1, TAIL],
      ]);
      fc.fillRect(-0.32, -0.4, 0.44, 0.38);
    }, maxAnisotropy, true, 0.002, { transparent: true, opacity: 0.9, emissiveIntensity: 0.35 }).mesh
  );

  // Flowing Ribbon Pectorals
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.bezierCurveTo(-0.08, 0.075, -0.165, 0.025, -0.145, -0.06);
  pShape.quadraticCurveTo(-0.07, -0.09, 0, -0.015);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.003, 0.0008, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.16, 0, [
      [0, B],
      [1, TAIL],
    ]);
    fc.fillRect(-0.2, -0.12, 0.24, 0.24);
  }, maxAnisotropy, false, 0.0018, { transparent: true, opacity: 0.88 });
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.11, -0.035, 0.088);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.11, -0.035, -0.088);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.23,
    ey: 0.042,
    ez: 0.068,
    er: 0.038,
    irisColor: pal.iris || "#2d68e6",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, TAIL, 0.05);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.01,
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
// 3. NARWHAL (Lumina — Moonlit Lavender Whale, Ice-Cyan Spots & Spiraled Ivory Tusk!)
// =====================================================================================
function createNarwhal3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#1a1047";
  const B = pal.body;
  const D = pal.dark;
  const BEL = pal.belly;
  const FIN = pal.fin;
  const TAIL = pal.tail || "#5746cc";
  const HORN = pal.stripe || "#ffe58f";
  const SPOT = pal.spot || "#b5f4ff";

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.35;
  const xHead = 0.16;
  const xSnout = 0.27;

  const topProf: Pt[] = [
    [xTail, 0.025],
    [-0.22, 0.088],
    [-0.06, 0.155],
    [0.09, 0.172],
    [xHead, 0.165],
    [0.24, 0.115],
    [xSnout, 0.022],
  ];
  const botProf: Pt[] = [
    [xTail, -0.024],
    [-0.22, -0.078],
    [-0.06, -0.14],
    [0.09, -0.15],
    [xHead, -0.135],
    [0.24, -0.088],
    [xSnout, -0.022],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.022 + 0.125 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.18 ? base * clamp(1 - (x - 0.18) / 0.14, 0.35, 1) : base;
  };

  // Paint Moonlit Lavender + Pearl Belly + Dappled Ice-Cyan Spots
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.42, B],
    [0.64, mixHex(B, BEL, 0.65)],
    [0.75, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  bc.fillStyle = rgbaHex(SPOT, 0.85);
  for (let i = 0; i < 16; i++) {
    drawBlob(bc, 75 + (i * 49) % 345, 72 + ((i * 37) % 155), 11 + (i % 3) * 4, 8 + (i % 2) * 3, 0.2);
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.185) / 0.37, 0.01, 0.99),
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
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.3 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.005)), makeOutlineMat(0, 0))
  );

  // Rounded Forehead Upper Jaw + Iconic Long Spiraled Ivory Tusk!
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.004, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 14,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.014,
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

  // Spiraled Golden-Ivory Narwhal Horn!
  const hornCv = document.createElement("canvas");
  hornCv.width = 256;
  hornCv.height = 256;
  const hc = hornCv.getContext("2d")!;
  hc.fillStyle = makeLin(hc, 0, 0, 0, 256, [
    [0, "#fffdf5"],
    [0.5, HORN],
    [1, "#e5b84b"],
  ]);
  hc.fillRect(0, 0, 256, 256);
  hc.strokeStyle = "#b58322";
  hc.lineWidth = 10;
  for (let i = -2; i < 8; i++) {
    hc.beginPath();
    hc.moveTo(0, i * 42);
    hc.lineTo(256, i * 42 + 64);
    hc.stroke();
  }
  const hornTex = track(new THREE.CanvasTexture(hornCv));
  hornTex.colorSpace = THREE.SRGBColorSpace;
  const hornLen = 0.34;
  const hornGeo = track(new THREE.ConeGeometry(0.022, hornLen, 14));
  hornGeo.rotateZ(-Math.PI * 0.5);
  const hornMat = ctx.makeFishMat(hornTex, { clearcoat: 0.72, emissiveIntensity: 0.3 });
  const hornMesh = new THREE.Mesh(hornGeo, hornMat);
  hornMesh.position.set(xSnout - xHead + hornLen * 0.42, 0.028, 0);
  hornMesh.rotation.z = 0.06;
  hornMesh.add(new THREE.Mesh(track(buildOutlineGeometry(hornGeo, 0.0028)), makeOutlineMat(0, 0, false)));
  upperJawGroup.add(hornMesh);

  // Lower Jaw
  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.02, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.01,
      uSteps: 14,
      vSteps: 18,
      evalTopY: () => 0.004,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)) * 0.9,
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

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.01, -0.008);

  // Horizontal Cetacean Tail Fluke!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.015, 0, 0);
  bodyGroup.add(tailPivot);
  const fShape = new THREE.Shape();
  fShape.moveTo(0, 0.025);
  fShape.bezierCurveTo(-0.07, 0.095, -0.125, 0.155, -0.155, 0.16);
  fShape.bezierCurveTo(-0.105, 0.075, -0.07, 0.025, -0.055, 0);
  fShape.bezierCurveTo(-0.07, -0.025, -0.105, -0.075, -0.155, -0.16);
  fShape.bezierCurveTo(-0.125, -0.155, -0.07, -0.095, 0, -0.025);
  fShape.closePath();
  const flukeObj = makeSpineFinMesh(ctx, fShape, xTail + 0.015, 0, 0.0045, 0.0012, (fc) => {
    fc.fillStyle = TAIL;
    fc.fillRect(-0.2, -0.18, 0.24, 0.36);
  }, maxAnisotropy, false, 0.0024);
  flukeObj.mesh.rotation.x = Math.PI * 0.5;
  tailPivot.add(flukeObj.mesh);

  // Cute Flippers
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.02);
  pShape.bezierCurveTo(-0.05, 0.032, -0.11, -0.035, -0.125, -0.085);
  pShape.quadraticCurveTo(-0.05, -0.06, 0, -0.018);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.004, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.16, -0.11, 0.2, 0.16);
  }, maxAnisotropy, false, 0.0022);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.05, -0.075, 0.105);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.05, -0.075, -0.105);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.19,
    ey: 0.036,
    ez: 0.088,
    er: 0.038,
    irisColor: pal.iris || "#1f3a8a",
    rimColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + hornLen * 0.85, 0.015, SPOT, 0.054);

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
      upperJawGroup.rotation.z = open * 0.18;
      lowerJawGroup.rotation.z = -open * 0.6;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      tailPivot.rotation.y = 0;
      tailPivot.rotation.z = Math.sin(p.tailPh - 2.3) * (0.34 + p.swimSpeed * 0.22);
      tailPivot.position.y = Math.sin(p.tailPh - 1.6) * 0.018;
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 4. SEADRAGON (Naga Daun — S-Curved Armored Emerald & Gold Seadragon + 3D Leafy Kelp!)
// =====================================================================================
function createSeadragon3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#07261c";
  const EMR = pal.body; // #22b87a
  const DK = pal.dark; // #0c4a38
  const GOLD = pal.belly; // #ffe47a
  const AMBER = pal.fin; // #e6a825
  const LEAF = pal.spot || "#9effc6";

  const ctx = createRigContext(OL, "#4e4e4e");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.37;
  const xNeck = 0.29;
  const xSnoutTip = 0.455;

  // Notice: in 2D customFish.ts, y is +down; in 3D, y is +up! (Arch back rises +y at x ≈ 0.04)
  const topProf: Pt[] = [
    [xTail, -0.04],
    [-0.24, 0.015],
    [-0.1, 0.112],
    [0.04, 0.138],
    [0.16, 0.088],
    [0.245, 0.094], // crowned head
    [xNeck, 0.052],
    [0.36, 0.032],
    [xSnoutTip, 0.028],
  ];
  const botProf: Pt[] = [
    [xTail, -0.056],
    [-0.24, -0.036],
    [-0.1, -0.068],
    [0.04, -0.088],
    [0.16, -0.064],
    [0.245, -0.025],
    [xNeck, -0.004],
    [0.36, 0.004],
    [xSnoutTip, 0.002],
  ];
  const evalZ = (x: number, t: number) => {
    if (x > 0.28) return 0.018;
    return 0.016 + 0.062 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
  };

  // Paint Golden-Armored Bony Rings & Emerald Jewels
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, DK],
    [0.36, EMR],
    [0.72, AMBER],
    [1, GOLD],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Sculpted bony golden armor rings
  bc.strokeStyle = rgbaHex(GOLD, 0.82);
  bc.lineWidth = 7;
  for (let i = 0; i < 12; i++) {
    const rx = 32 + i * 38;
    bc.beginPath();
    bc.moveTo(rx, 0);
    bc.quadraticCurveTo(rx - 18, 256, rx, 512);
    bc.stroke();
  }
  // Luminous mint-emerald jewel spots along flank armor
  bc.fillStyle = rgbaHex(LEAF, 0.94);
  for (let i = 0; i < 7; i++) {
    drawBlob(bc, 95 + i * 48, 210 + Math.sin(i * 0.7) * 28, 8, 6);
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnoutTip - xTail), 0.01, 0.99),
    clamp((y + 0.11) / 0.27, 0.01, 0.99),
  ];

  const bodyGeo = track(
    buildLoftedSurface({
      xStart: xTail,
      xEnd: xNeck,
      uSteps: 40,
      vSteps: 22,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: evalZ,
      mapUV,
      rearBulge: 0.004,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.32 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0045)), makeOutlineMat(0, 0))
  );

  // Trumpet Pipe-Snout Upper & Lower Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xNeck, 0.022, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xNeck - 0.006,
      xEnd: xSnoutTip,
      uSteps: 16,
      vSteps: 16,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => 0.008,
      evalHalfZ: () => 0.017,
      mapUV,
      localOffsetX: xNeck,
      localOffsetY: 0.022,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0034)), makeOutlineMat(xNeck, 0.022))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xNeck, 0.006, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xNeck - 0.006,
      xEnd: xSnoutTip - 0.008,
      uSteps: 14,
      vSteps: 16,
      evalTopY: () => 0.01,
      evalBotY: (x) => interpCurveY(botProf, x),
      evalHalfZ: () => 0.015,
      mapUV,
      localOffsetX: xNeck,
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0032)), makeOutlineMat(xNeck, 0.006))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xNeck + 0.08, 0.014, "#5c1328", "#ff8aa8", [0.022, 0.014, 0.014]);

  // Helper to attach branching 3D Seaweed-Leaf Appendages!
  const addKelpPlume = (ax: number, ay: number, angle: number, len: number, width: number, flipZ = 0) => {
    const kShape = new THREE.Shape();
    kShape.moveTo(0, 0);
    kShape.bezierCurveTo(-width * 0.9, len * 0.35, width * 1.15, len * 0.65, 0, len);
    kShape.bezierCurveTo(-width * 0.45, len * 0.72, -width * 1.05, len * 0.35, 0, 0);
    kShape.closePath();
    const kObj = makeSpineFinMesh(ctx, kShape, ax, ay, 0.003, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, 0, len, [
        [0, DK],
        [0.4, EMR],
        [0.8, AMBER],
        [1, LEAF],
      ]);
      fc.fillRect(-width * 1.5, -0.02, width * 3, len + 0.04);
    }, maxAnisotropy, true, 0.0018);
    kObj.mesh.position.set(ax, ay, flipZ);
    kObj.mesh.rotation.z = angle;
    bodyGroup.add(kObj.mesh);
  };

  // Regal Dorsal, Ventral, Crown & Chin Leafy Kelp Plumes!
  addKelpPlume(0.02, 0.12, 0.25, 0.21, 0.052, 0.012);
  addKelpPlume(-0.1, 0.1, 0.52, 0.18, 0.045, -0.012);
  addKelpPlume(0.14, 0.08, -0.15, 0.16, 0.04, 0);
  addKelpPlume(0.22, 0.09, -0.25, 0.14, 0.036, 0.01);
  addKelpPlume(-0.23, 0.02, 0.88, 0.15, 0.038, 0.008);
  addKelpPlume(0.04, -0.075, Math.PI - 0.32, 0.17, 0.046, 0.014);
  addKelpPlume(-0.08, -0.06, Math.PI - 0.55, 0.14, 0.038, -0.014);
  addKelpPlume(0.32, -0.004, Math.PI + 0.18, 0.09, 0.024, 0);

  // Translucent Propulsive Dorsal Propeller Finlet & Tail Curl Leaf
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.01, -0.045, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.016);
  tShape.bezierCurveTo(-0.06, 0.07, -0.125, 0.06, -0.14, 0);
  tShape.bezierCurveTo(-0.12, -0.065, -0.055, -0.06, 0, -0.016);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.01, -0.045, 0.003, 0.0008, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.14, 0, [
        [0, EMR],
        [0.6, GOLD],
        [1, LEAF],
      ]);
      fc.fillRect(-0.18, -0.1, 0.22, 0.2);
    }, maxAnisotropy, false, 0.0018).mesh
  );

  // Gossamer Neck Pectoral Finlets
  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.016);
  pShape.quadraticCurveTo(-0.065, 0.045, -0.085, -0.015);
  pShape.quadraticCurveTo(-0.045, -0.045, 0, -0.014);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0028, 0.0008, (fc) => {
    fc.fillStyle = makeLin(fc, 0, 0, -0.09, 0, [
      [0, EMR],
      [0.5, GOLD],
      [1, "#c3ffe1"],
    ]);
    fc.fillRect(-0.12, -0.08, 0.16, 0.16);
  }, maxAnisotropy, false, 0.0016, { transparent: true, opacity: 0.9 });
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.18, 0.02, 0.065);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.18, 0.02, -0.065);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.264,
    ey: 0.048,
    ez: 0.056,
    er: 0.036,
    irisColor: pal.iris || "#ff6b35",
    rimColor: GOLD,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnoutTip + 0.02, 0.016, LEAF, 0.048);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.01,
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
// 5. AXOLOTL (Mochi — Chibi Sakura-Pink Salamander, 3x2 Feathered Gills, 4 Paddle Feet!)
// =====================================================================================
function createAxolotl3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#4d1234";
  const PINK = pal.body; // #ffb6d9
  const DK = pal.dark; // #db5c98
  const BELLY = pal.belly; // #fff2f9
  const GILL = pal.fin; // #ff3f82
  const CRYS = pal.spot || "#6ef7ff";

  const ctx = createRigContext(OL, "#464646");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.27;
  const xHead = 0.14;
  const xSnout = 0.34;

  const topProf: Pt[] = [
    [xTail, 0.045],
    [-0.14, 0.11],
    [0.02, 0.135],
    [xHead, 0.142],
    [0.25, 0.138],
    [0.31, 0.092],
    [xSnout, 0.016],
  ];
  const botProf: Pt[] = [
    [xTail, -0.042],
    [-0.14, -0.105],
    [0.02, -0.132],
    [xHead, -0.132],
    [0.25, -0.118],
    [0.31, -0.075],
    [xSnout, -0.016],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.032 + 0.108 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.16 ? 0.145 * clamp(1 - (x - 0.24) / 0.14, 0.45, 1) : base; // broad cute rounded salamander head!
  };

  // Paint Sakura-Pink Body + Rosy Cheeks + Crystal Sparkle Dots
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, DK],
    [0.34, PINK],
    [0.72, BELLY],
    [1, BELLY],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Rosy blushing cheeks
  drawGlow(bc, 395, 290, 42, 30, 0, "255,75,140", 0.55);
  // Sparkling cyan crystal dots along flanks
  bc.fillStyle = rgbaHex(CRYS, 0.92);
  for (const [sx, sy] of [[120, 195], [180, 165], [245, 200], [160, 260], [295, 185]]) {
    drawBlob(bc, sx, sy, 9, 9);
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.16) / 0.32, 0.01, 0.99),
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
      rearBulge: 0.005,
      capFront: false,
    })
  );
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.3 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.005)), makeOutlineMat(0, 0))
  );

  // Broad Rounded Head & Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.006, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 16,
      vSteps: 20,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.008,
      evalHalfZ: (x) => evalZ(x, (x - xTail) / (xSnout - xTail)),
      mapUV,
      localOffsetX: xHead,
      localOffsetY: 0.006,
      roundFront: true,
    })
  );
  upperJawGroup.add(
    new THREE.Mesh(uGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(uGeo, 0.0044)), makeOutlineMat(xHead, 0.006))
  );

  const lowerJawGroup = new THREE.Group();
  lowerJawGroup.position.set(xHead, -0.014, 0);
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
      localOffsetY: -0.014,
      roundFront: true,
    })
  );
  lowerJawGroup.add(
    new THREE.Mesh(lGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(lGeo, 0.0044)), makeOutlineMat(xHead, -0.014))
  );

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.015, -0.006);

  // 3 PAIRS of Fluffy Feathered Coral-Magenta External Gills!
  const gillMat = track(
    new THREE.MeshPhysicalMaterial({
      color: GILL,
      emissive: GILL,
      emissiveIntensity: 0.28,
      roughness: 0.32,
    })
  );
  const gillStalkGeo = track(new THREE.CapsuleGeometry(0.011, 0.115, 6, 10));
  const gillFrondGeo = track(new THREE.SphereGeometry(0.014, 8, 8));
  const gillBranches: THREE.Group[] = [];
  for (const s of [1, -1]) {
    for (let gi = 0; gi < 3; gi++) {
      const gg = new THREE.Group();
      gg.position.set(0.145 - gi * 0.014, 0.055 - gi * 0.042, s * 0.125);
      const stalk = new THREE.Mesh(gillStalkGeo, gillMat);
      stalk.rotation.x = s * (Math.PI * 0.44);
      stalk.rotation.z = 0.22 - gi * 0.28;
      stalk.position.set(-0.025, 0.015 - gi * 0.008, s * 0.055);
      gg.add(stalk);
      // Fluffy gill fronds
      for (let fi = 0; fi < 3; fi++) {
        const frond = new THREE.Mesh(gillFrondGeo, gillMat);
        frond.position.set(-0.02 - fi * 0.012, 0.025 - gi * 0.01 + (fi % 2) * 0.012, s * (0.04 + fi * 0.026));
        gg.add(frond);
      }
      bodyGroup.add(gg);
      gillBranches.push(gg);
    }
  }

  // 4 Cute Stubby Salamander Paddle Feet!
  const limbGeo = track(new THREE.CapsuleGeometry(0.022, 0.055, 6, 10));
  const limbMat = track(
    new THREE.MeshPhysicalMaterial({
      color: PINK,
      emissive: PINK,
      emissiveIntensity: 0.24,
      roughness: 0.35,
    })
  );
  const feet: { g: THREE.Group; phase: number }[] = [];
  for (const [fx, fy, fz, ph] of [
    [0.06, -0.1, 0.095, 0],
    [0.06, -0.1, -0.095, Math.PI],
    [-0.14, -0.09, 0.085, Math.PI],
    [-0.14, -0.09, -0.085, 0],
  ] as const) {
    const fg = new THREE.Group();
    fg.position.set(fx, fy, fz);
    const fm = new THREE.Mesh(limbGeo, limbMat);
    fm.position.set(0, -0.025, fz > 0 ? 0.012 : -0.012);
    fm.rotation.x = fz > 0 ? 0.35 : -0.35;
    fm.add(new THREE.Mesh(track(buildOutlineGeometry(limbGeo, 0.003)), makeOutlineMat(0, 0, false)));
    fg.add(fm);
    bodyGroup.add(fg);
    feet.push({ g: fg, phase: ph });
  }

  // Sparkling Translucent Crystal Ribbon Tail!
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.015, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.055);
  tShape.bezierCurveTo(-0.08, 0.145, -0.2, 0.125, -0.25, 0.025);
  tShape.quadraticCurveTo(-0.27, 0, -0.25, -0.025);
  tShape.bezierCurveTo(-0.2, -0.12, -0.08, -0.135, 0, -0.05);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.015, 0, 0.004, 0.001, (fc) => {
      fc.fillStyle = makeLin(fc, 0, 0, -0.26, 0, [
        [0, PINK],
        [0.55, BELLY],
        [1, CRYS],
      ]);
      fc.fillRect(-0.3, -0.18, 0.34, 0.36);
    }, maxAnisotropy, false, 0.0024, { transparent: true, opacity: 0.9, emissiveIntensity: 0.36 }).mesh
  );

  const pecLeft = new THREE.Group();
  const pecRight = new THREE.Group();
  const pelvicFin = new THREE.Group();

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.255,
    ey: 0.036,
    ez: 0.105,
    er: 0.038,
    irisColor: pal.iris || "#28143b",
    rimColor: "#ffffff",
    happyColor: OL,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.02, 0, CRYS, 0.052);

  return {
    speciesKey: sp.id,
    tailPivotX: xTail + 0.015,
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
      upperJawGroup.rotation.z = open * 0.22;
      lowerJawGroup.rotation.z = -open * 0.65;
      mouthInterior.visible = open > 0.03;
      if (open > 0.03) mouthInterior.scale.set(0.85 + open * 0.2, 0.35 + open * 0.9, 0.8 + open * 0.2);
      tongueMesh.visible = open > 0.04;
      for (const f of feet) {
        f.g.rotation.z = Math.sin(p.tailPh + f.phase) * 0.48;
      }
      for (let i = 0; i < gillBranches.length; i++) {
        gillBranches[i].rotation.y = Math.sin(p.wag2 + i * 0.6) * 0.12;
      }
    },
    dispose: () => {
      for (const d of ctx.disposables) d.dispose();
    },
  };
}

// =====================================================================================
// 6. WHALESHARK (Astro — Midnight-Navy Gentle Giant, Glowing Star Constellations!)
// =====================================================================================
function createWhaleshark3DRig(sp: Species, maxAnisotropy: number): Fish3DRig {
  const pal = sp.pal;
  const OL = pal.outline || "#050d24";
  const B = pal.body; // #163a7a
  const D = pal.dark; // #0a1a42
  const BEL = pal.belly; // #e8f6ff
  const FIN = pal.fin;
  const TAIL = pal.tail || "#13346e";
  const STR = pal.stripe || "#5ce6ff"; // constellation connecting lines
  const STAR = pal.spot || "#fff4b8"; // golden stars

  const ctx = createRigContext(OL, "#4a4a4a");
  const { track, uniforms, makeOutlineMat } = ctx;
  const { root, pitchGroup, yawGroup, bodyGroup } = baseGroups();

  const xTail = -0.37;
  const xHead = 0.21;
  const xSnout = 0.39;

  const topProf: Pt[] = [
    [xTail, 0.032],
    [-0.24, 0.095],
    [-0.06, 0.175],
    [0.12, 0.185],
    [xHead, 0.16],
    [0.32, 0.115], // broad flat blunt whaleshark snout!
    [xSnout, 0.032],
  ];
  const botProf: Pt[] = [
    [xTail, -0.03],
    [-0.24, -0.088],
    [-0.06, -0.155],
    [0.12, -0.16],
    [xHead, -0.14],
    [0.32, -0.095],
    [xSnout - 0.01, -0.025],
  ];
  const evalZ = (x: number, t: number) => {
    const base = 0.024 + 0.125 * Math.sin(Math.pow(clamp(t, 0, 1), 0.72) * Math.PI);
    return x > 0.24 ? Math.max(0.068, base * 0.85) : base; // broad squared front!
  };

  // Paint Midnight Navy + Star-Constellation Grid + Pearl Belly + 5 Gill Slits
  const bodyCv = document.createElement("canvas");
  bodyCv.width = 512;
  bodyCv.height = 512;
  const bc = bodyCv.getContext("2d")!;
  bc.fillStyle = makeLin(bc, 0, 0, 0, 512, [
    [0, D],
    [0.45, B],
    [0.64, mixHex(B, BEL, 0.65)],
    [0.75, BEL],
    [1, BEL],
  ]);
  bc.fillRect(0, 0, 512, 512);

  // Star-Constellation lines & glowing golden stars!
  const stars: [number, number][] = [
    [95, 110], [155, 85], [215, 115], [275, 82], [335, 108],
    [125, 175], [190, 165], [250, 185], [310, 162], [365, 145],
  ];
  bc.strokeStyle = rgbaHex(STR, 0.56);
  bc.lineWidth = 4;
  bc.beginPath();
  for (let i = 0; i < 4; i++) {
    bc.moveTo(stars[i][0], stars[i][1]);
    bc.lineTo(stars[i + 1][0], stars[i + 1][1]);
    bc.moveTo(stars[i][0], stars[i][1]);
    bc.lineTo(stars[i + 5][0], stars[i + 5][1]);
  }
  bc.stroke();
  for (const [sx, sy] of stars) {
    drawGlow(bc, sx, sy, 18, 18, 0, "255,244,184", 0.52);
    bc.fillStyle = STAR;
    drawBlob(bc, sx, sy, 7.5, 7.5);
  }

  // 5 Gill Slits
  bc.strokeStyle = rgbaHex(OL, 0.72);
  bc.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const gx = 328 + i * 14;
    bc.beginPath();
    bc.arc(gx, 285, 36, -0.55, 0.55);
    bc.stroke();
  }

  const bodyTex = track(new THREE.CanvasTexture(bodyCv));
  bodyTex.colorSpace = THREE.SRGBColorSpace;
  bodyTex.anisotropy = maxAnisotropy;

  const mapUV = (x: number, y: number): Pt => [
    clamp((x - xTail) / (xSnout - xTail), 0.01, 0.99),
    clamp((y + 0.2) / 0.4, 0.01, 0.99),
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
  const bodyMat = ctx.makeFishMat(bodyTex, { emissiveIntensity: 0.34 });
  injectSpineShader(bodyMat, uniforms, 0, 0);
  bodyGroup.add(
    new THREE.Mesh(bodyGeo, bodyMat),
    new THREE.Mesh(track(buildOutlineGeometry(bodyGeo, 0.0055)), makeOutlineMat(0, 0))
  );

  // Broad Flat-Snouted Jaws
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(xHead, 0.008, 0);
  bodyGroup.add(upperJawGroup);
  const uGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout,
      uSteps: 16,
      vSteps: 18,
      evalTopY: (x) => interpCurveY(topProf, x),
      evalBotY: () => -0.014,
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
  lowerJawGroup.position.set(xHead, -0.016, 0);
  bodyGroup.add(lowerJawGroup);
  const lGeo = track(
    buildLoftedSurface({
      xStart: xHead - 0.01,
      xEnd: xSnout - 0.01,
      uSteps: 16,
      vSteps: 18,
      evalTopY: () => 0.004,
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

  const { mouthInterior, tongueMesh } = createOralParts(ctx, bodyGroup, lowerJawGroup, xHead + 0.018, -0.006, "#401228", "#ff8aa8", [0.045, 0.032, 0.048]);

  // Grand Crescent Tail with Star Spots
  const tailPivot = new THREE.Group();
  tailPivot.position.set(xTail + 0.014, 0, 0);
  bodyGroup.add(tailPivot);
  const tShape = new THREE.Shape();
  tShape.moveTo(0, 0.034);
  tShape.bezierCurveTo(-0.085, 0.145, -0.175, 0.215, -0.22, 0.23);
  tShape.bezierCurveTo(-0.155, 0.115, -0.105, 0.04, -0.095, 0);
  tShape.bezierCurveTo(-0.11, -0.045, -0.15, -0.115, -0.185, -0.165);
  tShape.quadraticCurveTo(-0.085, -0.105, 0, -0.03);
  tShape.closePath();
  tailPivot.add(
    makeSpineFinMesh(ctx, tShape, xTail + 0.014, 0, 0.0045, 0.0012, (fc) => {
      fc.fillStyle = TAIL;
      fc.fillRect(-0.26, -0.22, 0.3, 0.5);
      fc.fillStyle = STAR;
      drawBlob(fc, -0.08, 0.08, 0.012, 0.012);
      drawBlob(fc, -0.14, 0.15, 0.01, 0.01);
    }, maxAnisotropy, false, 0.0026).mesh
  );

  // Rounded Tall Dorsal & Majestic Wide Pectoral Wings
  const dShape = new THREE.Shape();
  dShape.moveTo(-0.06, 0.155);
  dShape.bezierCurveTo(-0.02, 0.32, 0.04, 0.325, 0.08, 0.295);
  dShape.quadraticCurveTo(0.085, 0.2, 0.105, 0.165);
  dShape.closePath();
  bodyGroup.add(
    makeSpineFinMesh(ctx, dShape, 0, 0, 0.0045, 0.0012, (fc) => {
      fc.fillStyle = FIN;
      fc.fillRect(-0.1, 0.12, 0.24, 0.24);
      fc.fillStyle = STAR;
      drawBlob(fc, 0.02, 0.24, 0.012, 0.012);
    }, maxAnisotropy, true, 0.0026).mesh
  );

  const pShape = new THREE.Shape();
  pShape.moveTo(0, 0.026);
  pShape.bezierCurveTo(-0.065, 0.045, -0.17, -0.06, -0.19, -0.125);
  pShape.quadraticCurveTo(-0.08, -0.09, 0, -0.022);
  pShape.closePath();
  const pecObj = makeSpineFinMesh(ctx, pShape, 0, 0, 0.0042, 0.001, (fc) => {
    fc.fillStyle = FIN;
    fc.fillRect(-0.24, -0.16, 0.28, 0.24);
    fc.fillStyle = STAR;
    drawBlob(fc, -0.09, -0.04, 0.012, 0.012);
    drawBlob(fc, -0.13, -0.08, 0.01, 0.01);
  }, maxAnisotropy, false, 0.0024);
  const pecLeft = new THREE.Group();
  pecLeft.position.set(0.085, -0.075, 0.118);
  pecLeft.add(pecObj.mesh);
  const pecRight = new THREE.Group();
  pecRight.position.set(0.085, -0.075, -0.118);
  pecRight.add(pecObj.mesh.clone());
  bodyGroup.add(pecLeft, pecRight);

  const pelvicFin = new THREE.Group();
  bodyGroup.add(pelvicFin);

  const { eyesNormal, eyesPupil, eyesHappy } = createEyePair(ctx, bodyGroup, {
    ex: 0.295,
    ey: 0.026,
    ez: 0.088,
    er: 0.036,
    irisColor: pal.iris || "#38bdf8",
    rimColor: STAR,
  });

  const { biteRing, biteRingMat } = createBiteRing(ctx, bodyGroup, xSnout + 0.025, 0, STR, 0.056);

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
// DISPATCHER
// =====================================================================================
export function createRareFish3DRig(sp: Species, maxAnisotropy = 4): Fish3DRig | null {
  switch (sp.style) {
    case "mandarin":
      return createMandarin3DRig(sp, maxAnisotropy);
    case "aurora":
      return createAurora3DRig(sp, maxAnisotropy);
    case "narwhal":
      return createNarwhal3DRig(sp, maxAnisotropy);
    case "seadragon":
      return createSeadragon3DRig(sp, maxAnisotropy);
    case "axolotl":
      return createAxolotl3DRig(sp, maxAnisotropy);
    case "whaleshark":
      return createWhaleshark3DRig(sp, maxAnisotropy);
    default:
      return null;
  }
}
