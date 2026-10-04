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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const built = await mapLimit(selected, 6, async ({ repo, entry }) => {
  const commits = await history(repo.name);
  if (!commits.length) return null;
  const days = {}, log = {};
  let year = 0;
  for (const c of commits) {
    if (Date.parse(c.committedDate) >= yearAgo) year++;
    const d = localDay(c.committedDate);
    if (d < firstDay) continue;
    days[d] = (days[d] || 0) + 1;
    // 每天留最新的幾筆訊息，點大樓時列出來（只有公開 repo 會輸出）
    if ((log[d] ||= []).length < LOG_PER_DAY) log[d].push(c.messageHeadline.slice(0, 100));
  }
  const stats = { total: commits.length, year, last: commits[0].committedDate, days };
  if (entry.aggregateOnly) return { aggregateOnly: true, ...stats };

  const project = {
    title: entry.title || repo.name,
    summary: entry.summary ?? repo.description ?? '',
    private: repo.private,
    lang: repo.language || null,
    tags: entry.tags || [],
    ...stats,
  };
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

const body = { owner: OWNER, utcOffsetMinutes: TZ_OFFSET_MIN, firstDay, today, projects, other };
// 生日（MM-DD，可不設）：當天首頁會飄氣球
if (cfg.birthday) body.birthday = cfg.birthday;
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
