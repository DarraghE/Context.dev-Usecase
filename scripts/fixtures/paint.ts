/**
 * Deterministic illustration painter for the synthetic demo dataset (§12). Every image is
 * generated from code — no real people, no third-party photos. Faces are cartoon shapes.
 * Each painter returns an SVG and the ground truth (food boxes, face boxes) used as the oracle.
 */
export type Box = [number, number, number, number];
export type Painted = { svg: string; faces: Box[] };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const pick = <T>(r: R, xs: T[]) => xs[Math.floor(r() * xs.length)]!;
const f = (n: number) => n.toFixed(1);

function wrap(w: number, h: number, body: string, seed: number, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed % 997}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer></filter>
<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.35"/></radialGradient>
<linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#dfeff7" stop-opacity="0.25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.5"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="${bg}"/>
${body}
<rect width="${w}" height="${h}" fill="url(#vig)"/>
<rect width="${w}" height="${h}" filter="url(#grain)"/>
</svg>`;
}

/* ------------------------------- primitives ------------------------------- */

const blobs = (r: R, cx: number, cy: number, rx: number, ry: number, n: number, colors: string[], size: [number, number]) => {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    const rad = size[0] + r() * (size[1] - size[0]);
    s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rad)}" ry="${f(rad * (0.7 + r() * 0.4))}" fill="${pick(r, colors)}" opacity="${(0.85 + r() * 0.15).toFixed(2)}"/>`;
  }
  return s;
};
const leaf = (x: number, y: number, s: number, rot: number, c = "#2e7d32") =>
  `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" d="M0 0 C ${f(s * 0.5)} ${f(-s * 0.6)} ${f(s * 1.4)} ${f(-s * 0.4)} ${f(s * 1.8)} 0 C ${f(s * 1.4)} ${f(s * 0.4)} ${f(s * 0.5)} ${f(s * 0.6)} 0 0 Z" fill="${c}"/>`;
const table = (w: number, h: number, c: string, grainC = "#00000014") => {
  let s = `<rect width="${w}" height="${h}" fill="${c}"/>`;
  for (let y = 0; y < h; y += 26) s += `<rect x="0" y="${y}" width="${w}" height="2" fill="${grainC}"/>`;
  return s;
};
const plate = (cx: number, cy: number, rx: number, ry: number, c = "#f7f4ee") =>
  `<ellipse cx="${cx}" cy="${cy + ry * 0.08}" rx="${rx}" ry="${ry}" fill="#00000030"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/><ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.78}" ry="${ry * 0.78}" fill="#00000008" stroke="#00000012"/>`;
const bowl = (cx: number, cy: number, rx: number, ry: number, outer: string, liquid: string) =>
  `<ellipse cx="${cx}" cy="${cy + ry * 0.55}" rx="${rx * 0.95}" ry="${ry * 0.9}" fill="#00000030"/><path d="M ${cx - rx} ${cy} Q ${cx} ${cy + ry * 2.1} ${cx + rx} ${cy} Z" fill="${outer}"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry * 0.55}" fill="${outer}"/><ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.9}" ry="${ry * 0.46}" fill="${liquid}"/>`;

/** Cartoon person; returns svg and the face box in pixels. */
function person(r: R, x: number, y: number, s: number): { svg: string; face: [number, number, number, number] } {
  const skin = pick(r, ["#f1c7a5", "#e0ac83", "#c68642", "#8d5524", "#ffdbac"]);
  const hair = pick(r, ["#2b1b12", "#6b4423", "#d9b26f", "#a0522d", "#111111", "#b5651d"]);
  const shirt = pick(r, ["#3f51b5", "#e91e63", "#009688", "#795548", "#607d8b", "#ff9800", "#f5f5f5"]);
  const svg = `<path d="M ${x - s * 0.9} ${y + s * 2.6} Q ${x} ${y + s * 0.9} ${x + s * 0.9} ${y + s * 2.6} Z" fill="${shirt}"/>
<rect x="${x - s * 0.18}" y="${y + s * 0.6}" width="${s * 0.36}" height="${s * 0.5}" fill="${skin}"/>
<ellipse cx="${x}" cy="${y}" rx="${s * 0.62}" ry="${s * 0.75}" fill="${skin}"/>
<path d="M ${x - s * 0.66} ${y - s * 0.05} Q ${x - s * 0.7} ${y - s * 0.95} ${x} ${y - s * 0.9} Q ${x + s * 0.7} ${y - s * 0.95} ${x + s * 0.66} ${y - s * 0.05} Q ${x + s * 0.4} ${y - s * 0.55} ${x} ${y - s * 0.5} Q ${x - s * 0.4} ${y - s * 0.55} ${x - s * 0.66} ${y - s * 0.05} Z" fill="${hair}"/>
<circle cx="${x - s * 0.22}" cy="${y - s * 0.02}" r="${s * 0.07}" fill="#222"/><circle cx="${x + s * 0.22}" cy="${y - s * 0.02}" r="${s * 0.07}" fill="#222"/>
<path d="M ${x - s * 0.22} ${y + s * 0.3} Q ${x} ${y + s * 0.48} ${x + s * 0.22} ${y + s * 0.3}" stroke="#7a2e2e" stroke-width="${s * 0.06}" fill="none" stroke-linecap="round"/>`;
  return { svg, face: [x - s * 0.66, y - s * 0.95, x + s * 0.66, y + s * 0.75] };
}

const toFrac = (b: [number, number, number, number], w: number, h: number): Box => [
  Math.max(0, b[0] / w),
  Math.max(0, b[1] / h),
  Math.min(1, b[2] / w),
  Math.min(1, b[3] / h),
];

/* ---------------------------------- food ---------------------------------- */

export type FoodKind =
  | "eton_mess" | "salmon_soup" | "pizza_margherita" | "pizza_marinara" | "pizza_portafoglio" | "risotto" | "pea_soup_tray"
  | "cinnamon_bun" | "birthday_cake" | "christmas_table" | "ramen" | "ice_cream" | "croissant" | "latte" | "salad"
  | "pancakes" | "canapes" | "sushi" | "burger" | "blueberry_pie" | "vongole" | "reindeer" | "karelian_pies"
  | "sausages" | "tacos" | "waffles" | "fish_chips" | "smoothie_bowl" | "dumplings" | "cheese_board";

/** Paints a food scene. `food` boxes are returned in fractions for the replay oracle. */
export function paintFood(kind: FoodKind, seed: number, opts: { w?: number; h?: number; faceCorner?: boolean } = {}): Painted & { food: Box[] } {
  const w = opts.w ?? 800;
  const h = opts.h ?? 600;
  const r = rng(seed);
  const woods = ["#8d6e63", "#a1887f", "#6d4c41", "#bcaaa4", "#d7ccc8", "#5d4037"];
  let body = table(w, h, pick(r, woods));
  const faces: Box[] = [];
  const food: Box[] = [];
  const cx = w * (0.45 + r() * 0.1);
  const cy = h * (0.58 + r() * 0.06);
  const pr = Math.min(w, h) * 0.36;
  const add = (b: [number, number, number, number]) => food.push(toFrac(b, w, h));

  switch (kind) {
    case "eton_mess": {
      // A glass bowl of meringue, cream and strawberries.
      const gx = w * 0.46, gy = h * 0.66, gw = w * 0.22, gh = h * 0.26;
      body += `<ellipse cx="${gx}" cy="${gy + gh * 0.95}" rx="${gw * 1.15}" ry="${gh * 0.22}" fill="#00000040"/>`;
      body += `<path d="M ${gx - gw} ${gy - gh * 0.5} L ${gx - gw * 0.8} ${gy + gh * 0.85} Q ${gx} ${gy + gh * 1.05} ${gx + gw * 0.8} ${gy + gh * 0.85} L ${gx + gw} ${gy - gh * 0.5} Z" fill="url(#glass)" stroke="#ffffffaa" stroke-width="3"/>`;
      body += blobs(r, gx, gy + gh * 0.15, gw * 0.8, gh * 0.55, 46, ["#fffdf8", "#fff5e6", "#ffffff"], [10, 26]);
      body += blobs(r, gx, gy + gh * 0.1, gw * 0.75, gh * 0.55, 18, ["#d7263d", "#c1121f", "#e63946"], [9, 16]);
      body += blobs(r, gx, gy - gh * 0.45, gw * 0.85, gh * 0.22, 26, ["#ffffff", "#fff8ef"], [12, 28]);
      body += blobs(r, gx, gy - gh * 0.55, gw * 0.6, gh * 0.18, 9, ["#d7263d", "#e63946"], [10, 15]);
      body += leaf(gx - 10, gy - gh * 0.75, 18, -30, "#43a047") + leaf(gx + 4, gy - gh * 0.75, 16, 200, "#388e3c");
      body += `<rect x="${w * 0.78}" y="${h * 0.62}" width="${w * 0.03}" height="${h * 0.32}" rx="6" fill="#cfd8dc" transform="rotate(12 ${w * 0.79} ${h * 0.7})"/>`;
      add([gx - gw * 1.05, gy - gh * 0.85, gx + gw * 1.05, gy + gh * 1.02]);
      break;
    }
    case "salmon_soup": {
      body += bowl(cx, cy - pr * 0.2, pr * 0.85, pr * 0.7, "#37474f", "#f0b27a");
      body += blobs(r, cx, cy - pr * 0.2, pr * 0.62, pr * 0.24, 14, ["#f8a5a5", "#f48fb1", "#ffccbc"], [10, 18]);
      body += blobs(r, cx, cy - pr * 0.2, pr * 0.6, pr * 0.22, 12, ["#fff3e0", "#ffe0b2"], [7, 12]);
      for (let i = 0; i < 28; i++) body += `<rect x="${f(cx + (r() - 0.5) * pr * 1.2)}" y="${f(cy - pr * 0.2 + (r() - 0.5) * pr * 0.4)}" width="2" height="${f(5 + r() * 6)}" fill="#2e7d32" transform="rotate(${f(r() * 180)})"/>`;
      add([cx - pr * 0.9, cy - pr * 0.62, cx + pr * 0.9, cy + pr * 0.95]);
      // rye bread on a side board
      const bx = w * 0.12, by = h * 0.2;
      body += `<rect x="${bx}" y="${by}" width="${w * 0.2}" height="${h * 0.16}" rx="14" fill="#4e342e"/><rect x="${bx + 8}" y="${by + 8}" width="${w * 0.2 - 16}" height="${h * 0.16 - 16}" rx="10" fill="#5d4037"/>`;
      body += blobs(r, bx + w * 0.1, by + h * 0.08, w * 0.07, h * 0.04, 40, ["#3e2723", "#4e342e"], [2, 4]);
      add([bx, by, bx + w * 0.2, by + h * 0.16]);
      break;
    }
    case "pizza_margherita":
    case "pizza_marinara":
    case "pizza_portafoglio": {
      if (kind === "pizza_portafoglio") {
        // folded street pizza in paper
        body = table(w, h, "#9e9e9e", "#00000010") + `<rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#757575"/>`;
        body += `<path d="M ${cx - pr} ${cy + pr * 0.3} Q ${cx} ${cy - pr * 1.1} ${cx + pr} ${cy + pr * 0.3} Z" fill="#d9a35b"/>`;
        body += `<path d="M ${cx - pr * 0.8} ${cy + pr * 0.25} Q ${cx} ${cy - pr * 0.8} ${cx + pr * 0.8} ${cy + pr * 0.25} Z" fill="#c0392b"/>`;
        body += blobs(r, cx, cy - pr * 0.1, pr * 0.5, pr * 0.25, 10, ["#f5efe0"], [8, 14]);
        body += `<path d="M ${cx - pr * 1.05} ${cy + pr * 0.35} L ${cx + pr * 1.05} ${cy + pr * 0.35} L ${cx + pr * 0.7} ${cy + pr * 1.0} L ${cx - pr * 0.7} ${cy + pr * 1.0} Z" fill="#f5f5f5" stroke="#bdbdbd"/>`;
        add([cx - pr * 1.05, cy - pr * 0.75, cx + pr * 1.05, cy + pr * 1.0]);
        break;
      }
      body += plate(cx, cy, pr * 1.05, pr * 0.8, "#fafafa");
      body += `<ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.95}" ry="${pr * 0.72}" fill="#d39b52"/><ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.95}" ry="${pr * 0.72}" fill="none" stroke="#5d3a1a" stroke-width="5" stroke-dasharray="6 22" opacity="0.6"/>`;
      body += `<ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.8}" ry="${pr * 0.6}" fill="#c0392b"/>`;
      if (kind === "pizza_margherita") {
        body += blobs(r, cx, cy, pr * 0.6, pr * 0.45, 9, ["#f8f4e8", "#fffaf0"], [18, 30]);
        for (let i = 0; i < 5; i++) body += leaf(cx + (r() - 0.5) * pr, cy + (r() - 0.5) * pr * 0.7, 20, r() * 360);
      } else {
        for (let i = 0; i < 16; i++) body += `<ellipse cx="${f(cx + (r() - 0.5) * pr * 1.3)}" cy="${f(cy + (r() - 0.5) * pr * 0.9)}" rx="5" ry="3" fill="#fff8e1"/>`;
        for (let i = 0; i < 40; i++) body += `<circle cx="${f(cx + (r() - 0.5) * pr * 1.4)}" cy="${f(cy + (r() - 0.5) * pr * 1.0)}" r="1.6" fill="#33691e"/>`;
      }
      add([cx - pr * 0.97, cy - pr * 0.74, cx + pr * 0.97, cy + pr * 0.74]);
      break;
    }
    case "risotto": {
      body += plate(cx, cy, pr * 1.0, pr * 0.78, "#eceff1");
      body += blobs(r, cx, cy, pr * 0.6, pr * 0.42, 140, ["#efe1b5", "#f3e7c2", "#e8d6a0"], [3, 6]);
      body += blobs(r, cx, cy, pr * 0.5, pr * 0.35, 14, ["#8d6e63", "#6d4c41", "#a1887f"], [8, 14]);
      for (let i = 0; i < 20; i++) body += `<circle cx="${f(cx + (r() - 0.5) * pr)}" cy="${f(cy + (r() - 0.5) * pr * 0.6)}" r="2.2" fill="#558b2f"/>`;
      body += `<rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.07}" height="${h * 0.3}" rx="4" fill="#f5f5f5" opacity="0.9"/><ellipse cx="${w * 0.115}" cy="${h * 0.1}" rx="${w * 0.012}" ry="${h * 0.03}" fill="#ffca28"/>`;
      add([cx - pr * 0.66, cy - pr * 0.48, cx + pr * 0.66, cy + pr * 0.48]);
      break;
    }
    case "pea_soup_tray": {
      // hospital cafeteria: grey tray, paper cup, bright tiled background
      body = `<rect width="${w}" height="${h * 0.45}" fill="#e3eef3"/>`;
      for (let x = 0; x < w; x += 60) body += `<rect x="${x}" y="0" width="2" height="${h * 0.45}" fill="#c9d6dc"/>`;
      body += `<rect x="${w * 0.1}" y="${h * 0.05}" width="${w * 0.8}" height="${h * 0.05}" fill="#ffffff"/><rect x="0" y="${h * 0.45}" width="${w}" height="${h * 0.55}" fill="#cfd8dc"/>`;
      body += `<rect x="${w * 0.12}" y="${h * 0.5}" width="${w * 0.76}" height="${h * 0.44}" rx="16" fill="#90a4ae"/>`;
      body += bowl(w * 0.4, h * 0.66, pr * 0.62, pr * 0.5, "#ffffff", "#9ccc65");
      body += blobs(r, w * 0.4, h * 0.66, pr * 0.45, pr * 0.16, 24, ["#7cb342", "#aed581"], [3, 6]);
      body += `<rect x="${w * 0.66}" y="${h * 0.56}" width="${w * 0.09}" height="${h * 0.2}" fill="#fafafa"/><rect x="${w * 0.66}" y="${h * 0.6}" width="${w * 0.09}" height="${h * 0.03}" fill="#26a69a"/>`;
      body += `<rect x="${w * 0.2}" y="${h * 0.86}" width="${w * 0.3}" height="${h * 0.02}" rx="4" fill="#eceff1"/>`;
      add([w * 0.4 - pr * 0.66, h * 0.66 - pr * 0.34, w * 0.4 + pr * 0.66, h * 0.66 + pr * 0.62]);
      break;
    }
    case "cinnamon_bun": {
      body += plate(cx, cy, pr * 0.8, pr * 0.62, "#fff8e1");
      let d = "";
      for (let t = 0; t < 22; t += 0.3) d += `${t === 0 ? "M" : "L"} ${f(cx + Math.cos(t) * t * 4.2)} ${f(cy + Math.sin(t) * t * 3.2)} `;
      body += `<ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.48}" ry="${pr * 0.38}" fill="#c68642"/><path d="${d}" stroke="#7b4a12" stroke-width="7" fill="none"/>`;
      body += blobs(r, cx, cy, pr * 0.4, pr * 0.3, 26, ["#fffde7"], [2, 4]);
      add([cx - pr * 0.52, cy - pr * 0.42, cx + pr * 0.52, cy + pr * 0.42]);
      break;
    }
    case "birthday_cake": {
      const x0 = cx - pr * 0.7, x1 = cx + pr * 0.7;
      body += plate(cx, cy + pr * 0.35, pr * 1.0, pr * 0.4);
      body += `<rect x="${x0}" y="${cy - pr * 0.3}" width="${x1 - x0}" height="${pr * 0.65}" fill="#4e342e"/><rect x="${x0}" y="${cy - pr * 0.05}" width="${x1 - x0}" height="${pr * 0.08}" fill="#f8bbd0"/><ellipse cx="${cx}" cy="${cy - pr * 0.3}" rx="${pr * 0.7}" ry="${pr * 0.2}" fill="#5d4037"/>`;
      for (let i = 0; i < 5; i++) {
        const x = x0 + 30 + i * ((x1 - x0 - 60) / 4);
        body += `<rect x="${x - 4}" y="${cy - pr * 0.62}" width="8" height="${pr * 0.3}" fill="${pick(r, ["#42a5f5", "#ef5350", "#ffee58", "#66bb6a"])}"/><ellipse cx="${x}" cy="${cy - pr * 0.68}" rx="5" ry="9" fill="#ffb300"/>`;
      }
      add([x0 - 6, cy - pr * 0.75, x1 + 6, cy + pr * 0.4]);
      break;
    }
    case "christmas_table": {
      body = table(w, h, "#b71c1c", "#00000020");
      body += plate(w * 0.35, h * 0.55, pr * 0.8, pr * 0.6);
      body += `<ellipse cx="${w * 0.35}" cy="${h * 0.55}" rx="${pr * 0.55}" ry="${pr * 0.4}" fill="#e57373"/><ellipse cx="${w * 0.35}" cy="${h * 0.52}" rx="${pr * 0.45}" ry="${pr * 0.3}" fill="#ef9a9a"/>`;
      for (let i = 0; i < 12; i++) body += `<circle cx="${f(w * 0.35 + (r() - 0.5) * pr * 0.7)}" cy="${f(h * 0.52 + (r() - 0.5) * pr * 0.5)}" r="3" fill="#3e2723"/>`;
      body += bowl(w * 0.75, h * 0.42, pr * 0.42, pr * 0.32, "#eeeeee", "#ad1457");
      body += blobs(r, w * 0.75, h * 0.42, pr * 0.3, pr * 0.1, 18, ["#880e4f", "#f8bbd0", "#ff8a65"], [3, 6]);
      add([w * 0.35 - pr * 0.6, h * 0.55 - pr * 0.45, w * 0.35 + pr * 0.6, h * 0.55 + pr * 0.45]);
      add([w * 0.75 - pr * 0.44, h * 0.42 - pr * 0.2, w * 0.75 + pr * 0.44, h * 0.42 + pr * 0.66]);
      break;
    }
    case "ramen": {
      body += bowl(cx, cy - pr * 0.15, pr * 0.9, pr * 0.72, "#212121", "#d7a86e");
      for (let i = 0; i < 18; i++) body += `<path d="M ${f(cx - pr * 0.6 + i * 6)} ${f(cy - pr * 0.25)} q 20 ${f(-10 + r() * 20)} 40 0 t 40 0" stroke="#fdd835" stroke-width="3" fill="none"/>`;
      body += `<ellipse cx="${cx + pr * 0.3}" cy="${cy - pr * 0.25}" rx="${pr * 0.16}" ry="${pr * 0.11}" fill="#fff8e1"/><ellipse cx="${cx + pr * 0.3}" cy="${cy - pr * 0.25}" rx="${pr * 0.08}" ry="${pr * 0.06}" fill="#ff9800"/>`;
      body += blobs(r, cx - pr * 0.3, cy - pr * 0.2, pr * 0.2, pr * 0.08, 20, ["#7cb342"], [3, 5]);
      add([cx - pr * 0.95, cy - pr * 0.6, cx + pr * 0.95, cy + pr * 1.0]);
      break;
    }
    case "ice_cream": {
      body = `<rect width="${w}" height="${h}" fill="#81d4fa"/><rect y="${h * 0.65}" width="${w}" height="${h * 0.35}" fill="#a5d6a7"/>`;
      body += `<path d="M ${cx - 40} ${cy - 20} L ${cx + 40} ${cy - 20} L ${cx} ${cy + 140} Z" fill="#d7a35b"/>`;
      body += `<circle cx="${cx}" cy="${cy - 50}" r="52" fill="#fff8e1"/><circle cx="${cx - 18}" cy="${cy - 110}" r="40" fill="#f8bbd0"/>`;
      add([cx - 70, cy - 155, cx + 60, cy + 140]);
      break;
    }
    case "croissant": {
      body += plate(cx, cy, pr * 0.9, pr * 0.68);
      body += `<path d="M ${cx - pr * 0.7} ${cy + pr * 0.1} Q ${cx} ${cy - pr * 0.8} ${cx + pr * 0.7} ${cy + pr * 0.1} Q ${cx} ${cy - pr * 0.25} ${cx - pr * 0.7} ${cy + pr * 0.1} Z" fill="#e0a040"/>`;
      for (let i = -3; i <= 3; i++) body += `<path d="M ${f(cx + i * pr * 0.17)} ${f(cy - pr * 0.45 + Math.abs(i) * 18)} l 6 30" stroke="#a0662a" stroke-width="3"/>`;
      body += `<ellipse cx="${w * 0.82}" cy="${h * 0.3}" rx="${pr * 0.3}" ry="${pr * 0.22}" fill="#ffffff"/><ellipse cx="${w * 0.82}" cy="${h * 0.3}" rx="${pr * 0.22}" ry="${pr * 0.15}" fill="#5d4037"/>`;
      add([cx - pr * 0.72, cy - pr * 0.5, cx + pr * 0.72, cy + pr * 0.15]);
      add([w * 0.82 - pr * 0.3, h * 0.3 - pr * 0.22, w * 0.82 + pr * 0.3, h * 0.3 + pr * 0.22]);
      break;
    }
    case "latte": {
      body += `<ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.75}" ry="${pr * 0.58}" fill="#fafafa"/><ellipse cx="${cx}" cy="${cy}" rx="${pr * 0.55}" ry="${pr * 0.42}" fill="#8d5524"/>`;
      body += `<path d="M ${cx} ${cy + 30} C ${cx - 70} ${cy - 20} ${cx - 30} ${cy - 70} ${cx} ${cy - 30} C ${cx + 30} ${cy - 70} ${cx + 70} ${cy - 20} ${cx} ${cy + 30} Z" fill="#fff3e0"/>`;
      add([cx - pr * 0.6, cy - pr * 0.46, cx + pr * 0.6, cy + pr * 0.46]);
      break;
    }
    case "salad": {
      body += bowl(cx, cy - pr * 0.15, pr * 0.95, pr * 0.75, "#fafafa", "#c5e1a5");
      for (let i = 0; i < 26; i++) body += leaf(cx + (r() - 0.5) * pr * 1.4, cy - pr * 0.15 + (r() - 0.5) * pr * 0.5, 22 + r() * 10, r() * 360, pick(r, ["#558b2f", "#7cb342", "#33691e"]));
      body += blobs(r, cx, cy - pr * 0.15, pr * 0.6, pr * 0.22, 10, ["#e53935"], [9, 13]) + blobs(r, cx, cy - pr * 0.15, pr * 0.6, pr * 0.22, 10, ["#fafafa"], [7, 10]);
      add([cx - pr, cy - pr * 0.6, cx + pr, cy + pr]);
      break;
    }
    case "pancakes": {
      body += plate(cx, cy + pr * 0.2, pr * 0.95, pr * 0.65);
      for (let i = 0; i < 5; i++) body += `<ellipse cx="${cx}" cy="${cy + pr * 0.15 - i * 16}" rx="${pr * 0.62}" ry="${pr * 0.22}" fill="${i % 2 ? "#e0a050" : "#d8963f"}"/>`;
      body += blobs(r, cx, cy - pr * 0.18, pr * 0.4, pr * 0.1, 12, ["#3949ab", "#c62828"], [7, 10]);
      add([cx - pr * 0.65, cy - pr * 0.4, cx + pr * 0.65, cy + pr * 0.4]);
      break;
    }
    case "canapes": {
      // engagement party: board of canapés + flutes, two guests in the background
      body = `<rect width="${w}" height="${h * 0.5}" fill="#efe6dd"/>` + table(w, h * 0.5, "#efe6dd", "#00000000") + `<rect y="${h * 0.5}" width="${w}" height="${h * 0.5}" fill="#8d6e63"/>`;
      const p1 = person(r, w * 0.25, h * 0.2, 60);
      const p2 = person(r, w * 0.72, h * 0.22, 56);
      body += p1.svg + p2.svg;
      faces.push(toFrac(p1.face, w, h), toFrac(p2.face, w, h));
      body += `<rect x="${w * 0.18}" y="${h * 0.62}" width="${w * 0.55}" height="${h * 0.24}" rx="10" fill="#d7ccc8"/>`;
      for (let i = 0; i < 8; i++) {
        const x = w * 0.22 + (i % 4) * w * 0.13;
        const y = h * 0.68 + Math.floor(i / 4) * h * 0.1;
        body += `<rect x="${x}" y="${y}" width="${w * 0.08}" height="${h * 0.05}" rx="4" fill="#ffe0b2"/><circle cx="${x + w * 0.04}" cy="${y}" r="9" fill="${pick(r, ["#ef6c00", "#2e7d32", "#ad1457", "#fbc02d"])}"/>`;
      }
      body += `<path d="M ${w * 0.82} ${h * 0.6} l -14 -90 l 28 0 Z" fill="#fff59d" opacity="0.8"/><rect x="${w * 0.818}" y="${h * 0.6}" width="4" height="${h * 0.2}" fill="#eeeeee"/>`;
      add([w * 0.18, h * 0.6, w * 0.73, h * 0.86]);
      add([w * 0.8, h * 0.44, w * 0.85, h * 0.8]);
      break;
    }
    case "sushi": {
      body = table(w, h, "#263238", "#ffffff08");
      body += `<rect x="${w * 0.15}" y="${h * 0.45}" width="${w * 0.7}" height="${h * 0.3}" rx="12" fill="#efebe9"/>`;
      for (let i = 0; i < 6; i++) {
        const x = w * 0.22 + i * w * 0.11;
        body += `<circle cx="${x}" cy="${h * 0.6}" r="30" fill="#1b1b1b"/><circle cx="${x}" cy="${h * 0.6}" r="23" fill="#fafafa"/><circle cx="${x}" cy="${h * 0.6}" r="10" fill="${i % 2 ? "#ff7043" : "#66bb6a"}"/>`;
      }
      add([w * 0.15, h * 0.45, w * 0.85, h * 0.75]);
      break;
    }
    case "burger": {
      body += plate(cx, cy + pr * 0.3, pr * 0.95, pr * 0.5);
      body += `<ellipse cx="${cx}" cy="${cy + pr * 0.2}" rx="${pr * 0.55}" ry="${pr * 0.12}" fill="#d39b52"/><rect x="${cx - pr * 0.56}" y="${cy}" width="${pr * 1.12}" height="${pr * 0.16}" rx="10" fill="#5d4037"/><path d="M ${cx - pr * 0.6} ${cy - 2} q 20 -12 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke="#7cb342" stroke-width="10" fill="none"/><rect x="${cx - pr * 0.55}" y="${cy - 20}" width="${pr * 1.1}" height="12" fill="#ffca28"/><path d="M ${cx - pr * 0.55} ${cy - 22} Q ${cx} ${cy - pr * 0.75} ${cx + pr * 0.55} ${cy - 22} Z" fill="#e0a050"/>`;
      body += blobs(r, cx, cy - pr * 0.4, pr * 0.3, pr * 0.1, 14, ["#fff8e1"], [2, 3]);
      add([cx - pr * 0.62, cy - pr * 0.6, cx + pr * 0.62, cy + pr * 0.35]);
      break;
    }
    case "blueberry_pie": {
      body += plate(cx, cy, pr * 0.95, pr * 0.72);
      body += `<path d="M ${cx - pr * 0.6} ${cy + pr * 0.2} L ${cx + pr * 0.6} ${cy + pr * 0.2} L ${cx} ${cy - pr * 0.5} Z" fill="#e0b060"/><path d="M ${cx - pr * 0.45} ${cy + pr * 0.12} L ${cx + pr * 0.45} ${cy + pr * 0.12} L ${cx} ${cy - pr * 0.35} Z" fill="#283593"/>`;
      body += blobs(r, cx, cy - pr * 0.02, pr * 0.25, pr * 0.15, 20, ["#1a237e", "#3949ab"], [4, 7]);
      body += `<circle cx="${cx + pr * 0.45}" cy="${cy - pr * 0.1}" r="${pr * 0.16}" fill="#fffde7"/>`;
      add([cx - pr * 0.62, cy - pr * 0.52, cx + pr * 0.62, cy + pr * 0.22]);
      break;
    }
    case "vongole": {
      body += plate(cx, cy, pr * 1.0, pr * 0.76);
      for (let i = 0; i < 40; i++) body += `<path d="M ${f(cx - pr * 0.5 + r() * pr)} ${f(cy - pr * 0.35 + r() * pr * 0.7)} q ${f(-30 + r() * 60)} ${f(-20 + r() * 40)} ${f(-40 + r() * 80)} 0" stroke="#f3d68b" stroke-width="4" fill="none"/>`;
      body += blobs(r, cx, cy, pr * 0.5, pr * 0.35, 12, ["#cfd8dc", "#b0bec5"], [10, 14]);
      add([cx - pr * 0.62, cy - pr * 0.45, cx + pr * 0.62, cy + pr * 0.45]);
      break;
    }
    case "reindeer": {
      body += plate(cx, cy, pr * 1.0, pr * 0.76);
      body += blobs(r, cx - pr * 0.25, cy, pr * 0.3, pr * 0.25, 40, ["#5d4037", "#6d4c41"], [5, 9]);
      body += `<ellipse cx="${cx + pr * 0.3}" cy="${cy}" rx="${pr * 0.3}" ry="${pr * 0.22}" fill="#fff8e1"/>`;
      body += blobs(r, cx + pr * 0.1, cy - pr * 0.25, pr * 0.15, pr * 0.07, 14, ["#c62828", "#d32f2f"], [4, 6]);
      add([cx - pr * 0.6, cy - pr * 0.38, cx + pr * 0.62, cy + pr * 0.3]);
      break;
    }
    case "karelian_pies": {
      body += plate(cx, cy, pr * 1.0, pr * 0.72);
      for (let i = 0; i < 4; i++) {
        const x = cx - pr * 0.45 + (i % 2) * pr * 0.55;
        const y = cy - pr * 0.2 + Math.floor(i / 2) * pr * 0.35;
        body += `<ellipse cx="${x + pr * 0.2}" cy="${y}" rx="${pr * 0.26}" ry="${pr * 0.13}" fill="#a1887f"/><ellipse cx="${x + pr * 0.2}" cy="${y}" rx="${pr * 0.18}" ry="${pr * 0.08}" fill="#fff3e0"/><ellipse cx="${x + pr * 0.2}" cy="${y - 2}" rx="${pr * 0.1}" ry="${pr * 0.04}" fill="#ffe082"/>`;
      }
      add([cx - pr * 0.55, cy - pr * 0.38, cx + pr * 0.55, cy + pr * 0.32]);
      break;
    }
    case "sausages": {
      body = `<rect width="${w}" height="${h}" fill="#2e7d32"/>` + `<circle cx="${cx}" cy="${cy}" r="${pr * 0.95}" fill="#212121"/>`;
      for (let i = -4; i <= 4; i++) body += `<rect x="${cx - pr * 0.85}" y="${cy + i * 18}" width="${pr * 1.7}" height="4" fill="#616161"/>`;
      for (let i = 0; i < 4; i++) body += `<rect x="${cx - pr * 0.6}" y="${cy - pr * 0.4 + i * pr * 0.26}" width="${pr * 1.2}" height="${pr * 0.16}" rx="${pr * 0.08}" fill="#a1513b"/>`;
      add([cx - pr * 0.65, cy - pr * 0.45, cx + pr * 0.65, cy + pr * 0.45]);
      break;
    }
    case "tacos": {
      body += plate(cx, cy, pr * 1.0, pr * 0.7);
      for (let i = 0; i < 3; i++) {
        const x = cx - pr * 0.5 + i * pr * 0.5;
        body += `<path d="M ${x - 50} ${cy + 30} Q ${x} ${cy - 90} ${x + 50} ${cy + 30} Z" fill="#fbc02d"/>`;
        body += blobs(r, x, cy - 10, 30, 14, 10, ["#7cb342", "#e53935", "#6d4c41"], [4, 7]);
      }
      add([cx - pr * 0.75, cy - pr * 0.4, cx + pr * 0.75, cy + pr * 0.16]);
      break;
    }
    case "waffles": {
      body += plate(cx, cy, pr * 0.95, pr * 0.7);
      body += `<rect x="${cx - pr * 0.5}" y="${cy - pr * 0.35}" width="${pr}" height="${pr * 0.7}" rx="16" fill="#e0a050"/>`;
      for (let i = 1; i < 5; i++) body += `<rect x="${cx - pr * 0.5 + i * pr * 0.2}" y="${cy - pr * 0.35}" width="5" height="${pr * 0.7}" fill="#b0702a"/><rect x="${cx - pr * 0.5}" y="${cy - pr * 0.35 + i * pr * 0.14}" width="${pr}" height="5" fill="#b0702a"/>`;
      body += blobs(r, cx, cy - pr * 0.1, pr * 0.2, pr * 0.1, 6, ["#ffffff"], [14, 20]);
      add([cx - pr * 0.52, cy - pr * 0.37, cx + pr * 0.52, cy + pr * 0.37]);
      break;
    }
    case "fish_chips": {
      body = `<rect width="${w}" height="${h * 0.4}" fill="#90caf9"/><rect y="${h * 0.4}" width="${w}" height="${h * 0.6}" fill="#bcaaa4"/>`;
      body += `<rect x="${w * 0.2}" y="${h * 0.5}" width="${w * 0.6}" height="${h * 0.38}" rx="8" fill="#fafafa"/>`;
      body += `<ellipse cx="${w * 0.42}" cy="${h * 0.66}" rx="${w * 0.16}" ry="${h * 0.07}" fill="#e0a040"/>`;
      for (let i = 0; i < 14; i++) body += `<rect x="${f(w * 0.56 + r() * w * 0.16)}" y="${f(h * 0.56 + r() * h * 0.22)}" width="10" height="${f(40 + r() * 30)}" fill="#ffd54f" transform="rotate(${f(-30 + r() * 60)} ${f(w * 0.64)} ${f(h * 0.66)})"/>`;
      add([w * 0.24, h * 0.52, w * 0.78, h * 0.86]);
      break;
    }
    case "smoothie_bowl": {
      body += bowl(cx, cy - pr * 0.15, pr * 0.9, pr * 0.7, "#ffffff", "#7b1fa2");
      body += blobs(r, cx, cy - pr * 0.15, pr * 0.55, pr * 0.2, 16, ["#ffeb3b", "#e91e63", "#ffffff", "#4caf50"], [6, 11]);
      add([cx - pr * 0.95, cy - pr * 0.55, cx + pr * 0.95, cy + pr * 0.95]);
      break;
    }
    case "dumplings": {
      body += `<circle cx="${cx}" cy="${cy}" r="${pr * 0.9}" fill="#c8a165"/><circle cx="${cx}" cy="${cy}" r="${pr * 0.82}" fill="#e6cf9f"/>`;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = cx + Math.cos(a) * pr * 0.45;
        const y = cy + Math.sin(a) * pr * 0.45;
        body += `<path d="M ${x - 32} ${y + 12} Q ${x} ${y - 38} ${x + 32} ${y + 12} Z" fill="#fafafa" stroke="#e0e0e0"/>`;
      }
      add([cx - pr * 0.85, cy - pr * 0.85, cx + pr * 0.85, cy + pr * 0.85]);
      break;
    }
    case "cheese_board": {
      body += `<rect x="${w * 0.15}" y="${h * 0.45}" width="${w * 0.55}" height="${h * 0.38}" rx="18" fill="#a1887f"/>`;
      body += `<path d="M ${w * 0.22} ${h * 0.75} l 90 0 l -45 -70 Z" fill="#ffe082"/><path d="M ${w * 0.4} ${h * 0.75} l 90 0 l -20 -80 Z" fill="#fff8e1"/><circle cx="${w * 0.6}" cy="${h * 0.6}" r="30" fill="#fbc02d"/>`;
      body += blobs(r, w * 0.5, h * 0.55, 40, 16, 10, ["#6a1b9a", "#4a148c"], [7, 10]);
      body += `<path d="M ${w * 0.8} ${h * 0.35} q -40 0 -40 50 q 0 40 40 40 q 40 0 40 -40 q 0 -50 -40 -50 Z" fill="#880e4f" opacity="0.85"/><rect x="${w * 0.797}" y="${h * 0.48}" width="5" height="${h * 0.25}" fill="#eeeeee"/>`;
      add([w * 0.15, h * 0.45, w * 0.7, h * 0.83]);
      add([w * 0.73, h * 0.34, w * 0.88, h * 0.74]);
      break;
    }
  }

  if (opts.faceCorner) {
    // A guest leaning into the frame next to the dish (used to prove face blurring, P6).
    const p = person(r, w * 0.71, h * 0.4, 75);
    body += p.svg;
    faces.push(toFrac(p.face, w, h));
  }
  return { svg: wrap(w, h, body, seed, "#ffffff"), faces, food };
}

/* -------------------------------- non-food -------------------------------- */

export type SceneKind = "landscape" | "lake" | "city" | "object" | "people" | "advert" | "screen" | "menu_board" | "snow";

export function paintScene(kind: SceneKind, seed: number, opts: { w?: number; h?: number; people?: number } = {}): Painted {
  const w = opts.w ?? 800;
  const h = opts.h ?? 600;
  const r = rng(seed);
  const faces: Box[] = [];
  const skies = [["#8ec5fc", "#e0c3fc"], ["#f6d365", "#fda085"], ["#a1c4fd", "#c2e9fb"], ["#ff9a9e", "#fecfef"], ["#2c3e50", "#4ca1af"], ["#fbc2eb", "#a6c1ee"]];
  const [s1, s2] = pick(r, skies);
  let body = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sky)"/>`;

  const hills = (n: number, base: number, colors: string[]) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      let d = `M 0 ${h} L 0 ${f(base + i * 40)}`;
      for (let x = 0; x <= w; x += 80) d += ` L ${x} ${f(base + i * 40 - r() * 120)}`;
      d += ` L ${w} ${h} Z`;
      s += `<path d="${d}" fill="${colors[i % colors.length]}"/>`;
    }
    return s;
  };

  switch (kind) {
    case "landscape":
      body += `<circle cx="${f(w * (0.2 + r() * 0.6))}" cy="${f(h * 0.25)}" r="${f(30 + r() * 30)}" fill="#fff3b0" opacity="0.9"/>`;
      body += hills(3, h * 0.5, ["#7986cb", "#5c6bc0", "#3949ab"].map((c) => (r() > 0.5 ? c : "#4caf50")));
      break;
    case "lake":
      body += hills(2, h * 0.45, ["#2e7d32", "#1b5e20"]) + `<rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="#4f83cc" opacity="0.9"/>`;
      for (let i = 0; i < 12; i++) body += `<rect x="${f(r() * w)}" y="${f(h * 0.62 + r() * h * 0.35)}" width="${f(40 + r() * 80)}" height="2" fill="#ffffff" opacity="0.5"/>`;
      break;
    case "snow":
      body += hills(2, h * 0.5, ["#eceff1", "#cfd8dc"]);
      for (let i = 0; i < 6; i++) body += `<path d="M ${f(w * r())} ${f(h * 0.75)} l 30 -90 l 30 90 Z" fill="#1b5e20"/>`;
      body += blobs(r, w / 2, h / 2, w / 2, h / 2, 80, ["#ffffff"], [1.5, 3]);
      break;
    case "city":
      for (let x = 0; x < w; x += 50 + r() * 40) {
        const bh = h * (0.25 + r() * 0.5);
        body += `<rect x="${f(x)}" y="${f(h - bh)}" width="${f(46 + r() * 30)}" height="${f(bh)}" fill="${pick(r, ["#455a64", "#546e7a", "#37474f", "#78909c"])}"/>`;
        for (let y = h - bh + 10; y < h - 20; y += 22) for (let wx = x + 6; wx < x + 40; wx += 14) if (r() > 0.4) body += `<rect x="${f(wx)}" y="${f(y)}" width="8" height="10" fill="#ffe082" opacity="0.8"/>`;
      }
      break;
    case "object": {
      body = table(w, h, pick(r, ["#eceff1", "#d7ccc8", "#cfd8dc", "#ffe0b2"]));
      const o = Math.floor(r() * 4);
      if (o === 0) for (let i = 0; i < 4; i++) body += `<rect x="${w * 0.3}" y="${h * 0.7 - i * 40}" width="${w * 0.4 - i * 10}" height="36" rx="4" fill="${pick(r, ["#c62828", "#283593", "#2e7d32", "#f9a825", "#6a1b9a"])}"/>`;
      if (o === 1) body += `<circle cx="${w * 0.33}" cy="${h * 0.65}" r="80" fill="none" stroke="#212121" stroke-width="10"/><circle cx="${w * 0.67}" cy="${h * 0.65}" r="80" fill="none" stroke="#212121" stroke-width="10"/><path d="M ${w * 0.33} ${h * 0.65} L ${w * 0.5} ${h * 0.45} L ${w * 0.67} ${h * 0.65} M ${w * 0.5} ${h * 0.45} L ${w * 0.45} ${h * 0.35}" stroke="#c62828" stroke-width="10" fill="none"/>`;
      if (o === 2) body += `<rect x="${w * 0.42}" y="${h * 0.55}" width="${w * 0.16}" height="${h * 0.3}" fill="#8d6e63"/>` + Array.from({ length: 9 }, () => leaf(w * 0.5, h * 0.55, 60, -170 + r() * 160, "#388e3c")).join("");
      if (o === 3) body += `<rect x="${w * 0.25}" y="${h * 0.35}" width="${w * 0.5}" height="${h * 0.32}" rx="12" fill="#263238"/><rect x="${w * 0.27}" y="${h * 0.37}" width="${w * 0.46}" height="${h * 0.28}" fill="#90a4ae"/><rect x="${w * 0.2}" y="${h * 0.67}" width="${w * 0.6}" height="16" rx="6" fill="#37474f"/>`;
      break;
    }
    case "people": {
      body += hills(1, h * 0.75, ["#66bb6a"]);
      const n = opts.people ?? 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const s = 70 + r() * 20;
        const x = (w / (n + 1)) * (i + 1);
        const y = h * 0.42 + (r() - 0.5) * 30;
        const p = person(r, x, y, s);
        body += p.svg;
        faces.push(toFrac(p.face, w, h));
      }
      break;
    }
    case "advert":
      // A billboard advertising a burger: food on a poster must NOT count as food.
      body = `<rect width="${w}" height="${h}" fill="#90a4ae"/><rect x="${w * 0.1}" y="${h * 0.12}" width="${w * 0.8}" height="${h * 0.6}" fill="#ffca28" stroke="#424242" stroke-width="12"/>`;
      body += `<text x="${w * 0.16}" y="${h * 0.3}" font-family="Arial" font-weight="bold" font-size="54" fill="#b71c1c">BIG BITE</text><text x="${w * 0.16}" y="${h * 0.4}" font-family="Arial" font-size="28" fill="#424242">NOW 2 FOR 1</text>`;
      body += `<ellipse cx="${w * 0.68}" cy="${h * 0.52}" rx="90" ry="20" fill="#d39b52"/><rect x="${w * 0.68 - 92}" y="${h * 0.44}" width="184" height="26" rx="10" fill="#5d4037"/><path d="M ${w * 0.68 - 92} ${h * 0.44} Q ${w * 0.68} ${h * 0.3} ${w * 0.68 + 92} ${h * 0.44} Z" fill="#e0a050"/>`;
      body += `<rect x="${w * 0.47}" y="${h * 0.72}" width="20" height="${h * 0.28}" fill="#424242"/>`;
      break;
    case "screen":
      // A TV showing a cooking show: food on a screen must NOT count as food.
      body = table(w, h, "#5d4037") + `<rect x="${w * 0.15}" y="${h * 0.12}" width="${w * 0.7}" height="${h * 0.5}" rx="10" fill="#111"/><rect x="${w * 0.17}" y="${h * 0.15}" width="${w * 0.66}" height="${h * 0.44}" fill="#1565c0"/>`;
      body += `<ellipse cx="${w * 0.5}" cy="${h * 0.4}" rx="80" ry="55" fill="#d39b52"/><ellipse cx="${w * 0.5}" cy="${h * 0.4}" rx="66" ry="44" fill="#c0392b"/>`;
      body += `<rect x="${w * 0.45}" y="${h * 0.62}" width="${w * 0.1}" height="${h * 0.08}" fill="#212121"/>`;
      break;
    case "menu_board":
      body = `<rect width="${w}" height="${h}" fill="#3e2723"/><rect x="${w * 0.15}" y="${h * 0.1}" width="${w * 0.7}" height="${h * 0.8}" fill="#263238" stroke="#8d6e63" stroke-width="14"/>`;
      for (let i = 0; i < 9; i++) body += `<rect x="${w * 0.22}" y="${h * 0.2 + i * 45}" width="${f(w * (0.3 + r() * 0.25))}" height="10" rx="5" fill="#eceff1" opacity="0.85"/><rect x="${w * 0.7}" y="${h * 0.2 + i * 45}" width="40" height="10" rx="5" fill="#ffcc80"/>`;
      break;
  }
  if (kind !== "advert" && kind !== "screen" && kind !== "menu_board") {
    // Scene clutter and framing so no two generated photos are accidental near-duplicates.
    const dx = (r() - 0.5) * w * 0.3;
    const dy = (r() - 0.5) * h * 0.2;
    const sc = 0.8 + r() * 0.5;
    body = `<g transform="translate(${f(dx)} ${f(dy)}) scale(${sc.toFixed(2)})">${body}</g>`;
    for (let i = 0; i < 5 + Math.floor(r() * 4); i++) {
      const c = pick(r, ["#ef9a9a", "#90caf9", "#a5d6a7", "#fff59d", "#ce93d8", "#ffcc80", "#80cbc4", "#bcaaa4", "#37474f", "#fafafa"]);
      body += r() > 0.5
        ? `<ellipse cx="${f(r() * w)}" cy="${f(r() * h)}" rx="${f(20 + r() * 90)}" ry="${f(15 + r() * 60)}" fill="${c}" opacity="${(0.45 + r() * 0.45).toFixed(2)}"/>`
        : `<rect x="${f(r() * w)}" y="${f(r() * h)}" width="${f(30 + r() * 160)}" height="${f(20 + r() * 120)}" rx="${f(r() * 20)}" fill="${c}" opacity="${(0.45 + r() * 0.45).toFixed(2)}"/>`;
    }
  }
  return { svg: wrap(w, h, body, seed, "#ffffff"), faces };
}

/** Wraps a painted image with a "couple" (two faces) for the proposal photo. */
export function paintCouple(seed: number): Painted {
  const w = 800;
  const h = 600;
  const r = rng(seed);
  let body = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ffcc80"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  body += `<path d="M 0 ${h} L 0 ${h * 0.6} L ${w * 0.3} ${h * 0.45} L ${w * 0.55} ${h * 0.55} L ${w} ${h * 0.4} L ${w} ${h} Z" fill="#6d4c41"/>`;
  const a = person(r, w * 0.4, h * 0.42, 85);
  const b = person(r, w * 0.6, h * 0.4, 90);
  body += a.svg + b.svg + `<circle cx="${w * 0.5}" cy="${h * 0.72}" r="10" fill="none" stroke="#ffd700" stroke-width="5"/><circle cx="${w * 0.5}" cy="${h * 0.705}" r="5" fill="#e3f2fd"/>`;
  return { svg: wrap(w, h, body, seed, "#ffffff"), faces: [toFrac(a.face, w, h), toFrac(b.face, w, h)] };
}
