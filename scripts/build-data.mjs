#!/usr/bin/env node
// 產生首頁用的 data.json：每個專案的 commit 熱力圖、最後更新時間、最近改了什麼。
//
// 隱私規則（這支腳本的輸出會公開）：
//   - 私有 repo 預設會自動列出（projects.json 的 autoListPrivate），沒另外設定時
//     顯示名稱就是 repo 名稱、簡介就是 GitHub 上的 description，所以這兩樣等於公開。
//     不想列的在 projects.json 標 hide 或 aggregateOnly。
//   - 私有 repo 只輸出「顯示名稱、簡介、語言、每日 commit 數、最後更新時間」，
//     絕不輸出 commit 訊息或網址。
//
// 環境變數：
//   STATS_TOKEN   能讀私有 repo 的 token（fine-grained PAT：Contents + Metadata 唯讀）。
//                 沒設就只產生公開 repo 的資料。
//   GITHUB_TOKEN  沒有 STATS_TOKEN 時用來讀公開 repo（Actions 內建）。

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { addDays, wdOf, summarize, layout, toSVG, listSVG, ogSVG, PALETTES } from '../skyline.js';

const ROOT = new URL('../', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('projects.json', ROOT), 'utf8'));
const OWNER = cfg.owner;
const TZ_OFFSET_MIN = cfg.utcOffsetMinutes ?? 480;
const OUT = process.argv[2] || 'data.json';

const STATS_TOKEN = process.env.STATS_TOKEN || '';
const TOKEN = STATS_TOKEN || process.env.GITHUB_TOKEN || '';
const AUTO_LIST_PRIVATE = cfg.autoListPrivate ?? false;
const MAX_COMMITS = 5000;
const HEATMAP_DAYS = 53 * 7;
const RECENT_COMMITS = 8;
const LOG_PER_DAY = 3;
const BOT = /github-actions|\[bot\]|dependabot|renovate/i;

let tokenExpires = '';
async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': `${OWNER}-homepage`,
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  // PAT 的到期時間會放在這個 header，留給 workflow 在快到期時提醒
  tokenExpires ||= res.headers.get('github-authentication-token-expiration') || '';
  return res.json();
}

async function listRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const path = STATS_TOKEN
      ? `/user/repos?affiliation=owner&visibility=all&per_page=100&page=${page}`
      : `/users/${OWNER}/repos?type=owner&per_page=100&page=${page}`;
    const batch = await api(path);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => r.owner.login === OWNER);
}

const HISTORY = `
query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{ target{ ... on Commit{
      history(first:100, after:$after){
        pageInfo{ hasNextPage endCursor }
        nodes{ committedDate messageHeadline parents{ totalCount } author{ name email } }
      }
    }}}
  }
}`;

async function history(name) {
  const commits = [];
  let after = null;
  while (commits.length < MAX_COMMITS) {
    const { data, errors } = await api('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: HISTORY, variables: { owner: OWNER, name, after } }),
    });
    if (errors) throw new Error(`${name}: ${JSON.stringify(errors)}`);
    const h = data.repository?.defaultBranchRef?.target?.history;
    if (!h) break; // 空 repo
    commits.push(...h.nodes);
    if (!h.pageInfo.hasNextPage) break;
    after = h.pageInfo.endCursor;
  }
  // merge commit 和機器人（排程自動更新資料的那種）不算開發活動
  return commits.filter(
    (c) => c.parents.totalCount < 2 && !BOT.test(`${c.author?.name} ${c.author?.email}`),
  );
}

// 從公開網站的 HTML 找圖示（apple-touch-icon 優先），找不到就算了
async function findIcon(site) {
  try {
    const res = await fetch(site, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': `${OWNER}-homepage` } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 60_000);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const pick = (re) => links.find((l) => re.test(l))?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = pick(/rel\s*=\s*["'][^"']*apple-touch-icon/i) || pick(/rel\s*=\s*["'][^"']*\bicon\b/i);
    if (!href || href.startsWith('data:')) return null;
    return new URL(href, res.url).href;
  } catch {
    return null;
  }
}

const localDay = (iso) =>
  new Date(Date.parse(iso) + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const now = Date.now();
const today = localDay(new Date(now).toISOString());
const firstDay = localDay(new Date(now - (HEATMAP_DAYS - 1) * 86_400_000).toISOString());
const yearAgo = now - 365 * 86_400_000;

const repos = await listRepos();
if (!STATS_TOKEN) console.warn('⚠ 沒有 STATS_TOKEN：只會產生公開 repo 的資料');

const selected = repos.flatMap((repo) => {
  const entry = cfg.projects?.[repo.name] ?? {};
  if (entry.hide) return [];
  if ((repo.fork || repo.archived) && !entry.include) return [];
  // autoListPrivate 關掉時，私有 repo 必須在 projects.json 明確列出（有簡介，或標成 aggregateOnly）
  if (repo.private && !AUTO_LIST_PRIVATE && !entry.summary && !entry.aggregateOnly) return [];
  return [{ repo, entry }];
});

const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
const built = await mapLimit(selected, 6, async ({ repo, entry }) => {
  const commits = await history(repo.name);
  if (!commits.length) return null;
  const days = {}, log = {};
  let year = 0;
  for (const c of commits) {
    const ms = Date.parse(c.committedDate);
    if (ms >= yearAgo) {
      year++;
      // 幾點、星期幾動工：只留全部專案加總的分布，不分專案
      const local = new Date(ms + TZ_OFFSET_MIN * 60_000);
      hours[local.getUTCHours()]++;
      weekdays[local.getUTCDay()]++;
    }
    const d = localDay(c.committedDate);
    if (d < firstDay) continue;
    days[d] = (days[d] || 0) + 1;
    // 每天留最新的幾筆訊息，點大樓時列出來（只有公開 repo 會輸出）
    if ((log[d] ||= []).length < LOG_PER_DAY) log[d].push(c.messageHeadline.slice(0, 100));
  }
  const stats = { total: commits.length, year, last: commits[0].committedDate, first: localDay(commits.at(-1).committedDate), days };
  if (entry.aggregateOnly) return { aggregateOnly: true, ...stats };

  const project = {
    title: entry.title || repo.name,
    summary: entry.summary ?? repo.description ?? '',
    private: repo.private,
    lang: repo.language || null,
    tags: entry.tags || [],
    ...stats,
  };
  if (entry.icon) project.icon = entry.icon;
  // 英文版的名稱與簡介（projects.json 的 title_en／summary_en）
  if (entry.title_en || entry.summary_en) project.en = { title: entry.title_en, summary: entry.summary_en };
  if (repo.private) {
    if (entry.url) project.site = entry.url;
  } else {
    project.repo = repo.html_url;
    const pages =
      repo.name === `${OWNER}.github.io`
        ? `https://${OWNER}.github.io/`
        : `https://${OWNER}.github.io/${repo.name}/`;
    const site = entry.url || repo.homepage || (repo.has_pages ? pages : undefined);
    if (site && site !== repo.html_url) project.site = site;
    if (project.site && !project.icon) project.icon = await findIcon(project.site);
    if (!project.icon) delete project.icon;
    project.recent = commits
      .slice(0, RECENT_COMMITS)
      .map((c) => ({ t: c.committedDate, m: c.messageHeadline.slice(0, 140) }));
    project.log = log;
  }
  return project;
});

const projects = built
  .filter((p) => p && !p.aggregateOnly)
  .sort((a, b) => b.last.localeCompare(a.last));

// 不列卡片、只併入總熱力圖的專案：合成一筆匿名資料
const other = { count: 0, total: 0, year: 0, days: {} };
for (const p of built.filter((p) => p?.aggregateOnly)) {
  other.count++;
  other.total += p.total;
  other.year += p.year;
  for (const [d, n] of Object.entries(p.days)) other.days[d] = (other.days[d] || 0) + n;
}

const body = { owner: OWNER, utcOffsetMinutes: TZ_OFFSET_MIN, firstDay, today, projects, other, hours, weekdays };
// 生日（MM-DD，可不設）：當天首頁會飄氣球
if (cfg.birthday) body.birthday = cfg.birthday;
// 訪客統計（GoatCounter 的代號，可不設）
if (cfg.analytics?.goatcounter) body.goatcounter = cfg.analytics.goatcounter;
// ── 部署前的最後一關：私有專案不該帶的東西一樣都不能出現，有就直接失敗、不部署 ──
const PRIVATE_KEYS = new Set(['title', 'summary', 'private', 'lang', 'tags', 'total', 'year', 'last', 'first', 'days', 'site', 'icon', 'en']);
const privateUrls = selected.filter(({ repo }) => repo.private).map(({ repo }) => repo.html_url);
function assertNoLeak(text, where) {
  const hit = privateUrls.find((u) => text.includes(u));
  if (hit) throw new Error(`隱私檢查失敗：${where} 含有私有 repo 的網址`);
}
for (const p of projects.filter((p) => p.private)) {
  const extra = Object.keys(p).filter((k) => !PRIVATE_KEYS.has(k));
  if (extra.length) throw new Error(`隱私檢查失敗：私有專案「${p.title}」多了不該公開的欄位 ${extra.join(', ')}`);
}
assertNoLeak(JSON.stringify(body), 'data.json');

// 內容雜湊不含產生時間，排程用它判斷資料有沒有變、要不要重新部署
const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date(now).toISOString(), hash, ...body }));
const priv = projects.filter((p) => p.private).length;
console.log(
  `${OUT}: ${projects.length} 個專案（公開 ${projects.length - priv}、私有 ${priv}），` +
    `另有 ${other.count} 個只計入熱力圖，hash=${hash}`,
);

// ── GitHub 個人頁 README 用的圖：天際線 + 進行中的專案，淺色深色各一張 ──
const sum = summarize(body, today);
const stamp = new Date(now + TZ_OFFSET_MIN * 60_000).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
const strip = addDays(today, -wdOf(today) - 25 * 7);
const rows = projects
  .filter((p) => localDay(p.last) >= addDays(today, -30))
  .slice(0, 10)
  .map((p) => {
    const weeks = Array(26).fill(0);
    for (const [d, n] of Object.entries(p.days)) {
      const w = Math.floor((Date.parse(d) - Date.parse(strip)) / (7 * 86_400_000));
      if (w >= 0) weeks[w] += n;
    }
    const last = localDay(p.last);
    return { title: p.title, private: p.private, weeks, year: p.year, last: `${+last.slice(5, 7)}/${+last.slice(8)}` };
  });
for (const mode of ['light', 'dark']) {
  const lay = layout({ total: sum.total, level: sum.level, today, W: 860, weeks: 53 });
  const skyline = toSVG(lay, PALETTES[mode], {
    label: `過去一年的 commit 天際線：共 ${sum.year} 個 commit，${sum.activeDays} 天有動工`,
    caption: `近一年 ${sum.year.toLocaleString('en-US')} 個 commit · ${sum.activeDays} 天有動工 · 目前連續 ${sum.streak} 天 · 更新於 ${stamp}`,
  });
  const list = listSVG(rows, PALETTES[mode], { caption: '私＝非公開專案，只顯示 commit 數量 · 每格一週，共 26 週' });
  await writeFile(join(dirname(OUT), `skyline-${mode}.svg`), skyline);
  await writeFile(join(dirname(OUT), `projects-${mode}.svg`), list);
  console.log(`skyline-${mode}.svg ${(skyline.length / 1024).toFixed(0)}KB、projects-${mode}.svg ${(list.length / 1024).toFixed(0)}KB`);
}

// ── 社群分享預覽圖：og.svg，部署時再轉成 og.png ──
await writeFile(join(dirname(OUT), 'og.svg'), ogSVG(
  layout({ total: sum.total, level: sum.level, today, W: 1100, weeks: 53 }),
  PALETTES.light,
  {
    title: 'Chung 的開發手帳',
    sub: '正在做的 App、PWA 與小工具，自動更新的 commit 天際線',
    stats: `近一年 ${sum.year.toLocaleString('en-US')} 個 commit · ${sum.activeDays} 天有動工 · 連續 ${sum.streak} 天`,
  },
));

// ── 週報（Atom）：最近八個完整的週（週一到週日），每週一篇 ──
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const site = `https://${OWNER}.github.io/`;
const monday = addDays(today, -((wdOf(today) + 6) % 7));   // 本週一；本週還沒過完，不出
const entries = [];
for (let w = 1; w <= 8; w++) {
  const from = addDays(monday, -7 * w), to = addDays(from, 6);
  const inWeek = (d) => d >= from && d <= to;
  const rowsOfWeek = projects
    .map((p) => ({
      p,
      n: Object.entries(p.days).reduce((s, [d, n]) => s + (inWeek(d) ? n : 0), 0),
      msgs: p.private ? [] : Object.entries(p.log || {}).filter(([d]) => inWeek(d)).sort().reverse().flatMap(([, m]) => m).slice(0, 3),
    }))
    .filter((r) => r.n)
    .sort((a, b) => b.n - a.n);
  const hidden = Object.entries(other.days).reduce((s, [d, n]) => s + (inWeek(d) ? n : 0), 0);
  const count = rowsOfWeek.reduce((s, r) => s + r.n, 0) + hidden;
  if (!count) continue;
  const items = rowsOfWeek.map((r) =>
    `<li><b>${esc(r.p.title)}</b>${r.p.private ? '（非公開）' : ''}：${r.n} 個 commit${r.msgs.length ? `<br>${r.msgs.map(esc).join('<br>')}` : ''}</li>`);
  if (hidden) items.push(`<li>其他非公開專案：${hidden} 個 commit</li>`);
  const range = `${+from.slice(5, 7)}/${+from.slice(8)}–${+to.slice(5, 7)}/${+to.slice(8)}`;
  entries.push(
    `<entry><id>tag:${OWNER}.github.io,${from.slice(0, 4)}:week-${from}</id>`
    + `<title>${range} 週報：${count} 個 commit、${rowsOfWeek.length} 個專案</title>`
    + `<updated>${addDays(to, 1)}T00:00:00+08:00</updated><link href="${site}"/>`
    + `<content type="html">${esc(`<p>${range} 這一週共 ${count} 個 commit，動了 ${rowsOfWeek.length} 個專案。</p><ul>${items.join('')}</ul>`)}</content></entry>`,
  );
}
const feed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Chung 的開發手帳 · 週報</title>`
  + `<id>${site}feed.xml</id><link href="${site}"/><link rel="self" href="${site}feed.xml"/>`
  + `<updated>${monday}T00:00:00+08:00</updated><author><name>Chung</name></author>${entries.join('')}</feed>\n`;
assertNoLeak(feed, 'feed.xml');
await writeFile(join(dirname(OUT), 'feed.xml'), feed);
console.log(`feed.xml：${entries.length} 篇週報`);

// ── 給搜尋引擎：sitemap.xml、robots.txt ──
await writeFile(join(dirname(OUT), 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
  + [site, `${site}year.html`].map((u) => `<url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('')
  + `</urlset>\n`);
await writeFile(join(dirname(OUT), 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);

// ── 給 LLM：llms.txt（https://llmstxt.org 的格式），用英文寫，專案附中文名稱 ──
const LINKEDIN = cfg.links?.linkedin;
const peakHour = hours.indexOf(Math.max(...hours)), peakDay = weekdays.indexOf(Math.max(...weekdays));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const activeCut = addDays(today, -30);
const line = (p) => {
  const name = p.en?.title && p.en.title !== p.title ? `${p.en.title} (${p.title})` : p.title;
  const link = p.private ? `**${name}** (private)` : `[${name}](${p.site || p.repo})`;
  const meta = [p.lang, ...(p.tags || [])].filter(Boolean).join(', ');
  return `- ${link}: ${p.en?.summary || p.summary || 'No description.'}${meta ? ` Tech: ${meta}.` : ''} ${p.year} commits in the past year; last commit ${localDay(p.last)}.${!p.private && p.site ? ` Source: ${p.repo}` : ''}`;
};
const llms = `# Chung's Build Log (Chung 的開發手帳)

> Personal site of Chung (GitHub: ${OWNER}), a developer who builds native iOS and macOS apps, PWAs and small tools. The site is a self-updating build log: every project is listed with a commit heatmap, its last update, and recent changes, regenerated from GitHub several times a day. Times are in UTC+${TZ_OFFSET_MIN / 60} (Asia/Taipei).

This file is generated on every deploy. Figures below are as of ${today}.

## Contact

${LINKEDIN ? `- [LinkedIn](${LINKEDIN}): the best way to reach Chung about projects, collaboration or job opportunities\n` : ''}- [GitHub](https://github.com/${OWNER}): source code for the public projects

## The past 365 days

- ${sum.year.toLocaleString('en-US')} commits across ${projects.length + other.count} projects
- Active on ${sum.activeDays} of 365 days; current streak ${sum.streak} days
- Most commits land around ${peakHour}:00 and on ${WEEKDAYS[peakDay]}s
- Languages by number of projects: ${Object.entries(projects.reduce((m, p) => (p.lang ? { ...m, [p.lang]: (m[p.lang] || 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')}

## Active projects (commits in the last 30 days)

${projects.filter((p) => localDay(p.last) >= activeCut).map(line).join('\n')}

## Earlier projects

${projects.filter((p) => localDay(p.last) < activeCut).map(line).join('\n') || '- None.'}

## Machine-readable data

- [data.json](${site}data.json): everything the site renders. Per project: title, summary, English title and summary under \`en\`, language, tags, commits per day for the past year, first and last commit dates. Public projects also carry recent commit messages. Site-wide: commits by hour of day and by weekday.
- [feed.xml](${site}feed.xml): Atom feed with one entry per week summarizing commits per project
- [Year in review](${site}year.html): totals, longest streak, busiest day, top projects

## Notes

- Projects marked private are closed-source. Only their name, one-line summary and commit counts are published; commit messages and repository URLs are not.
- Commit counts exclude merge commits and automated commits from bots.
- ${other.count} more private projects are counted in the totals without being listed by name.
`;
assertNoLeak(llms, 'llms.txt');
await writeFile(join(dirname(OUT), 'llms.txt'), llms);
console.log(`llms.txt ${(llms.length / 1024).toFixed(1)}KB、sitemap.xml、robots.txt`);

if (process.env.GITHUB_OUTPUT && STATS_TOKEN) {
  await appendFile(process.env.GITHUB_OUTPUT, `token_expires=${tokenExpires}\n`);
}
