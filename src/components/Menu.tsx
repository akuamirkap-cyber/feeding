import { useEffect, useMemo, useRef, useState } from "react";
import { SKINS, skinToSpecies } from "../game/species";
import { spriteAnimPreviewCanvases, coinSprite } from "../game/sprites";
import type { JawState } from "../game/sprites";
import { fish3d } from "../game/fish3d";
import Fish3DViewport from "./Fish3DViewport";
import type { SaveData } from "../save";
import { UPGRADE_COSTS, MAX_UPGRADE } from "../save";
import type { Upgrades } from "../game/engine";
import { TROPHIES, isTrophyMet } from "../trophies";

interface Props {
  save: SaveData;
  setSave: (s: SaveData) => void;
  onPlay: () => void;
  onOpenTrophies: () => void;
  loading?: boolean;
  loadPct?: number;
}

const UPGRADES: { id: keyof Upgrades; name: string; desc: string; icon: string }[] = [
  { id: "suck", name: "Sedotan Super", desc: "Jangkauan & tarikan arus sedot lebih luas", icon: "🌀" },
  { id: "speed", name: "Sirip Turbo", desc: "Berenang & bermanuver jauh lebih lincah", icon: "💨" },
  { id: "size", name: "Ikan Bongsor", desc: "Masuk lautan dengan ukuran awal lebih besar", icon: "🍔" },
];

export function coinURL() {
  return coinSprite(0).toDataURL();
}

const HERO_CANVASES: Record<string, HTMLCanvasElement[]> = {};
const ETALASE_CANVASES_2D: Record<string, HTMLCanvasElement[]> = {};
const ETALASE_CANVASES_3D: Record<string, HTMLCanvasElement[]> = {};

const PREVIEW_CYCLE: JawState[] = [
  0, 0, 0, 0, 0,
  1, 2, 4, 5, 6, 6, 6, 6,
  4, 2, -1, -1, -1, -1,
  2, 4, 2, -1, -1,
  0, 0, 0, 0, 0, 0, 0, 0,
];

// 16-frame swim + occasional bite/smile cycle rendered for every fish displayed in the etalase
const ETALASE_CYCLE: JawState[] = [
  0, 0, 0, 0,
  1, 3, 5, 6,
  4, 2, 0, -1,
  -1, -1, 0, 0,
];

function drawPreviewFrame(
  cv: HTMLCanvasElement | null,
  frame: HTMLCanvasElement | undefined,
  cssW: number,
  cssH: number,
  scaleMult: number,
  bobY: number,
  tilt: number
) {
  if (!cv || !frame) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = 6;
  const fit = Math.min((cssW - pad * 2) / frame.width, (cssH - pad * 2) / frame.height) * scaleMult;
  const dw = frame.width * fit;
  const dh = frame.height * fit;

  ctx.save();
  ctx.translate(cssW * 0.5, cssH * 0.5 + bobY);
  ctx.rotate(tilt);
  ctx.drawImage(frame, -dw * 0.5, -dh * 0.5, dw, dh);
  ctx.restore();
}

// Normalized showcase scale multipliers after transparent-margin auto-crop,
// keeping Nemo compact/cute, lifting small fish readability, and giving large predators presence.
const ETALASE_SCALE: Record<string, number> = {
  orange: 0.72,
  layla: 0.88,
  pierre: 0.86,
  buntal: 0.80,
  dori: 0.86,
  andy: 0.90,
  andy_blue: 0.90,
  boris: 0.90,
  kakatua: 0.92,
  peter: 0.92,
  eddy: 0.94,
  leon: 0.98,
  idol: 0.96,
  layaran: 1.0,
  pari: 1.04,
  hiu: 1.04,
  hiu_elegan: 1.04,
  hiu_totol: 1.04,
  orca: 1.04,
  mandarin: 0.98,
  aurora: 1.02,
  narwhal: 1.04,
  seadragon: 1.04,
  axolotl: 0.98,
  whaleshark: 1.04,
  tuna: 1.0,
  hammerhead: 1.02,
  butterfly: 0.92,
  snapper: 0.96,
  lumba: 1.02,
  lumba_pink: 1.02,
  snapturtle: 1.04,
  snapturtle_albino: 1.04,
};

const HERO_SCALE: Record<string, number> = {
  orange: 0.78,
  buntal: 0.86,
  dori: 0.92,
  pierre: 0.92,
  layla: 0.94,
  andy: 0.95,
  andy_blue: 0.95,
  boris: 0.95,
  kakatua: 0.96,
  peter: 0.96,
  eddy: 0.98,
  leon: 1.02,
  idol: 1.0,
  layaran: 1.04,
  pari: 1.06,
  hiu: 1.06,
  hiu_elegan: 1.06,
  hiu_totol: 1.06,
  orca: 1.06,
  mandarin: 1.02,
  aurora: 1.04,
  narwhal: 1.06,
  seadragon: 1.06,
  axolotl: 1.02,
  whaleshark: 1.06,
  tuna: 1.04,
  hammerhead: 1.04,
  butterfly: 0.96,
  snapper: 1.0,
  lumba: 1.04,
  lumba_pink: 1.04,
  snapturtle: 1.06,
  snapturtle_albino: 1.06,
};

export default function Menu({ save, setSave, onPlay, onOpenTrophies, loading = false, loadPct = 0 }: Props) {
  const [tab, setTab] = useState<"skin" | "shop">("skin");
  const [biteTrig, setBiteTrig] = useState(0);

  const unlockedTrophyCount = useMemo(
    () => TROPHIES.filter((t) => !!save.unlockedTrophies[t.id] || isTrophyMet(t, save)).length,
    [save]
  );

  const cur = SKINS.find((s) => s.id === save.skin) || SKINS[0];
  const heroIs3D = !!(save.mode3D && cur.supports3D);
  const heroSpecies = useMemo(() => skinToSpecies(cur, heroIs3D), [cur, heroIs3D]);

  const curRef = useRef(cur);
  curRef.current = cur;
  const mode3DRef = useRef(save.mode3D);
  mode3DRef.current = save.mode3D;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const etalaseCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    let alive = true;
    let raf = 0;

    const tick = (now: number) => {
      if (!alive) return;

      const useMode3D = mode3DRef.current;

      // Incrementally pre-render direct offscreen canvas frames (no PNG encoding overhead)
      let built = 0;
      for (const s of SKINS) {
        const want3D = !!(useMode3D && s.supports3D);
        const cache = want3D ? ETALASE_CANVASES_3D : ETALASE_CANVASES_2D;
        if (cache[s.id]) continue;
        if (want3D) {
          const sp3d = skinToSpecies(s, true);
          cache[s.id] = ETALASE_CYCLE.map((j, fi) => {
            const ph = (fi / ETALASE_CYCLE.length) * Math.PI * 2;
            const jawVal = j > 0 ? j / 6 : j < 0 ? -0.18 : 0;
            return fish3d.renderSnapshot(
              sp3d,
              {
                jaw: jawVal,
                chompPhase: j === -1 ? 0.08 : 0,
                chompDur: 0.13,
                chompBitFired: j === -1,
                biteLunge: j === -1 ? 1.6 : j >= 5 ? -0.5 : 0,
                tailPh: ph * 2,
                wag2: ph * 2,
                bend: Math.sin(ph) * 0.05,
                turnFlip: 1,
                tilt: Math.sin(ph) * 0.04,
                gulpT: j === -1 ? 0.65 : 0,
                gulpK: 0.65,
                sq: j === -1 ? 0.14 : 0,
                expr: j === -1 ? "happy" : "normal",
                puff: j === -1,
                sucking: false,
                swimSpeed: 0.55,
                inspectYaw: -0.16,
                inspectPitch: 0.04,
              },
              164
            );
          });
        } else {
          cache[s.id] = spriteAnimPreviewCanvases(skinToSpecies(s, false), 156, ETALASE_CYCLE);
        }
        if (++built >= 2) break;
      }

      const step = Math.floor(now / 65);
      const active = curRef.current;
      const activeIs3D = !!(useMode3D && active.supports3D);
      if (!activeIs3D) {
        if (!HERO_CANVASES[active.id]) {
          HERO_CANVASES[active.id] = spriteAnimPreviewCanvases(skinToSpecies(active, false), 240, PREVIEW_CYCLE);
        }
        const hFrames = HERO_CANVASES[active.id];
        drawPreviewFrame(
          heroCanvasRef.current,
          hFrames[step % hFrames.length],
          208,
          112,
          HERO_SCALE[active.id] ?? 1,
          Math.sin(now * 0.0026) * 4.2,
          Math.sin(now * 0.0026 - 0.8) * 0.025
        );
      }

      if (tabRef.current === "skin") {
        for (let idx = 0; idx < SKINS.length; idx++) {
          const s = SKINS[idx];
          const use3DCard = !!(useMode3D && s.supports3D);
          const frames = use3DCard ? ETALASE_CANVASES_3D[s.id] : ETALASE_CANVASES_2D[s.id];
          const cv = etalaseCanvasRefs.current[s.id];
          if (!frames || !cv) continue;
          const phase = now * 0.003 + idx * 0.85;
          drawPreviewFrame(
            cv,
            frames[(step + idx * 3) % frames.length],
            114,
            56,
            (ETALASE_SCALE[s.id] ?? 1) * (use3DCard ? 1.04 : 1),
            Math.sin(phase) * 2.4,
            Math.sin(phase - 0.6) * 0.028
          );
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const coin = useMemo(() => coinURL(), []);

  const pickSkin = (id: string) => setSave({ ...save, skin: id });

  const pickRandomSkin = () => {
    const others = SKINS.filter((s) => s.id !== save.skin);
    const next = others[Math.floor(Math.random() * others.length)] || SKINS[0];
    setSave({ ...save, skin: next.id });
  };

  const buyUp = (id: keyof Upgrades) => {
    const lv = save.upgrades[id];
    if (lv >= MAX_UPGRADE) return;
    const cost = UPGRADE_COSTS[lv];
    if (save.coins < cost) return;
    setSave({ ...save, coins: save.coins - cost, upgrades: { ...save.upgrades, [id]: lv + 1 } });
  };

  const titleChars = [
    { ch: "F", isIo: false, delay: "0s" },
    { ch: "i", isIo: false, delay: "0.1s" },
    { ch: "s", isIo: false, delay: "0.2s" },
    { ch: "h", isIo: false, delay: "0.3s" },
    { ch: ".", isIo: true, delay: "0.4s" },
    { ch: "i", isIo: true, delay: "0.5s" },
    { ch: "o", isIo: true, delay: "0.6s" },
  ];

  return (
    <div
      className="absolute inset-0 flex overflow-y-auto p-3 sm:p-4 clean-font"
      style={{
        background:
          "radial-gradient(ellipse at 50% 24%, rgba(34, 211, 238, 0.14) 0%, rgba(6, 26, 62, 0.34) 55%, rgba(3, 12, 34, 0.64) 100%)",
      }}
    >
      {/* Subtle floating ambient underwater bubbles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="float-bubble-a absolute left-[6%] bottom-[16%] w-4 h-4 rounded-full border border-cyan-200/55 bg-cyan-300/15" />
        <div className="float-bubble-b absolute left-[11%] bottom-[28%] w-2.5 h-2.5 rounded-full border border-white/50 bg-white/15" />
        <div className="float-bubble-c absolute right-[8%] bottom-[20%] w-5 h-5 rounded-full border border-cyan-200/50 bg-cyan-200/15" />
        <div className="float-bubble-a absolute right-[14%] bottom-[34%] w-3 h-3 rounded-full border border-sky-200/55 bg-sky-300/15" />
      </div>

      <div className="m-auto w-full max-w-[1140px] flex flex-col items-center gap-2.5 py-1 relative z-10">
        {/* ============ FESTIVE WOOD + .IO OCEAN ARCADE HEADER ============ */}
        <header className="relative text-center select-none flex flex-col items-center">
          <div
            className="sun-halo-spin pointer-events-none -top-10 absolute w-[360px] sm:w-[490px] h-[160px] rounded-full opacity-60"
            style={{
              background:
                "repeating-conic-gradient(from 0deg, rgba(135, 245, 255, 0.25) 0deg 9deg, transparent 9deg 24deg)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
              maskImage: "radial-gradient(ellipse at center, black 20%, transparent 72%)",
            }}
          />

          <div className="relative inline-flex items-center justify-center px-12 sm:px-16">
            {/* Left Darting Orange Clownfish Mascot */}
            <svg
              viewBox="0 0 60 36"
              className="mascot-wiggle pointer-events-none absolute -left-1 sm:left-0 top-1 sm:top-2 w-10 h-6 sm:w-13 sm:h-8 drop-shadow-[0_4px_6px_rgba(0,0,0,0.65)]"
            >
              <path className="mascot-tail" d="M16,18 L3,8 L7,18 L3,28 Z" fill="#ff7d14" stroke="#1e0b02" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M14,18 C16,7 38,5 54,18 C38,31 16,29 14,18 Z" fill="#ff841a" stroke="#1e0b02" strokeWidth="2.6" />
              <path d="M27,9 C25,18 25,21 27,27" fill="none" stroke="#ffffff" strokeWidth="3.6" />
              <path d="M38,9 C36,18 36,21 38,27" fill="none" stroke="#ffffff" strokeWidth="3.2" />
              <g className="mascot-eye">
                <circle cx="45" cy="15" r="4" fill="#ffffff" stroke="#1e0b02" strokeWidth="1.8" />
                <circle cx="46.2" cy="15" r="2" fill="#121c36" />
                <circle cx="45.6" cy="14" r="0.8" fill="#ffffff" />
              </g>
              <path d="M47,20 Q51,22 54,19" fill="none" stroke="#1e0b02" strokeWidth="1.8" strokeLinecap="round" />
            </svg>

            <h1 className="font-extrabold text-[52px] sm:text-[74px] md:text-[86px] leading-none tracking-tight flex items-baseline">
              {titleChars.map((item, idx) => (
                <span
                  key={idx}
                  className={`fish-letter ${item.isIo ? "fish-word-io" : "fish-word-gold"}`}
                  style={{ animationDelay: item.delay }}
                >
                  {item.ch}
                </span>
              ))}
            </h1>

            {/* Right Balancing Blue Tang Mascot */}
            <svg
              viewBox="0 0 54 34"
              className="bob pointer-events-none absolute -right-1 sm:right-0 bottom-1.5 sm:bottom-2 w-9 h-6 sm:w-12 sm:h-7 drop-shadow-[0_4px_6px_rgba(0,0,0,0.65)]"
              style={{ transform: "scaleX(-1)" }}
            >
              <path className="mascot-tail" d="M15,17 L2,8 L5,17 L2,26 Z" fill="#fde047" stroke="#082f49" strokeWidth="2.3" strokeLinejoin="round" />
              <path d="M13,17 C15,6 37,5 50,17 C37,29 15,28 13,17 Z" fill="#0ea5e9" stroke="#082f49" strokeWidth="2.4" />
              <path d="M22,12 C28,15 28,19 22,22" fill="none" stroke="#0f172a" strokeWidth="3.2" strokeLinecap="round" />
              <circle cx="41" cy="14.5" r="3.6" fill="#ffffff" stroke="#082f49" strokeWidth="1.6" />
              <circle cx="42" cy="14.5" r="1.8" fill="#082f49" />
            </svg>
          </div>

          {/* Carved Wood & Gold Nautical Ribbon Plaque */}
          <div className="relative -mt-1 z-10">
            <div className="badge-glow relative overflow-hidden ui-sheen px-6 sm:px-10 py-1 rounded-full bg-[#361b08]/95 border-[2.5px] border-[#e8a645] shadow-[0_6px_16px_rgba(0,0,0,0.65)] flex items-center gap-3">
              <span className="text-sky-300 text-[13px] sm:text-[14px]">⚓</span>
              <span className="font-extrabold text-[12px] sm:text-[14px] tracking-[0.12em] text-white uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">
                LAUTAN BERLAPIS · FEEDING FRENZY
              </span>
              <span className="text-sky-300 text-[13px] sm:text-[14px]">⚓</span>
            </div>
          </div>

          <p className="text-outline font-bold text-[13px] sm:text-[14.5px] mt-1 text-cyan-50 max-w-[700px]">
            Sedot kawanan ikan kecil untuk <span className="text-yellow-300">COMBO</span> beruntun &amp; hujan koin — habiskan gerombolan untuk bonus{" "}
            <span className="text-emerald-300">SAPU BERSIH!</span>
          </p>
        </header>

        {/* ============ TWO-PANEL CARVED NAUTICAL WOODEN .IO BOARDS ============ */}
        <div className="flex flex-col lg:flex-row gap-4 w-full items-stretch">
          {/* LEFT WOODEN BOARD: Luminous Lagoon Hero Porthole & Play Launcher */}
          <section className="artistic-wood-board relative p-4 sm:p-5 flex-1 flex flex-col items-center justify-between gap-2.5">
            {/* Decorative Swaying Corals */}
            <svg viewBox="0 0 36 42" className="coral-sway pointer-events-none absolute -top-5 -left-3 w-8 h-9 drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]">
              <path d="M18,40 L18,22 M18,28 C12,24 9,17 11,10 M18,23 C25,19 28,12 25,6 M14,19 C10,16 6,17 5,13" fill="none" stroke="#ff6b2b" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M18,40 L18,22 M18,28 C12,24 9,17 11,10 M18,23 C25,19 28,12 25,6" fill="none" stroke="#ffbe4f" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <svg viewBox="0 0 36 42" className="coral-sway-r pointer-events-none absolute -top-5 -right-3 w-8 h-9 drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]">
              <path d="M18,40 L18,20 M18,27 C11,22 8,15 11,8 M18,22 C24,18 28,13 26,6" fill="none" stroke="#a644e8" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M18,40 L18,20 M18,27 C11,22 8,15 11,8 M18,22 C24,18 28,13 26,6" fill="none" stroke="#eab8ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>

            {/* Nautical Brass Screws */}
            <div className="absolute top-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>

            {/* Luminous Lagoon Porthole Spotlight inside the Wooden Frame */}
            <div className="w-full flex flex-col items-center gap-1.5">
              <div className="wood-lagoon-porthole relative w-full py-2 px-4 flex flex-col items-center justify-center overflow-hidden">
                <div className="caustic-pedestal absolute bottom-2 w-36 h-4 rounded-full bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent blur-[3px]" />
                {heroIs3D ? (
                  <div className="relative z-10 w-[224px] h-[124px] flex items-center justify-center">
                    <Fish3DViewport species={heroSpecies} onBiteCount={biteTrig} />
                  </div>
                ) : (
                  <div className="relative z-10 w-[208px] h-[112px] flex items-center justify-center">
                    <canvas
                      ref={heroCanvasRef}
                      aria-label={cur.name}
                      className="w-[208px] h-[112px] block drop-shadow-[0_10px_16px_rgba(0,0,0,0.68)]"
                    />
                  </div>
                )}
              </div>

              <div className="text-center flex flex-wrap items-center justify-center gap-1.5 text-outline">
                <span className="text-[20px] sm:text-[21px] font-extrabold text-white">{cur.name}</span>
                <span className="text-yellow-300 font-bold text-[14px]">· {cur.subtitle}</span>
                {cur.rare && (
                  <span className="px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 via-yellow-300 to-fuchsia-400 text-[#2b103f] font-black text-[11px] tracking-wider shadow-[0_1px_6px_rgba(255,215,90,0.6)]">
                    ★ LANGKA
                  </span>
                )}
              </div>

              {cur.supports3D && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#221206] border border-[#6e3f18]">
                    <button
                      type="button"
                      onClick={() => setSave({ ...save, mode3D: false })}
                      className={`px-3 py-1 rounded-md text-[12px] font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        !save.mode3D
                          ? "bg-amber-400 text-[#281204] shadow-sm"
                          : "text-amber-100/80 hover:text-white"
                      }`}
                    >
                      Ikan 2D
                    </button>
                    <button
                      type="button"
                      onClick={() => setSave({ ...save, mode3D: true })}
                      className={`px-3 py-1 rounded-md text-[12px] font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        save.mode3D
                          ? "bg-cyan-400 text-[#071f33] shadow-sm"
                          : "text-cyan-100/85 hover:text-white"
                      }`}
                    >
                      Ikan 3D
                    </button>
                  </div>
                  {heroIs3D && (
                    <button
                      type="button"
                      onClick={() => setBiteTrig((c) => c + 1)}
                      className="px-3 py-1 rounded-lg bg-[#144363] hover:bg-[#1b5a85] border border-cyan-300/45 text-[12px] font-extrabold text-cyan-100 cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
                    >
                      Tes Makan 3D
                    </button>
                  )}
                </div>
              )}

              {/* Environment Corals & Large Rocks Mode (Default 3D with 2D option) */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-[11.5px] font-bold text-amber-200/90">🪸 Karang &amp; Batu:</span>
                <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#221206] border border-[#6e3f18]">
                  <button
                    type="button"
                    onClick={() => setSave({ ...save, reef3D: true })}
                    className={`px-2.5 py-0.5 rounded-md text-[11.5px] font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      save.reef3D
                        ? "bg-cyan-400 text-[#071f33] shadow-sm"
                        : "text-cyan-100/85 hover:text-white"
                    }`}
                  >
                    3D (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSave({ ...save, reef3D: false })}
                    className={`px-2.5 py-0.5 rounded-md text-[11.5px] font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      !save.reef3D
                        ? "bg-amber-400 text-[#281204] shadow-sm"
                        : "text-amber-100/80 hover:text-white"
                    }`}
                  >
                    2D
                  </button>
                </div>
              </div>

              {save.equippedTitle && (
                <div className="ff-carved-slot px-3.5 py-0.5 text-[12px] font-extrabold tracking-wide text-yellow-300 border-amber-400/60 shadow-sm">
                  👑 Julukan: « {save.equippedTitle} »
                </div>
              )}
            </div>

            {/* Carved Wood Nickname Slot + Big Emerald Play Button + Koleksi Piagam */}
            <div className="w-full flex flex-col gap-2">
              <div className="relative w-full">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] opacity-85">🏷️</span>
                <input
                  value={save.name}
                  maxLength={14}
                  onChange={(e) => setSave({ ...save, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onPlay();
                  }}
                  placeholder="Ketik nama ikanmu..."
                  aria-label="Nama ikan"
                  className="w-full font-bold text-[16px] text-center py-2.5 px-9 rounded-xl bg-[#221206] text-amber-50 border-2 border-[#6e3f18] outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 focus:border-yellow-300 placeholder:text-amber-200/45 shadow-inner transition-all"
                />
              </div>

              <button
                onClick={onPlay}
                className={`ui-btn ui-sheen relative overflow-hidden w-full min-h-[54px] py-3.5 text-[22px] text-white tracking-wide ${loading ? "" : "play-btn-pulse"}`}
                style={{
                  background: loading
                    ? "linear-gradient(180deg, #3f8a62, #246342)"
                    : "linear-gradient(180deg, #4be880 0%, #1ba248 100%)",
                }}
              >
                {loading && (
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${Math.round(loadPct * 100)}%`, background: "linear-gradient(180deg, #45e078, #1fa84d)", opacity: 0.85 }}
                  />
                )}
                <span className="relative drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] font-extrabold">
                  {loading ? `Menyiapkan lautan… ${Math.round(loadPct * 100)}%` : "▶ MAIN SEKARANG!"}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenTrophies}
                className="ui-btn ui-sheen relative overflow-hidden w-full min-h-[44px] py-2 px-4 flex items-center justify-between gap-2 text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
                style={{
                  background: "linear-gradient(180deg, #f59e0b 0%, #b45309 100%)",
                }}
              >
                <span className="relative flex items-center gap-2 text-[14.5px] font-extrabold drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.65)]">
                  <span aria-hidden="true">🏅</span>
                  <span>KOLEKSI PIAGAM &amp; JULUKAN</span>
                </span>
                <span className="relative px-2 py-0.5 rounded-md bg-[#2b1405]/80 border border-amber-200/40 text-[12px] font-extrabold text-yellow-200 tabular-nums">
                  {unlockedTrophyCount}/{TROPHIES.length}
                </span>
              </button>
            </div>

            {/* Compact Speed Presets inside Dark Carved Slot */}
            <div className="w-full artistic-inset px-3.5 py-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[13px] font-bold text-amber-100">
                <span>⚡ Kecepatan Ikan</span>
                <span className="text-yellow-300 font-extrabold tabular-nums">{save.speedPref.toFixed(1)}x</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.1}
                  value={save.speedPref}
                  aria-label="Kecepatan ikan"
                  onChange={(e) => setSave({ ...save, speedPref: parseFloat(e.target.value) })}
                  className="flex-1 accent-amber-400 cursor-pointer h-1.5"
                />
                <div className="flex gap-1 shrink-0">
                  {[
                    { label: "0.8x", val: 0.8 },
                    { label: "1.0x", val: 1.0 },
                    { label: "1.3x", val: 1.3 },
                    { label: "1.6x", val: 1.6 },
                  ].map((p) => {
                    const active = Math.abs(save.speedPref - p.val) < 0.05;
                    return (
                      <button
                        key={p.val}
                        onClick={() => setSave({ ...save, speedPref: p.val })}
                        className={`px-2 py-0.5 rounded text-[12px] font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 ${
                          active
                            ? "bg-amber-400 text-[#281204]"
                            : "bg-[#3d210d] text-amber-100/85 hover:bg-[#573014]"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="text-[13px] leading-relaxed text-amber-50 text-center font-medium w-full">
              <span className="text-white font-bold">Kursor</span> Berenang
              <span aria-hidden="true" className="mx-1.5 text-amber-300">·</span>
              <span className="text-cyan-300 font-bold">Klik Kiri / Spasi</span> Sedot
              <span aria-hidden="true" className="mx-1.5 text-amber-300">·</span>
              <span className="text-yellow-300 font-bold">Klik Kanan / Shift</span> Boost
            </div>

            {save.best > 0 && (
              <div className="text-[15px] font-bold text-yellow-200 text-outline tabular-nums">
                🏆 Skor Rekor: {save.best.toLocaleString("en-US")}
              </div>
            )}
          </section>

          {/* RIGHT WOODEN BOARD: Ocean-Lit Fish Etalase & Upgrade Workshop */}
          <section className="artistic-wood-board relative p-4 sm:p-5 flex-[1.52] min-w-0 flex flex-col gap-3">
            {/* Decorative Swaying Sea Fan Coral */}
            <svg viewBox="0 0 36 42" className="coral-sway-r pointer-events-none absolute -top-5 -right-3 w-8 h-9 drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)]">
              <path d="M18,40 L18,22 M18,28 C12,24 9,17 11,10 M18,23 C25,19 28,12 25,6" fill="none" stroke="#ff7224" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M18,40 L18,22 M18,28 C12,24 9,17 11,10 M18,23 C25,19 28,12 25,6" fill="none" stroke="#ffd25e" strokeWidth="1.6" strokeLinecap="round" />
            </svg>

            {/* Nautical Brass Screws */}
            <div className="absolute top-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
            <div className="absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>

            {/* Top Row: Carved Wooden Tabs + Random Fish + Carved Coin Bank */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setTab("skin")}
                  className="ui-btn px-4 py-1.5 text-[15px] text-white whitespace-nowrap shrink-0"
                  style={{ background: tab === "skin" ? "linear-gradient(180deg, #ff9938, #d95b12)" : "#4d2c14" }}
                >
                  🐠 IKAN FRENZY ({SKINS.length})
                </button>
                <button
                  onClick={() => setTab("shop")}
                  className="ui-btn px-4 py-1.5 text-[15px] text-white whitespace-nowrap shrink-0"
                  style={{ background: tab === "shop" ? "linear-gradient(180deg, #ff9938, #d95b12)" : "#4d2c14" }}
                >
                  ⚡ UPGRADE
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {tab === "skin" && (
                  <button
                    onClick={pickRandomSkin}
                    className="ui-btn px-3.5 py-1.5 text-[13.5px] text-amber-100 whitespace-nowrap shrink-0"
                    style={{ background: "linear-gradient(180deg, #2b7a9e, #184e6b)" }}
                    title="Pilih ikan secara acak"
                  >
                    🎲 Acak Ikan
                  </button>
                )}
                <div className="ff-carved-slot px-3 py-1 flex items-center gap-1.5 text-[18px] font-extrabold text-yellow-200 tabular-nums">
                  <img src={coin} className="w-6 h-6" alt="Koin" />
                  <span>{save.coins.toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>

            {tab === "skin" ? (
              <div className="wood-scroll flex-1 min-h-[360px] max-h-[420px] overflow-y-auto pr-1.5 py-0.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 items-start">
                  {SKINS.map((s) => {
                    const sel = save.skin === s.id;

                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickSkin(s.id)}
                        className={`relative p-2 flex flex-col items-stretch text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200 ${
                          sel
                            ? "wood-fish-tile-active"
                            : s.rare
                              ? "wood-fish-tile wood-fish-tile-rare"
                              : "wood-fish-tile"
                        }`}
                      >
                        {sel && (
                          <span
                            className="pointer-events-none absolute inset-0 rounded-[11px] overflow-hidden ui-sheen"
                            aria-hidden="true"
                          />
                        )}
                        {/* Recessed Deep-Lagoon Viewport with Animated Fish */}
                        <div
                          className={`relative w-full h-[64px] shrink-0 overflow-hidden flex items-center justify-center ${
                            sel
                              ? "etalase-lagoon-window ring-1 ring-amber-200/75"
                              : s.rare
                                ? "etalase-lagoon-window etalase-lagoon-window-rare"
                                : "etalase-lagoon-window"
                          }`}
                        >
                          {s.rare && (
                            <span className="absolute top-1 right-1 px-1.5 py-[2px] rounded bg-gradient-to-r from-amber-300 via-yellow-200 to-fuchsia-300 text-[#2a0e3d] font-black text-[9.5px] leading-none tracking-wide shadow-sm z-10">
                              ★ LANGKA
                            </span>
                          )}
                          {s.supports3D && (
                            <span
                              className={`absolute top-1 ${s.rare ? "left-1" : "right-1"} px-1.5 py-[2px] rounded font-black text-[9.5px] leading-none tracking-wide shadow-sm z-10 ${
                                save.mode3D
                                  ? "bg-gradient-to-r from-cyan-300 to-sky-400 text-[#072138]"
                                  : "bg-slate-900/75 text-cyan-200 border border-cyan-300/45"
                              }`}
                            >
                              3D
                            </span>
                          )}

                          <div className="relative z-10 w-[114px] h-[56px] flex items-center justify-center">
                            <canvas
                              ref={(el) => {
                                etalaseCanvasRefs.current[s.id] = el;
                              }}
                              aria-label={s.name}
                              className="w-[114px] h-[56px] block drop-shadow-[0_4px_8px_rgba(0,0,0,0.62)]"
                            />
                          </div>
                        </div>

                        {/* Uncropped Readable Name, Subtitle & Status */}
                        <div className="pt-1.5 flex flex-col items-center gap-0.5 shrink-0 min-w-0">
                          <div
                            className={`text-[14px] font-extrabold leading-snug truncate w-full shrink-0 ${
                              sel ? "text-[#2b1504]" : "text-white"
                            }`}
                          >
                            {s.name}
                          </div>
                          <div
                            className={`text-[11.5px] leading-snug truncate w-full shrink-0 ${
                              sel ? "text-[#4d2808] font-semibold" : "text-cyan-200/90 font-medium"
                            }`}
                          >
                            {s.subtitle}
                          </div>
                          <div
                            className={`mt-1 w-full py-1 rounded-lg text-[12px] font-extrabold tracking-wide leading-none whitespace-nowrap shrink-0 ${
                              sel
                                ? "bg-[#361b08] text-amber-200 shadow-inner"
                                : s.rare
                                  ? "bg-[#0c203e] text-cyan-200 border border-cyan-400/30"
                                  : "bg-[#1a0d05] text-yellow-300 border border-amber-500/20"
                            }`}
                          >
                            {sel ? "✓ DIPAKAI" : "PAKAI"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {UPGRADES.map((u) => {
                  const lv = save.upgrades[u.id];
                  const max = lv >= MAX_UPGRADE;
                  const cost = max ? 0 : UPGRADE_COSTS[lv];
                  const canBuy = !max && save.coins >= cost;
                  return (
                    <div key={u.id} className="flex items-center gap-3.5 artistic-inset p-4">
                      <div className="text-[30px] shrink-0">{u.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[16px] font-extrabold text-amber-50">{u.name}</span>
                          <span className="text-[13px] font-bold text-yellow-300 tabular-nums shrink-0">
                            Lv {lv}/{MAX_UPGRADE}
                          </span>
                        </div>
                        <div className="text-[13px] text-amber-200/90 mt-0.5">{u.desc}</div>
                        <div className="flex gap-1.5 mt-2">
                          {Array.from({ length: MAX_UPGRADE }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-3 flex-1 rounded-sm border border-[#1a0d04] ${i < lv ? "ff-yellow-fill" : "bg-[#422712]"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => buyUp(u.id)}
                        disabled={!canBuy}
                        className="ui-btn px-4 py-2 text-[14.5px] text-white disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 tabular-nums"
                        style={{ background: max ? "#5c534a" : "linear-gradient(180deg, #ff9938, #d95b12)" }}
                      >
                        {max ? "MAKSIMAL" : `🪙 ${cost}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
