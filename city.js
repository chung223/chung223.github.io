// 首頁的立體城市裡「會動、會互動」的部分：天空與作息、工地放大鏡、飛機、車、特效與季節彩蛋。
// 圖形本身（樓、綠地、工人怎麼畫）定義在 skyline.js。

import { addDays, dayMs, layout, prims, backdrop, roadPrims, PALETTES } from './skyline.js';

const $ = (id) => document.getElementById(id);
const DAY = 86400000;
// 農曆春節（國曆日期）。除夕到元宵掛燈籠
const LUNAR_NEW_YEAR = { 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23' };
const CAR_COLORS = ['#e4573d', '#f2b632', '#3f7fd1', '#4fa36b', '#8e6fd0', '#e8e2d4', '#30343c'];
const SPARK_COLORS = ['#ffd166', '#ff6b6b', '#6bd6ff', '#b388ff', '#7bed9f', '#ff9f43'];

// 台北的即時天氣（Open-Meteo，免金鑰）
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=25.04&longitude=121.53&current=weather_code,wind_speed_10m,cloud_cover';

export function createCity({ demo, hour, showTip, hideTip, toggleTheme, pickDay, rel, onWeather, t, pTitle }) {
  const root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = $('sky'), fx = $('fx');
  const S = {
    lay: null, sum: null, data: null, today: '', active: false, visible: true,
    hover: null, crew: [], orb: null, shift: 'work', dpr: 1, raf: 0, tick: 0, growing: false,
    lens: null, wave: 0, said: {}, cheerUntil: 0, grow: null,
    colorBy: false, owner: {}, top: [],
  };
  // rain：0 沒雨、1 下雨、2 大雨；cloud：0–1 雲量
  const weather = { rain: 0, thunder: false, typhoon: false, cloud: 0, label: '' };
  const tr = t;   // 這個檔案裡 t 常被拿來當「一棟樓」的變數名，翻譯函式另外取名
  const palette = () => PALETTES[root.dataset.mode === 'dark' ? 'dark' : 'light'];
  const isNightHour = (h) => h < 5.5 || h >= 18.5;

  // ── 現在的天空與作息：依台北時間決定太陽／月亮的位置、晚霞、工人在做什麼 ──
  function scene() {
    const h = hour(), night = root.dataset.mode === 'dark', c = S.lay.celestial, W = S.lay.g.W;
    let orb = c, dusk = 0;
    // 手動切到跟實際時間相反的模式時，太陽／月亮固定在右上角
    if (isNightHour(h) === night) {
      const t = night ? ((h - 18.5 + 24) % 24) / 11 : (h - 5.5) / 13;   // 0→1：由左邊升起、右邊落下
      orb = { r: c.r, x: c.r * 2.2 + t * (W - c.r * 4.4), y: c.y + (1 - Math.sin(Math.PI * t)) * c.r * 2.4 };
      if (!night) dusk = Math.max(0, Math.min(1, h > 16.6 ? (h - 16.6) / 1.9 : (7 - h) / 1.5));
    }
    const last = S.data?.projects[0]?.last;
    const fresh = last && Date.now() - Date.parse(last) < 2 * 3600e3;
    const shift = demo.has('overtime') ? 'overtime' : demo.has('off') ? 'off'
      : weather.typhoon ? 'storm'
      : h >= 12 && h < 13 ? 'lunch'
      : isNightHour(h) ? (fresh ? 'overtime' : 'off')
      : weather.rain ? 'rain' : 'work';
    const overcast = weather.rain ? 1 : weather.cloud > 0.8 ? 0.5 : 0;
    return { orb, dusk: overcast ? 0 : dusk, shift, overcast };
  }

  function paint(ctx, p) {
    if (p.k === 'rects') {
      ctx.fillStyle = p.fill;
      for (const [x, y, w, h] of p.rects) ctx.fillRect(x, y, w, h);
      return;
    }
    if (p.k === 'text') {
      ctx.font = `700 ${p.size}px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.fill;
      ctx.fillText(p.text, p.x, p.y);
      ctx.textAlign = 'start';
      return;
    }
    let path = null;
    if (p.k === 'path') path = new Path2D(p.d);
    else {
      ctx.beginPath();
      if (p.k === 'ellipse') ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
      else {
        p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (p.k === 'poly') ctx.closePath();
      }
    }
    if (p.fill) {
      if (p.glow) { ctx.shadowColor = p.glow; ctx.shadowBlur = 14; }
      if (p.alpha) ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.fill;
      path ? ctx.fill(path) : ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.w || 1.5; ctx.stroke(); }
  }

  function build(animate) {
    const W = cv.clientWidth;
    if (!W || !S.sum) return;
    S.lay = layout({ total: S.sum.total, level: S.sum.level, today: S.today, W });
    S.dpr = Math.min(devicePixelRatio || 1, 2);
    S.hover = null;
    closeLens();
    const { H } = S.lay.g;
    for (const c of [cv, fx]) { c.width = W * S.dpr; c.height = H * S.dpr; c.style.height = H + 'px'; }
    placeCars();
    cancelAnimationFrame(S.raf);
    S.growing = false;
    if (!animate || calm) return draw();
    const t0 = performance.now(), end = S.lay.g.weeks * 14 + 800;
    S.growing = true;
    const loop = (t) => {
      draw(t - t0);
      if (t - t0 < end) S.raf = requestAnimationFrame(loop);
      else S.growing = false;
    };
    S.raf = requestAnimationFrame(loop);
  }

  function draw(elapsed = 1e9) {
    const lay = S.lay;
    if (!lay) return;
    const ctx = cv.getContext('2d'), pal = palette(), pose = 'p' + (S.tick % 2), sc = scene(), now = performance.now();
    S.orb = sc.orb; S.shift = sc.shift;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, lay.g.W, lay.g.H);
    if (sc.dusk > 0.02) {
      // 晚霞／朝霞：地平線往上一層橘色
      const g = ctx.createLinearGradient(0, 0, 0, lay.top);
      g.addColorStop(0, 'rgba(245,150,70,0)');
      g.addColorStop(1, `rgba(240,110,50,${0.34 * sc.dusk})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, lay.g.W, lay.top);
    }
    if (sc.overcast === 1) {
      // 下雨：天空壓一層灰
      ctx.fillStyle = pal.night ? 'rgba(20,26,40,.35)' : 'rgba(110,122,138,.2)';
      ctx.fillRect(0, 0, lay.g.W, lay.top);
    }
    for (const p of backdrop(lay, pal, { orb: sc.orb, warm: sc.dusk, overcast: sc.overcast })) paint(ctx, p);
    paint(ctx, { k: 'poly', pts: lay.ground, fill: pal.ground });
    for (const p of roadPrims(lay, pal)) paint(ctx, p);
    const crew = [], cheer = now < S.cheerUntil, txt = { ot: tr('ot'), storm: tr('typhoonSign') };
    for (const t of lay.towers) {
      const p = Math.max(0, Math.min(1, (elapsed - t.c * 14) / 800));
      let h = t.h * (1 - (1 - p) ** 3);
      const isToday = t.d === S.today;
      if (isToday && S.grow) {
        const q = Math.min(1, (now - S.grow.t0) / S.grow.dur);
        h = S.grow.from + (t.h - S.grow.from) * (1 - (1 - q) ** 3);
      }
      const who = S.colorBy && t.n ? S.owner[t.d] : undefined;
      const color = who === undefined ? undefined : who >= 0 ? pal.proj[who] : pal.projOther;
      for (const shape of prims(t, h, lay.g, pal, { today: isToday, lit: S.hover === t, crew, shift: sc.shift, cheer, color, txt })) {
        if (!shape.cls || shape.cls === pose) paint(ctx, shape);
      }
    }
    S.crew = crew;
    ctx.fillStyle = pal.muted;
    ctx.font = '11px "DM Mono", monospace';
    for (const l of lay.labels) ctx.fillText(tr('month', l.m), l.x, lay.g.labelY);
  }

  // ── 滑鼠：hover 看當天、點大樓看 commit、點工人打招呼、點太陽月亮切換 ──
  function hit(e) {
    if (!S.lay) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top, { bw, ox, oy } = S.lay.g;
    let found = null;
    for (let i = S.lay.towers.length - 1; i >= 0 && !found; i--) {
      const t = S.lay.towers[i], top = t.y - t.h;
      if (!t.lot && px >= t.x && px <= t.x + bw + ox && py >= top - oy && py <= t.y) found = t;
    }
    if (found !== S.hover) { S.hover = found; draw(); }
    if (found) showTip(found.d, found.n, true, e.clientX, r.top + found.y - found.h - oy, found.peak ? tr('peak') : '');
    else hideTip();
    const c = S.orb || S.lay.celestial;
    S.onOrb = !found && Math.hypot(px - c.x, py - c.y) < c.r * 1.7;
    S.onWorker = S.crew.find((w) => px >= w.x - 4 * w.s && px <= w.x + 7 * w.s && py >= w.y - 12 * w.s && py <= w.y + 2) || null;
    cv.style.cursor = S.onOrb || S.onWorker || found ? 'pointer' : '';
  }
  cv.addEventListener('pointermove', hit);
  cv.addEventListener('pointerdown', hit);
  cv.addEventListener('pointerleave', () => { S.hover = null; draw(); hideTip(); });
  cv.addEventListener('click', (e) => {
    if (S.onWorker) openLens(S.onWorker);
    else if (S.onOrb) toggleTheme();
    else if (S.hover) { hideTip(); pickDay(S.hover, e.clientX, e.clientY); }
  });

  // ── 放大鏡：把工人那一角放大重畫一次，工人改成揮手的姿勢 ──
  function openLens(w) {
    // 剛被同一下點擊關掉的就不要再打開，等於點第二下是收起來
    if (S.closed?.tool === w.tool && performance.now() - S.closed.at < 400) return;
    const lens = $('lens'), lc = $('lens-cv'), W = S.lay.g.W;
    const D = W < 640 ? 170 : 230;
    S.lens = { ...w, D, z: (D * 0.42) / (11 * w.s) };
    lc.width = lc.height = D * S.dpr;
    lens.style.width = lens.style.height = D + 'px';
    lens.style.left = Math.max(0, Math.min(W - D, w.x - D - 14)) + 'px';
    lens.style.top = Math.min(S.lay.g.H - D, w.y - 6 * w.s - D * 0.6) + 'px';
    const kind = ['lunch', 'overtime', 'rain'].includes(S.shift) ? S.shift : w.tool;
    const lines = tr('lines')[kind](S.sum.total[S.today] || 0), i = S.said[kind] || 0;
    S.said[kind] = i + 1;
    $('bubble').textContent = lines[i % lines.length];
    hideTip();
    lens.hidden = true; void lens.offsetWidth; lens.hidden = false;   // 重播彈出動畫
    S.wave = 0;
    drawLens();
    clearInterval(S.waving);
    if (!calm) S.waving = setInterval(() => { S.wave++; drawLens(); }, 280);
  }
  function closeLens() {
    if (!S.lens) return;
    S.closed = { tool: S.lens.tool, at: performance.now() };
    S.lens = null;
    clearInterval(S.waving);
    $('lens').hidden = true;
  }
  function drawLens() {
    const w = S.lens, lay = S.lay;
    if (!w || !lay) return;
    const ctx = $('lens-cv').getContext('2d'), pal = palette(), pose = 'p' + (S.wave % 2);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--paper');
    ctx.fillRect(0, 0, w.D, w.D);
    ctx.translate(w.D / 2, w.D * 0.6);
    ctx.scale(w.z, w.z);
    ctx.translate(-(w.x + 1.5 * w.s), -(w.y - 5 * w.s));
    paint(ctx, { k: 'poly', pts: lay.ground, fill: pal.ground });
    for (const t of lay.towers) {
      for (const shape of prims(t, t.h, lay.g, pal, { today: t.d === S.today, wave: true })) {
        if (!shape.cls || shape.cls === pose) paint(ctx, shape);
      }
    }
  }
  document.addEventListener('pointerdown', closeLens);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLens(); });

  // ── 街上的車：數量跟最近七天的 commit 數成正比 ──
  function placeCars() {
    const { road, g } = S.lay, el = $('road');
    let week = 0;
    for (let i = 0; i < 7; i++) week += S.sum.total[addDays(S.today, -i)] || 0;
    // 尖峰時段：現在如果是一年裡最常動工的三個鐘頭之一，車子加倍
    const busiest = (S.data.hours || []).map((v, h) => [v, h]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    const rush = busiest.includes(Math.floor(hour()));
    const n = Math.max(1, Math.min(7, Math.round(week / 12))) * (rush ? 2 : 1);
    const width = road.x1 - road.x0, lanes = g.W < 640 ? [1] : [1, road.h - 6];
    Object.assign(el.style, { left: road.x0 + 'px', width: width + 'px', top: road.y + 'px', height: road.h + 'px' });
    el.style.setProperty('--w', width + 'px');
    const key = `${n}:${Math.round(width)}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.innerHTML = Array.from({ length: n }, (_, i) => {
      const rev = lanes.length > 1 && i % 2, dur = (rush ? 16 : 11) + ((i * 37) % 13);   // 塞車時開得慢
      return `<i class="car${rev ? ' rev' : ''}" style="--c:${CAR_COLORS[i % CAR_COLORS.length]};--dur:${dur}s;--delay:${-((i * 4.7) % dur).toFixed(1)}s;top:${rev ? lanes[1] : lanes[0]}px"></i>`;
    }).join('');
  }

  // ── 飛機拉的橫幅 ──
  function setBanner() {
    const p = S.data?.projects[0];
    $('banner').textContent = p ? tr('banner', rel(p.last), pTitle(p)) : '';
  }

  // ── 季節彩蛋：春節掛燈籠、生日飄氣球 ──
  function decorate() {
    const year = S.today.slice(0, 4), lny = LUNAR_NEW_YEAR[year];
    const sinceLny = lny ? (dayMs(S.today) - dayMs(`${year}-${lny}`)) / DAY : NaN;
    let html = '';
    if (demo.has('newyear') || (sinceLny >= -1 && sinceLny <= 14)) {
      html += `<div class="lanterns">${Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}">🏮</i>`).join('')}</div>`;
    }
    if (demo.has('birthday') || (S.data.birthday && S.data.birthday === S.today.slice(5))) {
      html += `<div class="balloons">${Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}">🎈</i>`).join('')}</div>`;
    }
    const el = $('deco');
    if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; }
  }

  // ── 特效圖層：冬天下雪、連續動工每滿七天的晚上放煙火、新 commit 的彩帶 ──
  const P = [];
  let fxRaf = 0, fxLast = 0, nextBurst = 0, flakes = 0, drops = 0, flash = 0, nextFlash = 0;
  const effects = () => {
    const month = +S.today.slice(5, 7), streak = S.sum?.streak || 0;
    return {
      rain: weather.rain, thunder: weather.thunder,
      snow: demo.has('snow') || month === 12 || month <= 2,
      fireworks: root.dataset.mode === 'dark' && (demo.has('fireworks') || (streak > 0 && streak % 7 === 0)),
    };
  };
  function burst(x, y) {
    const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, v = 1.1 + Math.random() * 1.5;
      P.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 60 + Math.random() * 25, max: 85, color });
    }
  }
  function confetti(x, y) {
    for (let i = 0; i < 46; i++) {
      P.push({
        k: 'bit', x, y, vx: (Math.random() - 0.5) * 4.2, vy: -2.2 - Math.random() * 3, rot: Math.random() * 6,
        life: 110, max: 110, color: SPARK_COLORS[i % SPARK_COLORS.length],
      });
    }
  }
  function fxLoop(t) {
    fxRaf = 0;
    if (!S.lay || !S.active || !S.visible || document.hidden) return;
    const { W, H } = S.lay.g, ctx = fx.getContext('2d'), fxs = effects();
    const dt = Math.min(50, t - fxLast) / 16.7;
    fxLast = t;
    if (fxs.snow && flakes < W / 13 && Math.random() < 0.3) {
      flakes++;
      P.push({ k: 'snow', x: Math.random() * W, y: -3, vy: 0.35 + Math.random() * 0.6, r: 0.8 + Math.random() * 1.4, sway: Math.random() * 6 });
    }
    for (let i = 0; fxs.rain && i < fxs.rain * 3 && drops < (W / 5) * fxs.rain; i++) {
      drops++;
      P.push({ k: 'rain', x: Math.random() * (W + 40), y: -8, vy: 6.5 + Math.random() * 3 });
    }
    if (fxs.thunder && t > nextFlash) { flash = 1; nextFlash = t + 3500 + Math.random() * 6000; }
    if (fxs.fireworks && t > nextBurst) {
      burst(W * (0.12 + Math.random() * 0.76), 14 + Math.random() * (S.lay.top * 0.5));
      nextBurst = t + 700 + Math.random() * 1500;
    }
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (flash > 0.02) {
      // 閃電
      ctx.fillStyle = `rgba(255,255,255,${0.42 * flash})`;
      ctx.fillRect(0, 0, W, S.lay.road.y);
      flash *= 0.86 ** dt;
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      if (p.k === 'rain') {
        p.y += p.vy * dt; p.x -= 1.6 * dt;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = root.dataset.mode === 'dark' ? '#a9c4ff' : '#6f8fb8';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 1.8, p.y - 7); ctx.stroke();
        if (p.y > S.lay.road.y + 4 || !fxs.rain) { P.splice(i, 1); drops--; }
        continue;
      }
      if (p.k === 'snow') {
        p.y += p.vy * dt; p.sway += 0.03 * dt;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = root.dataset.mode === 'dark' ? '#ffffff' : '#b9c8dc';
        ctx.beginPath(); ctx.arc(p.x + Math.sin(p.sway) * 5, p.y, p.r, 0, 6.3); ctx.fill();
        if (p.y > S.lay.road.y || !fxs.snow) { P.splice(i, 1); flakes--; }
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vy += (p.k === 'bit' ? 0.09 : 0.035) * dt;
      if (p.k === 'spark') { p.vx *= 0.985; p.vy *= 0.985; }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.k === 'bit') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.life / 9); ctx.fillRect(-2, -1.2, 4, 2.4); ctx.restore();
      } else {
        ctx.shadowColor = p.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, 6.3); ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (p.life <= 0) P.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    if (P.length || fxs.snow || fxs.fireworks || fxs.rain || flash > 0.02) fxRaf = requestAnimationFrame(fxLoop);
  }
  function fxKick() {
    if (fxRaf || calm) return;
    fxLast = performance.now();
    fxRaf = requestAnimationFrame(fxLoop);
  }

  // ── 新的 commit 進來：今天那棟樓長高、工人歡呼、撒彩帶 ──
  function celebrate(delta, from) {
    const t = S.lay?.towers.find((x) => x.d === S.today);
    if (!t || calm || !S.active) return;
    const now = performance.now();
    S.cheerUntil = now + 6500;
    S.grow = { from: from ?? t.h * 0.65, t0: now, dur: 1600 };
    const loop = () => {
      draw();
      if (performance.now() - now < 1600) requestAnimationFrame(loop);
      else { S.grow = null; draw(); }
    };
    requestAnimationFrame(loop);
    const cx = t.x + S.lay.g.bw / 2, cy = t.y - t.h - 12;
    confetti(cx, cy);
    const plus = $('plus');
    plus.textContent = tr('plus', delta);
    Object.assign(plus.style, { left: Math.min(S.lay.g.W - 90, cx - 30) + 'px', top: cy - 26 + 'px' });
    plus.hidden = true; void plus.offsetWidth; plus.hidden = false;
    fxKick();
  }

  // ── 台北現在的天氣：下雨就下雨、打雷就閃電、颱風天工人停工 ──
  async function loadWeather() {
    try {
      let code = 0, wind = 0, cloud = 0;
      if (demo.has('typhoon')) [code, wind] = [65, 90];
      else if (demo.has('storm')) code = 95;
      else if (demo.has('rain')) code = 61;
      else {
        const c = (await (await fetch(WEATHER_URL)).json()).current;
        [code, wind, cloud] = [c.weather_code, c.wind_speed_10m, c.cloud_cover / 100];
      }
      const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
      Object.assign(weather, {
        rain: !wet ? 0 : [65, 67, 82].includes(code) || code >= 95 ? 2 : 1,
        thunder: code >= 95,
        typhoon: wet && wind >= 62,   // 八級風以上又下雨
        cloud,
      });
      // 傳字典的 key，由首頁依目前語言顯示
      weather.label = weather.typhoon ? 'wTyphoon' : weather.thunder ? 'wThunder' : weather.rain === 2 ? 'wHeavy' : weather.rain ? 'wRain' : cloud > 0.8 ? 'wCloudy' : '';
      onWeather?.(weather.label);
      draw();
      fxKick();
    } catch {
      // 天氣抓不到就當晴天
    }
  }
  loadWeather();
  setInterval(loadWeather, 15 * 60000);

  // ── 依專案上色：commit 最多的六個專案各一個顏色，每棟樓塗上當天最主要那個專案的顏色 ──
  function assignOwners() {
    S.top = [...S.data.projects].sort((a, b) => b.year - a.year).slice(0, 6);
    S.owner = {};
    for (const d of Object.keys(S.sum.total)) {
      let best = null;
      for (const p of S.data.projects) if (p.days[d] && (!best || p.days[d] > best.days[d])) best = p;
      S.owner[d] = best ? S.top.indexOf(best) : -1;
    }
  }
  function drawLegend() {
    const el = $('proj-key'), pal = palette();
    el.hidden = !S.colorBy;
    if (!S.colorBy) return;
    el.innerHTML = S.top.map((p, i) => `<span><i style="background:${pal.proj[i]}"></i>${pTitle(p).replace(/[&<>]/g, '')}</span>`).join('')
      + `<span><i style="background:${pal.projOther}"></i>${tr('otherProjects')}</span>`;
  }

  // ?demo=debug：把內部狀態掛到 window 上，方便在 console 檢查
  if (demo.has('debug')) window.__city = { S, weather, P, effects, fxKick, fxLoop, draw, get raf() { return fxRaf; } };

  // 工人、吊鉤每 0.5 秒換一個姿勢。只在看得到天際線、大樓長完之後才重畫
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { S.visible = e.isIntersecting; if (S.visible) fxKick(); }).observe(cv);
  }
  if (!calm) setInterval(() => {
    if (!S.active || document.hidden || !S.visible || S.growing || S.grow || S.hover) return;
    S.tick++;
    draw();
  }, 500);
  new ResizeObserver(() => { if (S.active && S.lay?.g.W !== cv.clientWidth) build(false); }).observe(cv);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fxKick(); });

  return {
    // 資料更新。today 的 commit 變多（頁面開著時抓到新資料）就慶祝一下
    update({ sum, today, data, first, active }) {
      const before = S.sum && S.today === today ? S.sum.total[today] || 0 : null;
      const prevH = S.lay?.towers.find((t) => t.d === today)?.h;
      Object.assign(S, { sum, today, data, active });
      assignOwners();
      drawLegend();
      setBanner();
      decorate();
      if (active) build(first);
      const count = sum.total[today] || 0;
      if (!first && before !== null && count > before) celebrate(count - before, prevH);
      if (first && demo.has('commit')) setTimeout(() => celebrate(3), 2800);
      fxKick();
    },
    setActive(on, animate) {
      S.active = on;
      if (on) { build(animate); fxKick(); } else closeLens();
    },
    // 深淺色切換後重畫
    refresh() { draw(); drawLens(); drawLegend(); fxKick(); },
    setColorBy(on) { S.colorBy = on; drawLegend(); draw(); },
    // 語言切換後，把城市裡的文字換掉
    relabel() { setBanner(); drawLegend(); draw(); },
    // 每分鐘：太陽月亮往前走一點、橫幅上的「幾分鐘前」更新
    minute() { setBanner(); if (S.active && !S.growing) draw(); },
  };
}
