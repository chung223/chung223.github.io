// 首頁的立體天際線（canvas）和 GitHub 個人頁 README 的圖（SVG）共用這一份：
// 統計、版面、每一格的圖形，以及 SVG 輸出。瀏覽器與 Node 都會載入。
//
// 有 commit 的日子是一棟樓，樓高是當天的 commit 數；沒動工的日子是綠地。

const DAY = 86400000;
export const dayMs = (d) => Date.parse(d + 'T00:00:00Z');
export const addDays = (d, n) => new Date(dayMs(d) + n * DAY).toISOString().slice(0, 10);
export const wdOf = (d) => new Date(dayMs(d)).getUTCDay();

// 每個專案用同一把尺，專案之間才能互相比較
export const fixedLevel = (n) => (n >= 10 ? 4 : n >= 6 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);
export function quantileLevel(values) {
  const v = values.filter(Boolean).sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))] ?? 1;
  const [a, b, c] = [q(0.25), q(0.5), q(0.75)];
  return (n) => (!n ? 0 : n <= a ? 1 : n <= b ? 2 : n <= c ? 3 : 4);
}

export function summarize(data, today) {
  const total = {};
  for (const src of [...data.projects, data.other]) {
    for (const [d, n] of Object.entries(src?.days || {})) total[d] = (total[d] || 0) + n;
  }
  const year = data.projects.reduce((s, p) => s + p.year, 0) + (data.other?.year || 0);
  const activeDays = Object.keys(total).filter((d) => d >= addDays(today, -364)).length;
  let streak = 0;
  for (let d = total[today] ? today : addDays(today, -1); total[d]; d = addDays(d, -1)) streak++;
  return { total, year, activeDays, streak, level: quantileLevel(Object.values(total)) };
}

// h[1..4] 是樓的顏色（跟平面熱力圖同一個色階）；深色模式的樓壓暗一階，窗戶的燈才亮得起來
export const PALETTES = {
  light: {
    h: [null, '#c3d0e6', '#8ba3cf', '#4d6fb0', '#1e3d7e'], front: 0.14, side: 0.32,
    win: 'rgba(255,255,255,.62)', winPct: 62, glow: false, night: false,
    sun: '#f5b83d', ray: '#f0a72b', halo: 'rgba(245,184,61,.2)', cloud: '#dde6f1',
    dirt: '#dcc9a2', pants: '#2f3b52', road: 'rgba(28,26,23,.24)', dash: 'rgba(255,255,255,.75)',
    grass: ['#a9cf93', '#9bc486'], canopy: '#4e8d4b', canopyHi: '#7ab36c', trunk: '#7a5a3a', water: '#9cc9e8',
    ground: 'rgba(28,26,23,.11)', cell0: 'rgba(28,26,23,.08)', rule: 'rgba(28,26,23,.16)',
    seal: '#c23a22', ink: '#1c1a17', muted: '#736b5e',
  },
  dark: {
    h: [null, '#1f2d4d', '#2c447a', '#4166b3', '#6b93e6'], front: 0.2, side: 0.45,
    win: 'rgba(255,216,138,.92)', winPct: 46, glow: true, night: true,
    moon: '#f4e9c1', halo: 'rgba(244,233,193,.1)', star: '#ffffff',
    dirt: '#40382a', pants: '#a9b8d6', road: 'rgba(235,229,214,.11)', dash: 'rgba(235,229,214,.4)',
    grass: ['#22402a', '#1d3724'], canopy: '#3c7a45', canopyHi: '#5eaa63', trunk: '#5b4630', water: '#2b5a80',
    ground: 'rgba(235,229,214,.06)', cell0: 'rgba(235,229,214,.09)', rule: 'rgba(235,229,214,.17)',
    seal: '#f0674c', ink: '#ebe5d6', muted: '#9a917f',
  },
};

// 工地的顏色白天晚上都一樣：反光背心、安全帽、圍欄
const CREW = { vest: '#f2762e', stripe: '#ffe27a', hat: '#ffd21f', brim: '#d9a900', skin: '#f1c9a5', wood: '#8a6a45', steel: '#9aa3ad', cone: '#f08c2a', white: '#ffffff' };

const shade = (hex, a) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pick = (seed, i) => ((Math.imul(seed + i * 374761393, 668265263) >>> 13) ^ seed) >>> 0;

// 斜投影：週由左到右，一週七天由後（週日）排到前（週六），每往前一排往左下移一點
export function layout({ total, level, today, W, weeks }) {
  const small = W < 640;
  weeks ??= small ? 26 : 53;
  const sx = small ? 4.5 : 7, sy = small ? 7.5 : 11;
  const maxH = small ? 104 : 160;
  const pad = 4;
  const pitch = (W - 2 * pad - 7 * sx) / weeks, bw = pitch * 0.78;
  const ox = sx * 0.8, oy = sy * 0.8;
  // 樓頂上方留一段天空，放太陽／月亮
  const top = maxH + (small ? 50 : 66);
  const start = addDays(today, -wdOf(today) - (weeks - 1) * 7);
  let peak = 1;
  for (let i = 0; i < weeks * 7; i++) peak = Math.max(peak, total[addDays(start, i)] || 0);

  const labels = [];
  let prev = '';
  for (let c = 0; c < weeks; c++) {
    const m = addDays(start, c * 7).slice(0, 7);
    if (m !== prev && c < weeks - 1) labels.push({ x: pad + c * pitch, text: `${+m.slice(5)}月` });
    prev = m;
  }
  // 連續沒動工到第幾天（越久綠地越茂密）
  const idle = {};
  for (let i = 0, run = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (d > today) break;
    run = total[d] ? 0 : run + 1;
    idle[d] = run;
  }
  // 由後排畫到前排，同一排由左到右，前面的才會蓋住後面的
  const towers = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < weeks; c++) {
    const d = addDays(start, c * 7 + r);
    const x = pad + c * pitch + (6 - r) * sx, y = top + (r + 1) * sy;
    if (d > today) {
      // 這週還沒到的日子：施工預定地（lot = 距離今天幾天）
      towers.push({ d, n: 0, c, l: 0, seed: hash(d), lot: Math.round((dayMs(d) - dayMs(today)) / DAY), x, y, h: 0 });
      continue;
    }
    const n = total[d] || 0;
    towers.push({
      d, n, c, l: level(n), seed: hash(d), idle: idle[d],
      x, y,
      h: n ? 9 + (maxH - 18) * Math.sqrt(n / peak) : 0,
    });
  }
  // 這一年最高的一棟，樓頂插旗
  const best = towers.reduce((a, t) => (t.n > (a ? a.n : 0) ? t : a), null);
  if (best) best.peak = true;
  // 最前排外面是一條馬路
  const front = top + 7 * sy + 3, back = top + sy - oy - 3, roadW = small ? 9 : 13;
  const left = pad - 3, right = pad + weeks * pitch - (pitch - bw) + 3, lean = 6 * sx + ox;
  return {
    today, towers, labels, top,
    road: { x0: left, x1: right, y: front, h: roadW },
    celestial: { x: W - (small ? 24 : 42), y: small ? 20 : 27, r: small ? 11 : 15 },
    ground: [[left, front], [right, front], [right + lean, back], [left + lean, back]],
    g: { W, H: Math.ceil(top + 7 * sy + 26 + roadW), bw, ox, oy, maxH, weeks, labelY: top + 7 * sy + 19 + roadW },
  };
}

// 天空：白天是太陽和雲，夜景是月亮和星星。畫在最底層，會被樓擋住
export function roadPrims(lay, pal) {
  const { x0, x1, y, h } = lay.road, dashes = [];
  for (let x = x0 + 6; x < x1 - 8; x += 18) dashes.push([x, y + h / 2 - 0.5, 8, 1]);
  return [
    { k: 'poly', pts: [[x0, y], [x1, y], [x1, y + h], [x0, y + h]], fill: pal.road },
    { k: 'rects', rects: dashes, fill: pal.dash },
  ];
}

// orb：太陽／月亮的位置（首頁會依台北時間移動；沒給就固定在右上角）。warm：0–1，晚霞的程度
export function backdrop(lay, pal, { orb, warm = 0 } = {}) {
  const { x, y, r } = orb ?? lay.celestial, W = lay.g.W, out = [];
  const sun = warm > 0.35 ? { sun: '#f2803a', ray: '#e8642a', halo: 'rgba(242,128,58,.26)' } : pal;
  if (pal.night) {
    for (let i = 0, n = Math.round(W / 16); i < n; i++) {
      const a = pick(977, i * 3), sx = 4 + (a % (W - 8)), sy = 4 + (pick(977, i * 3 + 1) % Math.max(20, lay.top - 30));
      if (Math.hypot(sx - x, sy - y) < r * 2.4) continue;
      const sr = 0.5 + (a % 9) / 10;
      out.push({ k: 'ellipse', cx: sx, cy: sy, rx: sr, ry: sr, fill: pal.star, alpha: 0.35 + (pick(977, i * 3 + 2) % 60) / 100 });
    }
    out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 2.3, ry: r * 2.3, fill: pal.halo });
    out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 1.5, ry: r * 1.5, fill: pal.halo });
    // 弦月：外圈大弧，內圈是圓心往右偏的另一個圓
    const px = x + r * 0.259, dy = r * 0.966;
    out.push({ k: 'path', d: `M${f(px)} ${f(y - dy)}A${r} ${r} 0 1 0 ${f(px)} ${f(y + dy)}A${r} ${r} 0 0 1 ${f(px)} ${f(y - dy)}Z`, fill: pal.moon, glow: pal.moon });
  } else {
    const s = r / 15;
    const cy0 = lay.celestial.y;
    for (const [cx, cy, k] of [[W * 0.56, cy0 - 4 * s, 1], [W * 0.76, cy0 + 12 * s, 0.8]]) {
      for (const [dx, dy2, rx, ry] of [[-11, 3, 10, 6], [0, -2, 12, 8], [12, 3, 10, 6]]) {
        out.push({ k: 'ellipse', cx: cx + dx * s * k, cy: cy + dy2 * s * k, rx: rx * s * k, ry: ry * s * k, fill: pal.cloud });
      }
    }
    out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 1.75, ry: r * 1.75, fill: sun.halo });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      out.push({ k: 'line', pts: [[x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3], [x + Math.cos(a) * r * 1.62, y + Math.sin(a) * r * 1.62]], stroke: sun.ray, w: 2 * s });
    }
    out.push({ k: 'ellipse', cx: x, cy: y, rx: r, ry: r, fill: sun.sun });
  }
  return out;
}

// 一格在高度 h 時的圖形（h 會在進場動畫時從 0 長到 t.h）
export function prims(t, h, g, pal, flags = {}) {
  const { bw, ox, oy } = g, { x, y } = t, out = [];
  const roofOf = (bx, by, w, dx, dy) => [[bx, by], [bx + w, by], [bx + w + dx, by - dy], [bx + dx, by - dy]];
  const box = (bx, by, w, bh, dx, dy, color, isTop) => {
    if (bh > 0.5) {
      out.push({ k: 'poly', pts: [[bx + w, by], [bx + w + dx, by - dy], [bx + w + dx, by - bh - dy], [bx + w, by - bh]], fill: shade(color, pal.side) });
      out.push({ k: 'poly', pts: [[bx, by - bh], [bx + w, by - bh], [bx + w, by], [bx, by]], fill: shade(color, pal.front) });
    }
    const roof = roofOf(bx, by - bh, w, dx, dy);
    out.push({ k: 'poly', pts: roof, fill: isTop && flags.lit ? pal.seal : color, glow: isTop && pal.glow && t.l === 4 ? color : null });
    return roof;
  };
  const windows = (bx, by, w, bh, salt) => {
    if (t.h < 14 || bh < 9) return;
    const cols = w >= 13 ? 3 : w >= 7.5 ? 2 : 1, mx = w * 0.14, gap = w * 0.1;
    const ww = (w - 2 * mx - (cols - 1) * gap) / cols, wh = 2.6, rects = [];
    for (let row = 0, wy = by - 4; wy - wh >= by - bh + 3; row++, wy -= 6) {
      for (let c = 0; c < cols; c++) {
        if (pick(t.seed, salt * 131 + row * 7 + c) % 100 < pal.winPct) rects.push([bx + mx + c * (ww + gap), wy - wh, ww, wh]);
      }
    }
    if (rects.length) out.push({ k: 'rects', rects, fill: pal.win });
  };

  // 小工人：腳站在 (wx, wy)。手和工具有兩個姿勢（cls p0／p1）輪流出現，看起來就在動
  const ws = Math.max(0.95, Math.min(1.85, bw / 9));
  const worker = (wx, wy, tool) => {
    if (flags.shift === 'off') return;   // 收工了
    const s = ws, L = (pts, stroke, w, cls) => out.push({ k: 'line', pts, stroke, w: w * s, cls });
    L([[wx - 1.1 * s, wy], [wx - 0.6 * s, wy - 3.2 * s]], pal.pants, 1.3);
    L([[wx + 1.1 * s, wy], [wx + 0.6 * s, wy - 3.2 * s]], pal.pants, 1.3);
    out.push({ k: 'rects', rects: [[wx - 1.7 * s, wy - 7.2 * s, 3.4 * s, 4.2 * s]], fill: CREW.vest });
    out.push({ k: 'rects', rects: [[wx - 1.7 * s, wy - 5.6 * s, 3.4 * s, 0.9 * s]], fill: CREW.stripe });
    out.push({ k: 'ellipse', cx: wx, cy: wy - 8.5 * s, rx: 1.5 * s, ry: 1.5 * s, fill: CREW.skin });
    // 打招呼時安全帽往上推一點，露出臉
    const hat = flags.wave ? 9.8 : 9.3;
    out.push({ k: 'ellipse', cx: wx, cy: wy - hat * s, rx: 1.9 * s, ry: 1.25 * s, fill: CREW.hat });
    L([[wx - 2.4 * s, wy - (hat - 0.5) * s], [wx + 2.4 * s, wy - (hat - 0.5) * s]], CREW.brim, 0.9);
    const sh = [wx + 1.4 * s, wy - 6.5 * s];
    flags.crew?.push({ x: wx, y: wy, s, tool });
    if (flags.wave) {
      // 放大鏡裡：放下工具，笑著揮手
      for (const ex of [-0.6, 0.6]) out.push({ k: 'ellipse', cx: wx + ex * s, cy: wy - 8.5 * s, rx: 0.22 * s, ry: 0.26 * s, fill: '#3a2a1a' });
      L([[wx - 0.6 * s, wy - 7.85 * s], [wx, wy - 7.55 * s], [wx + 0.6 * s, wy - 7.85 * s]], '#a3482f', 0.28);
      L([[wx - 1.4 * s, wy - 6.5 * s], [wx - 2.5 * s, wy - 4 * s]], CREW.skin, 1.1);
      for (const [cls, hx, hy] of [['p0', 3.3, 10.4], ['p1', 4.6, 9.4]]) {
        L([sh, [wx + hx * s, wy - hy * s]], CREW.skin, 1.1, cls);
        out.push({ k: 'ellipse', cx: wx + hx * s, cy: wy - hy * s, rx: 0.8 * s, ry: 0.8 * s, fill: CREW.skin, cls });
      }
      return;
    }
    if (flags.cheer) {
      // 有新的 commit：雙手舉高歡呼
      for (const [cls, a, b] of [['p0', 2.6, 10.6], ['p1', 3.7, 9.7]]) {
        L([sh, [wx + a * s, wy - b * s]], CREW.skin, 1.1, cls);
        L([[wx - 1.4 * s, wy - 6.5 * s], [wx - a * s, wy - b * s]], CREW.skin, 1.1, cls);
      }
      return;
    }
    if (flags.shift === 'lunch') {
      // 午休：捧著便當，一口一口吃
      out.push({ k: 'rects', rects: [[wx + 0.6 * s, wy - 5.9 * s, 3 * s, 1.7 * s]], fill: '#fff6e0' });
      out.push({ k: 'ellipse', cx: wx + 2.1 * s, cy: wy - 5.1 * s, rx: 0.45 * s, ry: 0.45 * s, fill: '#d6452f' });
      L([sh, [wx + 2.6 * s, wy - 5.6 * s]], CREW.skin, 1.1, 'p0');
      L([sh, [wx + 2.3 * s, wy - 7 * s], [wx + 1 * s, wy - 7.7 * s]], CREW.skin, 1.1, 'p1');
      return;
    }
    if (flags.shift === 'overtime') out.push({ k: 'text', x: wx + s, y: wy - 12.2 * s, text: '加班中', size: 5.2 * s, fill: pal.seal });
    if (tool === 'hammer') {
      L([sh, [wx + 3.4 * s, wy - 8.8 * s]], CREW.skin, 1.1, 'p0');
      L([[wx + 3.4 * s, wy - 8.8 * s], [wx + 4.6 * s, wy - 10.6 * s]], CREW.wood, 0.9, 'p0');
      L([[wx + 3.8 * s, wy - 11.2 * s], [wx + 5.4 * s, wy - 10 * s]], CREW.steel, 1.6, 'p0');
      L([sh, [wx + 3.8 * s, wy - 5 * s]], CREW.skin, 1.1, 'p1');
      L([[wx + 3.8 * s, wy - 5 * s], [wx + 5.6 * s, wy - 4.2 * s]], CREW.wood, 0.9, 'p1');
      L([[wx + 6 * s, wy - 5.2 * s], [wx + 5.4 * s, wy - 3.2 * s]], CREW.steel, 1.6, 'p1');
      out.push({ k: 'ellipse', cx: wx + 6.8 * s, cy: wy - 2.6 * s, rx: 0.9 * s, ry: 0.9 * s, fill: CREW.hat, cls: 'p1' });
    } else {
      L([sh, [wx + 3.2 * s, wy - 5.2 * s]], CREW.skin, 1.1, 'p0');
      L([[wx + 2.2 * s, wy - 7.4 * s], [wx + 4.4 * s, wy - 1.6 * s]], CREW.wood, 0.9, 'p0');
      L([[wx + 4 * s, wy - 2.4 * s], [wx + 4.9 * s, wy - 0.4 * s]], CREW.steel, 1.8, 'p0');
      L([sh, [wx + 3.4 * s, wy - 7 * s]], CREW.skin, 1.1, 'p1');
      L([[wx + 2.6 * s, wy - 9 * s], [wx + 5 * s, wy - 4.2 * s]], CREW.wood, 0.9, 'p1');
      L([[wx + 4.6 * s, wy - 5 * s], [wx + 5.6 * s, wy - 3.2 * s]], CREW.steel, 1.8, 'p1');
      out.push({ k: 'ellipse', cx: wx + 6 * s, cy: wy - 5.4 * s, rx: 1 * s, ry: 0.8 * s, fill: shade(pal.dirt, 0.25), cls: 'p1' });
    }
  };

  let roof, cx, cy;
  if (t.lot) {
    // 施工預定地：黃土地基。明天那一塊有工人在挖、前面擺圍欄，再往後是三角錐和土堆
    out.push({ k: 'poly', pts: roofOf(x, y, bw, ox, oy), fill: pal.dirt });
    cx = x + bw / 2 + ox / 2; cy = y - oy / 2;
    const s = Math.min(ws, 1.3);   // 圍欄、三角錐不跟著工人一起放大
    if (t.lot === 1) {
      worker(cx - bw * 0.2, cy + oy * 0.1, 'shovel');
      const bx = x + bw * 0.06, bwid = bw * 0.88, by = y - 5.6 * s, bh = 2.8 * s;
      out.push({ k: 'line', pts: [[bx + 0.8, by], [bx + 0.8, y + 0.5]], stroke: CREW.steel, w: 1 });
      out.push({ k: 'line', pts: [[bx + bwid - 0.8, by], [bx + bwid - 0.8, y + 0.5]], stroke: CREW.steel, w: 1 });
      out.push({ k: 'rects', rects: [[bx, by, bwid, bh]], fill: CREW.cone });
      out.push({ k: 'rects', rects: [0.12, 0.42, 0.72].map((p) => [bx + bwid * p, by, bwid * 0.15, bh]), fill: CREW.white });
      // 收工後留一盞警示燈
      if (flags.shift === 'off') out.push({ k: 'ellipse', cx: bx + bwid / 2, cy: by - 1.8 * s, rx: 1.5 * s, ry: 1.5 * s, fill: CREW.hat, glow: CREW.hat });
    } else if (t.lot === 2) {
      out.push({ k: 'poly', pts: [[cx - 2.6 * s, cy + 1], [cx + 2.6 * s, cy + 1], [cx, cy - 6.5 * s]], fill: CREW.cone });
      out.push({ k: 'line', pts: [[cx - 1.3 * s, cy - 2.4 * s], [cx + 1.3 * s, cy - 2.4 * s]], stroke: CREW.white, w: 1.2 * s });
    } else if (t.lot === 3) {
      out.push({ k: 'ellipse', cx, cy, rx: bw * 0.26, ry: oy * 0.34, fill: shade(pal.dirt, 0.18) });
      out.push({ k: 'ellipse', cx: cx - 1, cy: cy - 1.6 * s, rx: bw * 0.16, ry: oy * 0.24, fill: shade(pal.dirt, 0.3) });
    }
    return out;
  }
  if (!t.n) {
    // 綠地：草皮，上面隨機長一兩棵樹，偶爾是水池。連續沒動工越久越茂密，最後變成小森林
    const dense = t.idle >= 8 ? 2 : t.idle >= 4 ? 1 : 0;
    roof = roofOf(x, y, bw, ox, oy);
    out.push({ k: 'poly', pts: roof, fill: flags.lit ? pal.seal : shade(pal.grass[t.seed % 2], dense * 0.07) });
    cx = x + bw / 2 + ox / 2; cy = y - oy / 2;
    const s = Math.max(0.6, Math.min(1, bw / 16)), kind = (t.seed >>> 3) % 100;
    const tree = (tx, ty, r) => {
      out.push({ k: 'line', pts: [[tx, ty], [tx, ty - r * 1.5]], stroke: pal.trunk, w: 1.3 * s });
      out.push({ k: 'ellipse', cx: tx, cy: ty - r * 2, rx: r, ry: r, fill: pal.canopy });
      out.push({ k: 'ellipse', cx: tx - r * 0.3, cy: ty - r * 2.3, rx: r * 0.45, ry: r * 0.45, fill: pal.canopyHi });
    };
    const r = (3 + ((t.seed >>> 12) % 3) * 0.7) * s;
    const count = Math.min(3, (kind < 48 ? 1 : kind < 72 ? 2 : 0) + dense);
    if (kind < 7 && !dense) out.push({ k: 'ellipse', cx, cy, rx: bw * 0.3, ry: oy * 0.3, fill: pal.water });
    else if (count === 1) tree(cx + (((t.seed >>> 9) % 5) - 2) * 0.7 * s, cy + 1, r);
    else if (count >= 2) {
      tree(cx + bw * 0.2, cy - oy * 0.15, r * 0.85);
      if (count === 3) tree(cx, cy - oy * 0.05, r * 1.15);
      tree(cx - bw * 0.2, cy + oy * 0.2, r);
    }
  } else {
    const color = pal.h[t.l], k = h / t.h;
    if (t.h <= g.maxH * 0.55) {
      roof = box(x, y, bw, h, ox, oy, color, true);
      windows(x, y, bw, h, 1);
      cx = x + bw / 2 + ox / 2; cy = y - h - oy / 2;
    } else {
      // 高樓：上面三成退縮成比較窄的塔樓
      const hb = t.h * 0.72 * k, hu = h - hb, inset = bw * 0.15;
      box(x, y, bw, hb, ox, oy, color, false);
      windows(x, y, bw, hb, 1);
      const ux = x + inset + ox * 0.25, uy = y - hb - oy * 0.25, uw = bw - 2 * inset;
      roof = box(ux, uy, uw, hu, ox * 0.5, oy * 0.5, color, true);
      windows(ux, uy, uw, hu, 2);
      cx = ux + uw / 2 + ox * 0.25; cy = uy - hu - oy * 0.25;
    }
    if (t.peak && k > 0.98 && !flags.today) {
      out.push({ k: 'line', pts: [[cx, cy], [cx, cy - 13]], stroke: pal.ink, w: 1.2 });
      out.push({ k: 'poly', pts: [[cx, cy - 13], [cx + 8, cy - 10.2], [cx, cy - 7.4]], fill: pal.seal });
    } else if (t.l === 4 && t.seed % 3 && k > 0.98 && !flags.today) {
      out.push({ k: 'line', pts: [[cx, cy], [cx, cy - 9]], stroke: shade(color, 0.3), w: 1 });
      out.push({ k: 'ellipse', cx, cy: cy - 9, rx: 1.4, ry: 1.4, fill: pal.seal });
    }
  }
  if (flags.lit) out.push({ k: 'poly', pts: roof, stroke: pal.ink, w: 1.5 });
  if (flags.today) {
    // 今天那一格還在蓋：屋頂描紅邊，上面架一台塔吊
    if (!flags.lit) out.push({ k: 'poly', pts: roof, stroke: pal.seal, w: 1.5 });
    const top = cy - 15;
    out.push({ k: 'line', pts: [[cx, cy], [cx, top - 4]], stroke: pal.seal, w: 1.5 });
    out.push({ k: 'line', pts: [[cx - 5, top], [cx + 12, top]], stroke: pal.seal, w: 1.5 });
    out.push({ k: 'line', pts: [[cx - 5, top], [cx, top - 4], [cx + 12, top]], stroke: pal.seal, w: 0.8 });
    // 吊鉤一上一下
    out.push({ k: 'line', pts: [[cx + 10, top], [cx + 10, top + 5]], stroke: pal.seal, w: 0.8, cls: 'p0' });
    out.push({ k: 'line', pts: [[cx + 10, top], [cx + 10, top + 8]], stroke: pal.seal, w: 0.8, cls: 'p1' });
    worker(cx - bw * 0.42, cy + oy * 0.2, 'hammer');
  }
  return out;
}

// ── SVG 輸出（給 GitHub 個人頁 README 用；<img> 裡的 SVG 讀不到網頁的 CSS，顏色直接寫死）──
const f = (n) => +n.toFixed(1);
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
function emit(p) {
  return p.cls ? shape(p).replace(/^<\w+/, (m) => `${m} class="${p.cls}"`) : shape(p);
}
function shape(p) {
  if (p.k === 'text') return `<text x="${f(p.x)}" y="${f(p.y)}" text-anchor="middle" font-family="${SANS}" font-size="${f(p.size)}" font-weight="700" fill="${p.fill}">${xml(p.text)}</text>`;
  if (p.k === 'rects') return `<path d="${p.rects.map(([x, y, w, h]) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${-f(w)}z`).join('')}" fill="${p.fill}"/>`;
  if (p.k === 'ellipse') return `<ellipse cx="${f(p.cx)}" cy="${f(p.cy)}" rx="${f(p.rx)}" ry="${f(p.ry)}" fill="${p.fill}"${p.alpha ? ` opacity="${f(p.alpha)}"` : ''}/>`;
  if (p.k === 'path') return `<path d="${p.d}" fill="${p.fill}"/>`;
  const d = 'M' + p.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + (p.k === 'poly' ? 'Z' : '');
  return `<path d="${d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.w || 1.5}"` : ''}/>`;
}

// animate：工人的兩個姿勢用 CSS 動畫輪流顯示；轉成 PNG 這類靜態圖時要關掉，只留一個姿勢
function sceneMarkup(lay, pal, animate = true) {
  const { g } = lay, el = [];
  if (animate) el.push('<style>.p0{animation:a 1s infinite}.p1{animation:b 1s infinite}@keyframes a{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes b{0%,49.9%{opacity:0}50%,100%{opacity:1}}</style>');
  const all = [...backdrop(lay, pal), { k: 'poly', pts: lay.ground, fill: pal.ground }, ...roadPrims(lay, pal)];
  for (const t of lay.towers) all.push(...prims(t, t.h, g, pal, { today: t.d === lay.today }));
  for (const p of all) if (animate || p.cls !== 'p1') el.push(animate ? emit(p) : shape(p));
  for (const l of lay.labels) el.push(`<text x="${f(l.x)}" y="${g.labelY}" font-family="${MONO}" font-size="11" fill="${pal.muted}">${l.text}</text>`);
  return el.join('');
}

export function toSVG(lay, pal, { caption, label } = {}) {
  const { g } = lay, H = g.H + (caption ? 28 : 0);
  const cap = caption ? `<text x="4" y="${g.H + 16}" font-family="${SANS}" font-size="13" fill="${pal.ink}">${xml(caption)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.W} ${H}" width="${g.W}" height="${H}" role="img" aria-label="${xml(label || '')}">${sceneMarkup(lay, pal)}${cap}</svg>\n`;
}

// 社群分享預覽圖（1200×630）。之後會轉成 PNG，所以是靜態的、底色寫死
export function ogSVG(lay, pal, { title, sub, stats }) {
  const paper = '#f3eee3', line = 'rgba(28,26,23,.07)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">`
    + `<defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="${line}" stroke-width="1.5"/></pattern></defs>`
    + `<rect width="1200" height="630" fill="${paper}"/><rect width="1200" height="630" fill="url(#grid)"/>`
    + `<text x="58" y="150" font-family="${SANS}" font-size="88" font-weight="800" fill="${pal.ink}">${xml(title)}</text>`
    + `<text x="62" y="208" font-family="${SANS}" font-size="29" fill="${pal.muted}">${xml(sub)}</text>`
    + `<text x="62" y="254" font-family="${SANS}" font-size="27" font-weight="700" fill="${pal.ink}">${xml(stats)}</text>`
    + `<g transform="translate(${(1200 - lay.g.W) / 2} ${622 - lay.g.H})">${sceneMarkup(lay, pal, false)}</g></svg>\n`;
}

// rows: [{ title, private, weeks: number[], year, last }]
export function listSVG(rows, pal, { caption } = {}) {
  const W = 860, RH = 34, cell = 9, gapX = 2, stripX = 396, el = [];
  rows.forEach((r, i) => {
    const y = i * RH;
    if (i) el.push(`<path d="M0 ${y}H${W}" stroke="${pal.rule}"/>`);
    el.push(r.private
      ? `<rect x="0.75" y="${y + 9}" width="16" height="16" rx="3" fill="none" stroke="${pal.seal}" stroke-width="1.5"/><text x="8.75" y="${y + 21}" text-anchor="middle" font-family="${SANS}" font-size="10.5" font-weight="700" fill="${pal.seal}">私</text>`
      : `<circle cx="8.75" cy="${y + 17}" r="3.5" fill="${pal.h[3]}"/>`);
    const title = r.title.length > 24 ? r.title.slice(0, 23) + '…' : r.title;
    el.push(`<text x="30" y="${y + 22}" font-family="${SANS}" font-size="15" font-weight="600" fill="${pal.ink}">${xml(title)}</text>`);
    r.weeks.forEach((n, w) => {
      el.push(`<rect x="${stripX + w * (cell + gapX)}" y="${y + 10}" width="${cell}" height="14" rx="2" fill="${n ? pal.h[fixedLevel(Math.ceil(n / 2))] : pal.cell0}"/>`);
    });
    el.push(`<text x="${W - 62}" y="${y + 22}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${pal.muted}"><tspan font-weight="600" fill="${pal.ink}">${r.year}</tspan> commits</text>`);
    el.push(`<text x="${W}" y="${y + 22}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${pal.muted}">${xml(r.last)}</text>`);
  });
  const H = rows.length * RH + (caption ? 30 : 0);
  if (caption) el.push(`<text x="0" y="${H - 8}" font-family="${SANS}" font-size="12" fill="${pal.muted}">${xml(caption)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="進行中的專案">${el.join('')}</svg>\n`;
}
