#!/usr/bin/env node
// 產生首頁用的 data.json：每個專案的 commit 熱力圖、最後更新時間、最近改了什麼。
//
// 隱私規則（這支腳本的輸出會公開）：
//   - 私有 repo 預設完全不出現；要在 projects.json 明確列出才會納入。
//   - 私有 repo 只輸出「顯示名稱、簡介、語言、每日 commit 數、最後更新時間」，
//     絕不輸出 commit 訊息、repo 名稱或網址。
//
// 環境變數：
//   STATS_TOKEN   能讀私有 repo 的 token（fine-grained PAT：Contents + Metadata 唯讀）。
//                 沒設就只產生公開 repo 的資料。
//   GITHUB_TOKEN  沒有 STATS_TOKEN 時用來讀公開 repo（Actions 內建）。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('projects.json', ROOT), 'utf8'));
const OWNER = cfg.owner;
const TZ_OFFSET_MIN = cfg.utcOffsetMinutes ?? 480;
const OUT = process.argv[2] || 'data.json';

const STATS_TOKEN = process.env.STATS_TOKEN || '';
const TOKEN = STATS_TOKEN || process.env.GITHUB_TOKEN || '';
const MAX_COMMITS = 5000;
const HEATMAP_DAYS = 53 * 7;
const RECENT_COMMITS = 8;
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
  // 私有 repo 必須在 projects.json 明確列出（有簡介，或標成 aggregateOnly）
  if (repo.private && !entry.summary && !entry.aggregateOnly) return [];
  return [{ repo, entry }];
});

const built = await mapLimit(selected, 6, async ({ repo, entry }) => {
  const commits = await history(repo.name);
  if (!commits.length) return null;
  const days = {};
  let year = 0;
  for (const c of commits) {
    if (Date.parse(c.committedDate) >= yearAgo) year++;
    const d = localDay(c.committedDate);
    if (d >= firstDay) days[d] = (days[d] || 0) + 1;
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
// 內容雜湊不含產生時間與「今天」，排程用它判斷資料有沒有變、要不要重新部署
const hash = createHash('sha256')
  .update(JSON.stringify({ ...body, today: undefined, firstDay: undefined }))
  .digest('hex')
  .slice(0, 16);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date(now).toISOString(), hash, ...body }));
const priv = projects.filter((p) => p.private).length;
console.log(
  `${OUT}: ${projects.length} 個專案（公開 ${projects.length - priv}、私有 ${priv}），` +
    `另有 ${other.count} 個只計入熱力圖，hash=${hash}`,
);
