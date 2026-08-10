#!/usr/bin/env node
/**
 * KAIROS brand generator — Concept A "THE MOMENT".
 *
 * Pure-vector logo system. No dependencies, no rasters. Run:
 *
 *   node brand/generate.mjs
 *
 * Outputs to brand/dist/:
 *   variations/kairos-symbol-{A..F}.svg
 *   kairos-symbol.svg          (recommended F)
 *   kairos-wordmark.svg
 *   kairos-horizontal.svg
 *   kairos-vertical.svg
 *   kairos-monochrome.svg
 *   kairos-reversed.svg
 *   kairos-app-icon.svg        (+ -dark / -light)
 *   preview.html               (side-by-side comparison + splash animation demo)
 *
 * GEOMETRY MODEL
 * --------------
 * The symbol is a set of tapered "streams" that swirl inward toward a small
 * central dot (id="moment-point"). Each stream is generated from a polar
 * centerline:  angle(t) = θ0 + swirl·t^curvePow,  radius(t) = lerp(Rout→Rin, t)
 * with a width profile that tapers toward the center — thick where the stream
 * enters the canvas, a fine tip where it resolves into the moment. This makes
 * the motion read as  → → ●  (many possibilities converging on one moment).
 *
 * Streams are individually addressable (id="stream-01" …) so opacity /
 * scale / rotation / draw-in can be animated per stream at splash time.
 *
 * PARAMETERS (per variation, see VARIATIONS below)
 *   streamCount   number of streams
 *   gapDeg        angular opening (centered on 0° = east) kept free of streams;
 *                 gives the mark its "C"-like aperture and a resting place for the eye
 *   outerR        base outer radius of stream entry points
 *   innerR        radius where stream tips resolve (just outside the dot)
 *   elongation    how much streams on the west side stretch farther out (0..1) —
 *                 breaks sun-burst symmetry, adds directionality
 *   baseWidth     stream width at its outer end
 *   tipWidth      stream width at the tip
 *   taperPow      >1 keeps streams thick longer before tapering
 *   swirlDeg      degrees of clockwise swirl from entry to tip
 *   curvePow      >1 = swirl accelerates near the center (feels like being pulled in)
 *   momentR       radius of the central dot
 *   asymmetry     0..1 controlled per-stream jitter (length/width/angle/swirl)
 *   seed          RNG seed so output is reproducible
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');
const INK = '#101820'; // primary charcoal
const PAPER = '#FFFFFF';

// ---------------------------------------------------------------------------
// Variations (all recognizably Concept A)
// ---------------------------------------------------------------------------
const BASE = {
  streamCount: 11,
  gapDeg: 76,
  outerR: 100,
  innerR: 17,
  elongation: 0.34,
  baseWidth: 22,
  tipWidth: 4,
  taperPow: 1.15,
  swirlDeg: 58,
  curvePow: 1,
  momentR: 10.5,
  asymmetry: 0.25,
  seed: 7,
};

export const VARIATIONS = {
  A: { ...BASE, name: 'Elegant / thin', baseWidth: 16, tipWidth: 3, streamCount: 13, swirlDeg: 54, elongation: 0.4, asymmetry: 0.2 },
  B: { ...BASE, name: 'Energetic', swirlDeg: 74, elongation: 0.46, baseWidth: 20, streamCount: 12, asymmetry: 0.35 },
  C: { ...BASE, name: 'Minimal', streamCount: 8, baseWidth: 27, tipWidth: 5.5, swirlDeg: 46, gapDeg: 84, elongation: 0.24, asymmetry: 0.15 },
  D: { ...BASE, name: 'Asymmetric', asymmetry: 0.65, elongation: 0.52, swirlDeg: 62, seed: 12 },
  E: { ...BASE, name: 'Compact / icon', outerR: 86, innerR: 19, baseWidth: 25, tipWidth: 5.5, streamCount: 10, gapDeg: 66, swirlDeg: 48, elongation: 0.2, momentR: 12, asymmetry: 0.18 },
  F: { ...BASE, name: 'Balanced (recommended)' },
};

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Deterministic RNG (mulberry32). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom spline through pts → SVG cubic segments (smooth, compact). */
function splineTo(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Stream geometry
// ---------------------------------------------------------------------------
function buildStream(p, θ0deg, jitter) {
  const SAMPLES = 15;
  const θ0 = rad(θ0deg + jitter.angle);
  const swirl = rad(p.swirlDeg * (1 + jitter.swirl));
  // Streams entering from the west (θ = 180°) reach farther out; the east side
  // (where the aperture sits) stays compact. This gives the mark direction.
  const Rout = p.outerR * (1 + p.elongation * 0.5 * (1 - Math.cos(θ0))) * (1 + jitter.len);
  const Rin = p.innerR * (1 + jitter.inner);
  const w0 = p.baseWidth * (1 + jitter.width);
  const w1 = p.tipWidth;

  const center = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const a = θ0 + swirl * Math.pow(t, p.curvePow);
    const r = lerp(Rout, Rin, t);
    center.push([r * Math.cos(a), r * Math.sin(a)]);
  }

  // Tangents (finite differences) → unit normals.
  const edgeL = [];
  const edgeR = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(SAMPLES - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const t = i / (SAMPLES - 1);
    const w = lerp(w0, w1, Math.pow(t, p.taperPow)) / 2;
    edgeL.push([center[i][0] - ty * w, center[i][1] + tx * w, tx, ty, w]);
    edgeR.push([center[i][0] + ty * w, center[i][1] - tx * w, tx, ty, w]);
  }

  // Path: outer cap → edgeL in → tip cap → edgeR back out.
  const first = edgeL[0];
  const last = edgeL[SAMPLES - 1];
  const rFirst = edgeR[0];
  const rLast = edgeR[SAMPLES - 1];
  const k0 = first[4] * (4 / 3); // cubic半circle approximation
  const k1 = last[4] * (4 / 3);
  // Outward direction at the outer end (away from travel) and at the tip (with travel).
  const out0 = [-first[2], -first[3]];
  const out1 = [last[2], last[3]];

  let d = `M${fmt(first[0])} ${fmt(first[1])}`;
  d += splineTo(edgeL.map((e) => [e[0], e[1]]));
  d += ` C${fmt(last[0] + out1[0] * k1)} ${fmt(last[1] + out1[1] * k1)} ${fmt(rLast[0] + out1[0] * k1)} ${fmt(rLast[1] + out1[1] * k1)} ${fmt(rLast[0])} ${fmt(rLast[1])}`;
  d += splineTo(edgeR.map((e) => [e[0], e[1]]).reverse());
  d += ` C${fmt(rFirst[0] + out0[0] * k0)} ${fmt(rFirst[1] + out0[1] * k0)} ${fmt(first[0] + out0[0] * k0)} ${fmt(first[1] + out0[1] * k0)} ${fmt(first[0])} ${fmt(first[1])}`;
  d += ' Z';

  const xs = [...edgeL, ...edgeR].map((e) => e[0]);
  const ys = [...edgeL, ...edgeR].map((e) => e[1]);
  return { d, bbox: [Math.min(...xs) - w0, Math.min(...ys) - w0, Math.max(...xs) + w0, Math.max(...ys) + w0] };
}

/**
 * Build the full symbol group for a parameter set.
 * Returns { group, bbox } where group is centered on (0,0).
 */
export function buildSymbol(p) {
  const rand = rng(p.seed);
  const streams = [];
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];

  const half = p.gapDeg / 2;
  const span = 360 - p.gapDeg;
  for (let i = 0; i < p.streamCount; i++) {
    const t = p.streamCount === 1 ? 0.5 : i / (p.streamCount - 1);
    const θ = half + span * t; // degrees, gap centered on 0° (east)
    const jitter = {
      angle: (rand() - 0.5) * 4 * p.asymmetry,
      swirl: (rand() - 0.5) * 0.3 * p.asymmetry,
      len: (rand() - 0.5) * 0.34 * p.asymmetry,
      width: (rand() - 0.5) * 0.2 * p.asymmetry,
      inner: (rand() - 0.5) * 0.18 * p.asymmetry,
    };
    const s = buildStream(p, θ, jitter);
    streams.push(`    <path id="stream-${String(i + 1).padStart(2, '0')}" class="stream" d="${s.d}"/>`);
    bbox = [
      Math.min(bbox[0], s.bbox[0]),
      Math.min(bbox[1], s.bbox[1]),
      Math.max(bbox[2], s.bbox[2]),
      Math.max(bbox[3], s.bbox[3]),
    ];
  }

  const dot = `    <circle id="moment-point" class="moment" cx="0" cy="0" r="${fmt(p.momentR)}"/>`;
  bbox = [
    Math.min(bbox[0], -p.momentR),
    Math.min(bbox[1], -p.momentR),
    Math.max(bbox[2], p.momentR),
    Math.max(bbox[3], p.momentR),
  ];
  const group = `  <g fill="currentColor">\n${streams.join('\n')}\n${dot}\n  </g>`;
  return { group, bbox };
}

function symbolSvg(p, { color = 'currentColor', pad = 14 } = {}) {
  const { group, bbox } = buildSymbol(p);
  const [x0, y0, x1, y1] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
  const attrs = color === 'currentColor' ? '' : ` color="${color}"`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)}"${attrs} role="img" aria-label="KAIROS symbol">\n${group}\n</svg>\n`,
    viewBox: [x0, y0, x1 - x0, y1 - y0],
    group,
  };
}

// ---------------------------------------------------------------------------
// Wordmark — KAIROS drawn as stroked vector paths (no font dependency).
// Cap height 100 in local units, y grows downward. Centerline coordinates.
// ---------------------------------------------------------------------------
const SW = 14.5; // stroke weight

function letterPaths() {
  // Each entry: { d: [...path strings], adv: advance width }
  return {
    K: {
      d: [
        'M8 2 L8 98',                 // stem
        'M60 2 L9 53',                // arm meets the stem
        'M25 37 L64 98',              // leg kicks from the arm
      ],
      adv: 72,
    },
    A: {
      d: [
        'M4 98 L38 2 L72 98',         // diagonals
        'M18 64 L58 64',              // crossbar
      ],
      adv: 80,
    },
    I: { d: ['M8 2 L8 98'], adv: 18 },
    R: {
      d: [
        'M8 2 L8 98',                                       // stem
        'M8 8 L36 8 C60 8 60 50 36 50 L8 50',               // bowl
        'M34 50 L62 98',                                    // leg
      ],
      adv: 70,
    },
    O: {
      // Near-circular oval built from four symmetric cubics.
      d: ['M38 2 C17 2 7 23 7 50 C7 77 17 98 38 98 C59 98 69 77 69 50 C69 23 59 2 38 2 Z'],
      adv: 78,
    },
    S: {
      d: [
        'M58 15 C51 3 20 1 13 18 C6 35 26 42 37 46 C50 51 64 58 59 77 C54 97 20 100 9 85',
      ],
      adv: 70,
    },
  };
}

export function buildWordmark({ tracking = 12 } = {}) {
  const L = letterPaths();
  const order = ['K', 'A', 'I', 'R', 'O', 'S'];
  let x = 0;
  const parts = [];
  for (const ch of order) {
    const def = L[ch];
    const paths = def.d
      .map((d) => `      <path d="${d}"/>`)
      .join('\n');
    parts.push(`    <g transform="translate(${fmt(x)} 0)">\n${paths}\n    </g>`);
    x += def.adv + tracking;
  }
  const width = x - tracking;
  const group = `  <g fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">\n${parts.join('\n')}\n  </g>`;
  return { group, width, height: 100 };
}

function wordmarkSvg({ color = 'currentColor' } = {}) {
  const wm = buildWordmark();
  const pad = SW;
  const attrs = color === 'currentColor' ? '' : ` color="${color}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(-pad)} ${fmt(-pad)} ${fmt(wm.width + pad * 2)} ${fmt(100 + pad * 2)}"${attrs} role="img" aria-label="KAIROS">\n${wm.group}\n</svg>\n`;
}

// ---------------------------------------------------------------------------
// Lockups
// ---------------------------------------------------------------------------
function horizontalSvg(p, { color = 'currentColor' } = {}) {
  const sym = symbolSvg(p, { pad: 0 });
  const wm = buildWordmark();
  const symH = 150; // symbol display height
  const [sx, sy, sw, sh] = sym.viewBox;
  const scale = symH / sh;
  const symW = sw * scale;
  const wmH = 84;
  const wmScale = wmH / 100;
  const gap = 40;
  const totalW = symW + gap + wm.width * wmScale;
  const totalH = Math.max(symH, wmH);
  const pad = 16;
  const attrs = color === 'currentColor' ? '' : ` color="${color}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(-pad)} ${fmt(-pad)} ${fmt(totalW + pad * 2)} ${fmt(totalH + pad * 2)}"${attrs} role="img" aria-label="KAIROS">
  <g transform="translate(${fmt(-sx * scale)} ${fmt(-sy * scale)}) scale(${fmt(scale)})">
${sym.group}
  </g>
  <g transform="translate(${fmt(symW + gap)} ${fmt((totalH - wmH) / 2)}) scale(${fmt(wmScale)})">
${buildWordmark().group}
  </g>
</svg>\n`;
}

function verticalSvg(p, { color = 'currentColor' } = {}) {
  const sym = symbolSvg(p, { pad: 0 });
  const wm = buildWordmark();
  const symH = 190;
  const [sx, sy, sw, sh] = sym.viewBox;
  const scale = symH / sh;
  const symW = sw * scale;
  const wmH = 58;
  const wmScale = wmH / 100;
  const wmW = wm.width * wmScale;
  const gap = 46;
  const totalW = Math.max(symW, wmW);
  const totalH = symH + gap + wmH;
  const pad = 18;
  const attrs = color === 'currentColor' ? '' : ` color="${color}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(-pad)} ${fmt(-pad)} ${fmt(totalW + pad * 2)} ${fmt(totalH + pad * 2)}"${attrs} role="img" aria-label="KAIROS">
  <g transform="translate(${fmt((totalW - symW) / 2 - sx * scale)} ${fmt(-sy * scale)}) scale(${fmt(scale)})">
${sym.group}
  </g>
  <g transform="translate(${fmt((totalW - wmW) / 2)} ${fmt(symH + gap)}) scale(${fmt(wmScale)})">
${wm.group}
  </g>
</svg>\n`;
}

function appIconSvg(p, { bg = '#0B0E14', fg = '#F5F7FA', radius = 116 } = {}) {
  const sym = symbolSvg(p, { pad: 0 });
  const [sx, sy, sw, sh] = sym.viewBox;
  const SIZE = 512;
  const safe = SIZE * 0.72; // symbol fits inside 72% of the tile
  const scale = safe / Math.max(sw, sh);
  const tx = (SIZE - sw * scale) / 2 - sx * scale;
  const ty = (SIZE - sh * scale) / 2 - sy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="KAIROS app icon">
  <rect width="${SIZE}" height="${SIZE}" rx="${radius}" fill="${bg}"/>
  <g color="${fg}" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(scale)})">
${sym.group}
  </g>
</svg>\n`;
}

// ---------------------------------------------------------------------------
// Preview page
// ---------------------------------------------------------------------------
function previewHtml() {
  const keys = Object.keys(VARIATIONS);
  const cells = (dark) =>
    keys
      .map((k) => {
        const svg = symbolSvg(VARIATIONS[k]).svg;
        return `<div class="cell ${dark ? 'dark' : ''}">
  <h3>${k} — ${VARIATIONS[k].name}</h3>
  <div class="sizes">
    <span class="s256">${svg}</span>
    <span class="s96">${svg}</span>
    <span class="s48">${svg}</span>
    <span class="s28">${svg}</span>
  </div>
</div>`;
      })
      .join('\n');

  const animSvg = symbolSvg(VARIATIONS.F).svg.replace('<svg ', '<svg class="anim" ');
  const horiz = horizontalSvg(VARIATIONS.F);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>KAIROS — Concept A geometry comparison</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 14px/1.5 -apple-system, 'Segoe UI', sans-serif; background: #F5F7FA; color: #101820; padding: 32px; }
  h1 { font-size: 20px; letter-spacing: -0.02em; }
  h2 { margin-top: 40px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.12em; color: #6E7488; }
  h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .cell { background: #fff; border: 1px solid #DCE1EA; border-radius: 14px; padding: 18px; color: #101820; }
  .cell.dark { background: #0B0E14; border-color: #2A3344; color: #F5F7FA; }
  .sizes { display: flex; align-items: flex-end; gap: 18px; }
  .sizes svg { display: block; }
  .s256 svg { width: 200px; height: 200px; }
  .s96 svg { width: 96px; height: 96px; }
  .s48 svg { width: 48px; height: 48px; }
  .s28 svg { width: 28px; height: 28px; }
  .stage { background: #0B0E14; border-radius: 14px; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 28px; color: #F5F7FA; }
  .stage .anim { width: 260px; height: 260px; }
  .lockup svg { width: 420px; }
  button { background: #101820; color: #fff; border: 0; border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }

  /* Splash animation demo — streams converge, then the moment lands. */
  .playing .stream { opacity: 0; transform-origin: 0 0; animation: converge 620ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards; }
  .playing #moment-point { opacity: 0; transform-origin: 0 0; animation: moment 420ms cubic-bezier(0.2, 0.9, 0.3, 1.4) forwards; animation-delay: 640ms; }
${Object.keys(VARIATIONS.F)
  .slice(0, 0)
  .join('')}${Array.from({ length: 16 })
    .map((_, i) => `  .playing .stream:nth-of-type(${i + 1}) { animation-delay: ${60 + i * 42}ms; }`)
    .join('\n')}
  @keyframes converge {
    from { opacity: 0; transform: scale(1.22) rotate(-10deg); }
    60%  { opacity: 1; }
    to   { opacity: 1; transform: scale(1) rotate(0deg); }
  }
  @keyframes moment {
    from { opacity: 0; transform: scale(0); }
    to   { opacity: 1; transform: scale(1); }
  }
</style>
</head>
<body>
  <h1>KAIROS — Concept A "The Moment" · geometry comparison</h1>
  <p>Sizes: 200 / 96 / 48 / 28 px. Check silhouette at 28px before choosing.</p>

  <h2>Black on white</h2>
  <div class="grid">
${cells(false)}
  </div>

  <h2>White on black</h2>
  <div class="grid">
${cells(true)}
  </div>

  <h2>Splash animation demo (variation F)</h2>
  <div class="stage">
    <div id="anim-wrap">${animSvg}</div>
    <div class="lockup">${horiz}</div>
    <button onclick="replay()">Replay animation</button>
  </div>

<script>
function replay() {
  const el = document.getElementById('anim-wrap');
  el.classList.remove('playing');
  void el.offsetWidth;
  el.classList.add('playing');
}
replay();
</script>
</body>
</html>\n`;
}

// ---------------------------------------------------------------------------
// Expo app assets (SVG sources; rasterize with sharp/resvg at build time)
// ---------------------------------------------------------------------------
const APP_BG = '#0B0E14';   // theme ink-800
const APP_FG = '#F5F7FA';   // paper
const ACCENT = '#3ED5BB';   // brand teal

/** Square iOS/Expo icon — full-bleed background, no rounded corners (OS masks). */
function expoIconSvg(p) {
  return appIconSvg(p, { bg: APP_BG, fg: APP_FG, radius: 0 });
}

/** Android adaptive foreground — transparent bg, symbol inside the ~66% safe zone. */
function expoAdaptiveSvg(p) {
  const sym = symbolSvg(p, { pad: 0 });
  const [sx, sy, sw, sh] = sym.viewBox;
  const SIZE = 1024;
  const safe = SIZE * 0.52;
  const scale = safe / Math.max(sw, sh);
  const tx = (SIZE - sw * scale) / 2 - sx * scale;
  const ty = (SIZE - sh * scale) / 2 - sy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <g color="${APP_FG}" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(scale)})">
${sym.group}
  </g>
</svg>\n`;
}

/** Splash image — transparent bg (Expo paints backgroundColor), accent symbol. */
function expoSplashSvg(p) {
  const sym = symbolSvg(p, { pad: 0 });
  const [sx, sy, sw, sh] = sym.viewBox;
  const SIZE = 2048;
  const target = SIZE * 0.34;
  const scale = target / Math.max(sw, sh);
  const tx = (SIZE - sw * scale) / 2 - sx * scale;
  const ty = (SIZE - sh * scale) / 2 - sy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <g color="${ACCENT}" transform="translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(scale)})">
${sym.group}
  </g>
</svg>\n`;
}

// ---------------------------------------------------------------------------
// React Native data module — keeps each stream addressable for splash motion.
// ---------------------------------------------------------------------------
function rnDataModule(p) {
  const rand = rng(p.seed);
  const half = p.gapDeg / 2;
  const span = 360 - p.gapDeg;
  const paths = [];
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.streamCount; i++) {
    const t = p.streamCount === 1 ? 0.5 : i / (p.streamCount - 1);
    const θ = half + span * t;
    const jitter = {
      angle: (rand() - 0.5) * 4 * p.asymmetry,
      swirl: (rand() - 0.5) * 0.3 * p.asymmetry,
      len: (rand() - 0.5) * 0.34 * p.asymmetry,
      width: (rand() - 0.5) * 0.2 * p.asymmetry,
      inner: (rand() - 0.5) * 0.18 * p.asymmetry,
    };
    const s = buildStream(p, θ, jitter);
    paths.push(s.d);
    bbox = [
      Math.min(bbox[0], s.bbox[0]),
      Math.min(bbox[1], s.bbox[1]),
      Math.max(bbox[2], s.bbox[2]),
      Math.max(bbox[3], s.bbox[3]),
    ];
  }
  const pad = 14;
  const vb = [bbox[0] - pad, bbox[1] - pad, bbox[2] - bbox[0] + pad * 2, bbox[3] - bbox[1] + pad * 2];
  return `/**
 * GENERATED by brand/generate.mjs — do not edit by hand.
 * KAIROS symbol geometry (variation F). Each entry in STREAM_PATHS is one
 * independently animatable stream; MOMENT_R is the central dot radius.
 */
export const KAIROS_VIEWBOX = '${vb.map(fmt).join(' ')}';
export const MOMENT_R = ${fmt(p.momentR)};
export const STREAM_PATHS: string[] = [
${paths.map((d) => `  '${d}',`).join('\n')}
];
`;
}

// ---------------------------------------------------------------------------
// Write everything
// ---------------------------------------------------------------------------
function main() {
  mkdirSync(join(DIST, 'variations'), { recursive: true });

  for (const [k, p] of Object.entries(VARIATIONS)) {
    writeFileSync(join(DIST, 'variations', `kairos-symbol-${k}.svg`), symbolSvg(p).svg);
  }

  const F = VARIATIONS.F;
  writeFileSync(join(DIST, 'kairos-symbol.svg'), symbolSvg(F).svg);
  writeFileSync(join(DIST, 'kairos-monochrome.svg'), symbolSvg(F, { color: INK }).svg);
  writeFileSync(join(DIST, 'kairos-reversed.svg'), symbolSvg(F, { color: PAPER }).svg);
  writeFileSync(join(DIST, 'kairos-wordmark.svg'), wordmarkSvg());
  writeFileSync(join(DIST, 'kairos-horizontal.svg'), horizontalSvg(F));
  writeFileSync(join(DIST, 'kairos-vertical.svg'), verticalSvg(F));
  writeFileSync(join(DIST, 'kairos-app-icon.svg'), appIconSvg(F));
  writeFileSync(join(DIST, 'kairos-app-icon-dark.svg'), appIconSvg(F, { bg: '#0B0E14', fg: '#F5F7FA' }));
  writeFileSync(join(DIST, 'kairos-app-icon-light.svg'), appIconSvg(F, { bg: '#F5F7FA', fg: '#101820' }));
  writeFileSync(join(DIST, 'preview.html'), previewHtml());

  // Expo raster sources.
  mkdirSync(join(DIST, 'expo'), { recursive: true });
  writeFileSync(join(DIST, 'expo', 'icon.svg'), expoIconSvg(F));
  writeFileSync(join(DIST, 'expo', 'adaptive-icon.svg'), expoAdaptiveSvg(F));
  writeFileSync(join(DIST, 'expo', 'splash.svg'), expoSplashSvg(F));

  // Data module for the mobile app (react-native-svg).
  const rnOut = join(__dirname, '..', 'apps', 'mobile', 'src', 'design', 'kairos-mark-data.ts');
  writeFileSync(rnOut, rnDataModule(F));

  console.log('KAIROS brand assets written to brand/dist/ (+ mobile data module)');
}

main();
