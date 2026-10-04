// 首頁的主程式：抓 data.json，畫出刊頭數字、平面熱力圖、作息、動態、專案卡片，並把城市（city.js）接上。

import { addDays, dayMs, wdOf, fixedLevel, summarize } from './skyline.js';
import { createCity } from './city.js';
import { track } from './analytics.js';
import { t, getLang, setLang, applyStatic, pTitle, pSummary, tag } from './i18n.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const ACTIVE_DAYS = 30, MINI_WEEKS = 26, WEEKS = 53;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let data = null, offset = 480, view = null;
if (!calm && 'IntersectionObserver' in window) document.body.classList.add('anim');

// 所有日期都用資料指定的時區（台灣）算，跟訪客所在時區無關
const dayOf = (ms) => new Date(ms + offset * 60000).toISOString().slice(0, 10);
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

function rel(iso) {
  const diff = Date.now() - Date.parse(iso), m = Math.floor(diff / 60000);
  if (m < 1) return t('relNow');
  if (m < 60) return t('relMin', m);
  if (m < 60 * 24) return t('relHour', Math.floor(m / 60));
  const days = Math.round((dayMs(dayOf(Date.now())) - dayMs(dayOf(Date.parse(iso)))) / DAY);
  if (days <= 1) return t('yesterday').toLowerCase();
  if (days < 30) return t('relDays', days);
  if (days < 365) return t('relMonths', Math.floor(days / 30));
  return dayOf(Date.parse(iso)).replaceAll('-', '/');
}
const exact = (iso) => new Date(Date.parse(iso) + offset * 60000).toISOString().slice(0, 16).replace('T', ' ');

// weeks 週、週日起算、最後一欄是本週；未來的日子留空
function cells(days, weeks, level, today) {
  const start = addDays(today, -wdOf(today) - (weeks - 1) * 7);
  let html = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (d > today) { html += '<i class="void"></i>'; continue; }
    const n = days[d] || 0;
    html += `<i data-d="${d}" data-n="${n}" data-l="${level(n)}"${d === today ? ' class="today"' : ''}></i>`;
  }
  return html;
}

function redact(seed, lines) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  let html = '';
  for (let i = 0; i < lines; i++) { h = (h * 1103515245 + 12345) >>> 0; html += `<i style="width:${38 + (h % 55)}%"></i>`; }
  return `<div class="redact" aria-hidden="true">${html}</div>`;
}

function countUp(el, to) {
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 1100);
    el.textContent = Math.round(to * (1 - (1 - p) ** 4)).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── 立體城市（city.js）與白天／夜景 ──
// ?demo=night,snow,fireworks,newyear,birthday,lunch,dusk,overtime,off,commit 可以預覽平常看不到的狀態
const root = document.documentElement;
const demo = new Set((new URLSearchParams(location.search).get('demo') || '').split(',').filter(Boolean));
const taipeiHour = () => (demo.has('lunch') ? 12.5 : demo.has('dusk') ? 17.9 : demo.has('overtime') || demo.has('off') ? 23
  : (((Date.now() / 3600000 + offset / 60) % 24) + 24) % 24);
if (['night', 'overtime', 'off', 'fireworks'].some((k) => demo.has(k))) root.dataset.theme = 'dark';
if (['day', 'lunch', 'dusk'].some((k) => demo.has(k))) root.dataset.theme = 'light';
let sky = '', note = '';
const setNote = () => { $('hm-note').textContent = note + (sky ? t('taipeiNow', t(sky)) : ''); };
const city = createCity({
  demo, hour: taipeiHour, showTip, hideTip: () => tip.classList.remove('on'), toggleTheme, pickDay: openDay, rel, t, pTitle,
  onWeather: (label) => { sky = label; setNote(); },
});
$('by-proj').addEventListener('click', () => {
  const on = $('by-proj').getAttribute('aria-pressed') !== 'true';
  $('by-proj').setAttribute('aria-pressed', on);
  $('heat-key').hidden = on;
  city.setColorBy(on);
});

// 專案篩選：App（iOS／macOS）、Web（網站與 PWA）、其他；公開或非公開
const kindOf = (p) => {
  const t = `${(p.tags || []).join(' ')} ${p.lang || ''}`;
  return /iOS|iPadOS|macOS|Swift/.test(t) ? 'app' : /PWA|Web|LINE|遊戲|HTML|JavaScript|TypeScript|PHP|Vue/.test(t) ? 'web' : 'other';
};
const FILTERS = [['all', 'fAll'], ['app', 'fApp'], ['web', 'fWeb'], ['other', 'fOther'], ['public', 'fPublic'], ['private', 'fPrivate']];
const passes = (el, f) => f === 'all' || el.dataset.kind === f || el.dataset.vis === f;
let filter = 'all';
function applyFilter() {
  const els = [...document.querySelectorAll('[data-kind]')];
  for (const el of els) el.hidden = !passes(el, filter);
  $('filters').innerHTML = FILTERS.map(([k, label]) => [k, label, els.filter((el) => passes(el, k)).length])
    .filter(([k, , n]) => n || k === filter)
    .map(([k, label, n]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filter}">${t(label)}<small>${n}</small></button>`).join('');
  $('old-sec').hidden = !els.some((el) => el.closest('#old') && !el.hidden);
  $('none').hidden = els.some((el) => el.closest('#active') && !el.hidden);
}
$('filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (b) { filter = b.dataset.f; applyFilter(); reveal(); }
});
function setMode() {
  const h = taipeiHour();
  root.dataset.mode = root.dataset.theme || (h < 5.5 || h >= 18.5 ? 'dark' : 'light');
  $('theme').setAttribute('aria-label', t(root.dataset.mode === 'dark' ? 'toDay' : 'toNight'));
  city.refresh();
}
function toggleTheme() {
  root.dataset.theme = root.dataset.mode === 'dark' ? 'light' : 'dark';
  try { sessionStorage.setItem('home-theme', root.dataset.theme); } catch {}
  setMode();
}
$('theme').addEventListener('click', toggleTheme);
function setLanguage(next) {
  if (next) setLang(next);
  applyStatic();
  document.title = t('title');
  $('lang').textContent = t('langBtn');
  $('lang').setAttribute('aria-label', t('langAria'));
  if (data) render(false);
  setMode();
  city.relabel();
}
$('lang').addEventListener('click', () => setLanguage(getLang() === 'zh' ? 'en' : 'zh'));
setLanguage();

// 點大樓：列出那天各專案的 commit（公開的顯示訊息，私有的照舊塗黑）
function openDay(tw, x, y) {
  const d = tw.d, day = $('day');
  const rows = data.projects.filter((p) => p.days[d]).sort((a, b) => b.days[d] - a.days[d]).map((p) => {
    const body = p.private ? redact(p.title + d, 1) : (p.log?.[d] || []).map((m) => `<p class="m">${esc(m)}</p>`).join('');
    return `<li><div class="p"><span>${esc(pTitle(p))}</span>${p.private ? `<span class="seal">${t('priv')}</span>` : ''}<span class="n">×${p.days[d]}</span></div>${body}</li>`;
  });
  const hidden = data.other?.days?.[d];
  if (hidden) rows.push(`<li><div class="p"><span>${t('otherPrivate')}</span><span class="n">×${hidden}</span></div></li>`);
  const sub = tw.n ? `${t('commits', tw.n)}${tw.peak ? ` · ${t('peak')}` : ''}` : t('dayPark', tw.idle);
  day.innerHTML = `<button type="button" class="x" aria-label="${t('close')}">×</button><h3>${d.replaceAll('-', '/')} ${t('wd', wdOf(d))}</h3><p class="t">${sub}</p>${rows.length ? `<ul>${rows.join('')}</ul>` : ''}`;
  day.hidden = true; void day.offsetWidth; day.hidden = false;
  // 用 offsetWidth／Height：彈出動畫正在縮放，getBoundingClientRect 量到的會是縮小後的尺寸
  const w = day.offsetWidth, h = day.offsetHeight;
  day.style.left = Math.max(12, Math.min(x - w / 2, innerWidth - w - 12)) + 'px';
  day.style.top = (y - h - 16 < 12 ? Math.max(12, Math.min(y + 20, innerHeight - h - 12)) : y - h - 16) + 'px';
}
const closeDay = () => { $('day').hidden = true; };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('#day') || e.target.closest('.x')) closeDay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDay(); });

function setView(v) {
  view = v;
  $('sky-wrap').hidden = v !== '3d';
  $('hm-scroll').hidden = v === '3d';
  $('park-key').hidden = v !== '3d';
  $('v3d').setAttribute('aria-pressed', v === '3d');
  $('v2d').setAttribute('aria-pressed', v !== '3d');
  if (v !== '3d') { const sc = $('hm-scroll'); sc.scrollLeft = sc.scrollWidth; }
}
for (const v of ['3d', '2d']) $('v' + v).addEventListener('click', () => {
  setView(v);
  city.setActive(v === '3d', true);
  try { localStorage.setItem('home-view', v); } catch {}
});

let io = null;
function reveal() {
  const els = document.querySelectorAll('.rv:not(.in)');
  if (!document.body.classList.contains('anim')) return els.forEach((el) => el.classList.add('in'));
  io ??= new IntersectionObserver((entries) => {
    // 同一批進到畫面的依序錯開
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      e.target.style.setProperty('--i', i);
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => io.observe(el));
}

function render(first) {
  offset = data.utcOffsetMinutes ?? 480;
  const today = dayOf(Date.now());
  const projects = data.projects;
  const sum = summarize(data, today);
  const { total, level, year, activeDays, streak } = sum;

  // ── 刊頭數字 ──
  const cutoff = addDays(today, -ACTIVE_DAYS);
  const active = projects.filter((p) => dayOf(Date.parse(p.last)) >= cutoff);
  const older = projects.filter((p) => !active.includes(p));
  $('ledger').innerHTML = [
    [t('statYear'), year],
    [t('statDays'), activeDays, t('uDay')],
    [t('statStreak'), streak, t('uDay')],
    [t('statActive'), active.length, t('uItem')],
  ].map(([k, v, u]) => `<div><dt>${k}</dt><dd><span data-to="${v}">${first && !calm ? 0 : v.toLocaleString()}</span>${u ? `<small>${u}</small>` : ''}</dd></div>`).join('');
  if (first && !calm) $('ledger').querySelectorAll('[data-to]').forEach((el) => countUp(el, +el.dataset.to));

  const latest = projects[0];
  $('status').textContent = latest ? t('lastBuilt', rel(latest.last)) : 'Build log';
  // 排程至少每 6 小時會重新部署一次；超過 14 小時沒動靜，多半是 token 過期或排程被停用
  const staleHours = Math.floor((Date.now() - Date.parse(data.generatedAt)) / 3600000);
  $('foot-sync').textContent = staleHours >= 14
    ? t('stale', staleHours, exact(data.generatedAt))
    : t('synced', exact(data.generatedAt));
  $('foot-sync').classList.toggle('stale', staleHours >= 14);
  const privCount = projects.filter((p) => p.private).length + (data.other?.count || 0);
  note = t('allProjects', privCount);
  setNote();

  // ── 平面熱力圖 ──
  const start = addDays(today, -wdOf(today) - (WEEKS - 1) * 7);
  let months = '', prev = '';
  for (let w = 0; w < WEEKS; w++) {
    const m = addDays(start, w * 7).slice(0, 7);
    if (m !== prev && w < WEEKS - 2) months += `<span style="grid-column:${w + 1}">${t('month', +m.slice(5))}</span>`;
    prev = m;
  }
  const label = t('heatAria', year, activeDays);
  const hm = $('hm');
  hm.style.setProperty('--cols', WEEKS);
  hm.setAttribute('aria-label', label);
  $('sky').setAttribute('aria-label', label);
  hm.innerHTML =
    `<div class="hm-months">${months}</div>` +
    `<div class="hm-wd"><span></span><span>${t('wdAxis')[1]}</span><span></span><span>${t('wdAxis')[3]}</span><span></span><span>${t('wdAxis')[5]}</span><span></span></div>` +
    `<div class="cells" data-scope="all">${cells(total, WEEKS, level, today)}</div>`;

  // ── 最近動態 + 跑馬燈 ──
  let feed = '';
  const rail = [];
  for (let i = 0, shown = 0; i < 21 && shown < 7; i++) {
    const d = addDays(today, -i);
    if (!total[d]) continue;
    shown++;
    const rows = projects.filter((p) => p.days[d]).sort((a, b) => b.days[d] - a.days[d]).map((p) => {
      const msgs = (p.recent || []).filter((c) => dayOf(Date.parse(c.t)) === d);
      const body = p.private ? redact(p.title + d, 1)
        : msgs.length ? `<p class="m">${esc(msgs[0].m)}</p>` : '';
      rail.push(`<span><b>${md(d)}</b>${esc(pTitle(p))}<em>×${p.days[d]}</em>${!p.private && msgs.length ? `<u>${esc(msgs[0].m.slice(0, 48))}</u>` : ''}</span>`);
      return `<li><div class="p"><span>${esc(pTitle(p))}</span>${p.private ? `<span class="seal">${t('priv')}</span>` : ''}<span class="n">×${p.days[d]}</span></div>${body}</li>`;
    });
    const hidden = data.other?.days?.[d];
    if (hidden) rows.push(`<li><div class="p"><span>${t('otherPrivate')}</span><span class="n">×${hidden}</span></div></li>`);
    const name = i === 0 ? t('today') : i === 1 ? t('yesterday') : t('wd', wdOf(d));
    feed += `<li class="rv"><div class="d">${md(d)}<span>${name} · ${t('commits', total[d])}</span></div><ul>${rows.join('')}</ul></li>`;
  }
  $('feed').innerHTML = feed || `<li class="empty">${t('quiet')}</li>`;
  // 內容放兩份、位移一半，接起來才沒有縫；項目太少時多補幾輪把寬度撐滿
  const loops = rail.length ? Math.max(1, Math.ceil(12 / rail.length)) : 0;
  $('rail').innerHTML = rail.join('').repeat(loops * 2);
  $('rail').style.setProperty('--dur', `${Math.max(30, rail.length * loops * 4)}s`);

  // ── 進行中的專案 ──
  const weekAgo = addDays(today, -6);
  $('active').innerHTML = active.map((p) => {
    const week = Object.entries(p.days).reduce((s, [d, n]) => s + (d >= weekAgo ? n : 0), 0);
    const links = p.private ? `<span class="seal" title="${t('privHint')}">${t('priv')}</span>`
      : `<span class="links">${p.site ? `<a href="${esc(p.site)}">${t('site')}</a>` : ''}<a href="${esc(p.repo)}">GitHub ↗</a></span>`;
    const log = p.private
      ? `${redact(p.title, 3)}<p class="hush">${t('hush')}</p>`
      : `<ul>${p.recent.slice(0, 3).map((c) => `<li><time>${md(dayOf(Date.parse(c.t)))}</time><span title="${esc(c.m)}">${esc(c.m)}</span></li>`).join('')}</ul>`;
    const tags = [p.lang, ...(p.tags || []).map(tag)].filter(Boolean);
    const heat = fixedLevel(Math.ceil(week / 3));
    const name = pTitle(p), sum = pSummary(p);
    const initial = esc([...name][0]);
    const mono = `<span class="ico mono" aria-hidden="true">${initial}</span>`;
    const ico = p.icon ? `<img class="ico" src="${esc(p.icon)}" alt="" loading="lazy" data-mono="${initial}">` : mono;
    return `<article class="card rv" data-kind="${kindOf(p)}" data-vis="${p.private ? 'private' : 'public'}"${heat ? ` style="--heat:var(--h${heat})"` : ''}>
      <header>${ico}<h3>${esc(name)}</h3>${links}</header>
      ${sum ? `<p class="sum">${esc(sum)}</p>` : ''}
      <div class="cells" style="--cols:${MINI_WEEKS}" role="img" aria-label="${esc(t('miniAria', name))}">${cells(p.days, MINI_WEEKS, fixedLevel, today)}</div>
      <div class="nums"><span${week >= 10 ? ' class="hot"' : ''}><b>${week}</b>${t('d7')}</span><span><b>${p.year}</b>${t('y1')}</span><span><b>${p.total}</b>${t('all')}</span></div>
      <div class="log"><h4>${t('lastUpdate')} <time data-rel="${esc(p.last)}" title="${exact(p.last)}">${rel(p.last)}</time></h4>${log}</div>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    </article>`;
  }).join('') + `<p class="empty" id="none" hidden>${t('none')}</p>`;

  // ── 較早的專案：一格一週 ──
  $('old').innerHTML = older.map((p) => {
    const weeks = Array(WEEKS).fill(0);
    for (const [d, n] of Object.entries(p.days)) {
      const w = Math.floor((dayMs(d) - dayMs(start)) / (7 * DAY));
      if (w >= 0 && w < WEEKS) weeks[w] += n;
    }
    const name = p.private ? `${esc(pTitle(p))}<span class="seal">${t('priv')}</span>` : `<a href="${esc(p.site || p.repo)}">${esc(pTitle(p))} ↗</a>`;
    return `<li class="rv" data-kind="${kindOf(p)}" data-vis="${p.private ? 'private' : 'public'}">
      <div><div class="t">${name}</div><div class="s">${esc(pSummary(p))}</div></div>
      <div class="strip" aria-hidden="true">${weeks.map((n) => `<i data-l="${fixedLevel(Math.ceil(n / 2))}"></i>`).join('')}</div>
      <div class="c">${p.total}<small> commits</small></div>
      <div class="w"><time data-rel="${esc(p.last)}" title="${exact(p.last)}">${rel(p.last)}</time></div>
    </li>`;
  }).join('');

  // ── 都幾點動工 ──
  const bars = (values, label) => {
    const max = Math.max(1, ...values);
    return values.map((v, i) => `<i style="--v:${(v / max).toFixed(3)}"${v === max ? ' class="peak"' : ''} data-tip="<b>${label(i)}</b> · ${t('commits', v)}"></i>`).join('');
  };
  const hours = data.hours || [], wds = data.weekdays || [];
  $('hours').innerHTML = bars(hours, (h) => t('hourRange', h));
  $('weekdays').innerHTML = bars(wds, (d) => t('wdLong', d));
  $('hour-axis').innerHTML = t('hourAxis').map((x) => `<span>${x}</span>`).join('');
  $('wd-axis').innerHTML = t('wdAxis').map((x) => `<span>${x}</span>`).join('');
  if (hours.length) {
    const peakH = hours.indexOf(Math.max(...hours)), peakD = wds.indexOf(Math.max(...wds));
    $('rhythm-note').textContent = t('rhythm', peakH, peakD);
    $('hours').setAttribute('aria-label', t('hoursAria', peakH));
    $('weekdays').setAttribute('aria-label', t('wdAria', peakD));
  }

  applyFilter();
  tipData = { projects };
  if (first) {
    let saved = null;
    try { saved = localStorage.getItem('home-view'); } catch {}
    view = saved === '2d' ? '2d' : '3d';
  }
  setView(view);
  city.update({ sum, today, data, first, active: view === '3d' });
  reveal();
}

// ── 格子提示 ──
let tipData = null;
const tip = $('tip');
function showTip(d, n, breakdown, x, y, extra) {
  let html = `<b>${d.replaceAll('-', '/')}</b> ${t('wd', wdOf(d))} · ${n ? t('commits', n) : t('noCommits')}`;
  if (n && breakdown) {
    const rows = tipData.projects.filter((p) => p.days[d]).sort((a, b) => b.days[d] - a.days[d]);
    const top = rows.slice(0, 5).map((p) => `<li><span>${esc(pTitle(p))}</span><span>${p.days[d]}</span></li>`);
    const rest = n - rows.slice(0, 5).reduce((s, p) => s + p.days[d], 0);
    if (rest > 0) top.push(`<li><span>${t('other')}</span><span>${rest}</span></li>`);
    html += `<ul>${top.join('')}</ul>`;
  }
  if (extra) html += `<span class="x">${extra}</span>`;
  tip.innerHTML = html;
  tip.classList.add('on');
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8)) + 'px';
  tip.style.top = (y - r.height - 14 < 8 ? y + 18 : y - r.height - 14) + 'px';
}
function onPointer(e) {
  if (e.target.id === 'sky') return;
  const el = e.target.closest?.('i[data-d]'), bar = e.target.closest?.('[data-tip]');
  if (el) showTip(el.dataset.d, +el.dataset.n, el.parentElement.dataset.scope === 'all', e.clientX, e.clientY);
  else if (bar) {
    tip.innerHTML = bar.dataset.tip;
    tip.classList.add('on');
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(e.clientX - r.width / 2, innerWidth - r.width - 8)) + 'px';
    tip.style.top = e.clientY - r.height - 14 + 'px';
  } else tip.classList.remove('on');
  const card = e.target.closest?.('.card');
  if (card) {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
}
// 圖示載不到就換成專案名稱的第一個字
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.matches?.('img.ico')) img.replaceWith(Object.assign(document.createElement('span'), { className: 'ico mono', textContent: img.dataset.mono }));
}, true);
document.addEventListener('pointermove', onPointer);
document.addEventListener('pointerdown', onPointer);
addEventListener('scroll', () => { tip.classList.remove('on'); closeDay(); }, { passive: true });

async function load() {
  try {
    const res = await fetch(`data.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const next = await res.json();
    if (data && next.hash === data.hash) return;
    const first = !data;
    data = next;
    render(first);
  } catch (err) {
    if (!data) $('status').textContent = t('loadFail');
    console.error(err);
  }
}
// 用 ?demo= 預覽時不計入訪客統計
load().then(() => track(data, demo.size > 0));
// 頁面開著的時候自己跟上：每 5 分鐘抓一次新資料，每分鐘更新「幾分鐘前」
setInterval(load, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => {
  document.querySelectorAll('time[data-rel]').forEach((t) => { t.textContent = rel(t.dataset.rel); });
  // 沒手動選的話，到了傍晚自動變夜景；太陽月亮、飛機橫幅也跟著時間走
  setMode();
  city.minute();
}, 60000);
