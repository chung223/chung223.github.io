#!/usr/bin/env node
// 部署時把重點內容直接寫進 index.html：數字、專案清單、結構化資料。
// 首頁原本要等瀏覽器執行程式才有內容，搜尋引擎和不跑 JavaScript 的讀者（包含多數 LLM 抓取工具）只會看到空殼。
// 瀏覽器載入後，app.js 會把這些靜態內容換成完整版，所以這裡只需要文字正確，不需要互動。
//
// 用法：node scripts/prerender.mjs <網站資料夾>（裡面要有 index.html 與 data.json）

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { summarize, addDays } from '../skyline.js';

const dir = process.argv[2] || '_site';
const data = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'));
const cfg = JSON.parse(await readFile(new URL('../projects.json', import.meta.url), 'utf8'));
let html = await readFile(join(dir, 'index.html'), 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDay = (iso) => new Date(Date.parse(iso) + (data.utcOffsetMinutes ?? 480) * 60_000).toISOString().slice(0, 10);
const site = `https://${data.owner}.github.io/`;
const sum = summarize(data, data.today);
const cutoff = addDays(data.today, -30);
const active = data.projects.filter((p) => localDay(p.last) >= cutoff);
const older = data.projects.filter((p) => !active.includes(p));

// 找到標記就換掉；找不到代表 index.html 的結構改了，直接失敗，免得靜靜地少了內容
function fill(marker, content) {
  if (!html.includes(marker)) throw new Error(`prerender：index.html 裡找不到 ${marker}`);
  html = html.replace(marker, content);
}

fill('<dl class="ledger" id="ledger"></dl>', `<dl class="ledger" id="ledger">${[
  ['近一年 commits', sum.year.toLocaleString('en-US'), ''],
  ['有動工的日子', sum.activeDays, '天'],
  ['目前連續', sum.streak, '天'],
  ['進行中專案', active.length, '個'],
].map(([k, v, u]) => `<div><dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`).join('')}</dl>`);

const card = (p) => `<article class="card pre">
  <header><h3>${esc(p.title)}</h3>${p.private ? '<span class="seal">非公開</span>' : ''}</header>
  ${p.summary ? `<p class="sum">${esc(p.summary)}</p>` : ''}
  <p class="sum">${[p.lang, ...(p.tags || [])].filter(Boolean).map(esc).join('、')}${p.lang || p.tags?.length ? ' · ' : ''}近一年 ${p.year} 個 commit · 最後更新 ${localDay(p.last)}</p>
  ${p.private ? '' : `<p class="links">${p.site ? `<a href="${esc(p.site)}">網站</a>` : ''}<a href="${esc(p.repo)}">GitHub</a></p>`}
</article>`;
fill('<div class="grid" id="active"></div>', `<div class="grid" id="active">${active.map(card).join('\n')}</div>`);

fill('<ul class="old" id="old"></ul>', `<ul class="old" id="old">${older.map((p) => `<li class="pre">
  <div><div class="t">${p.private ? `${esc(p.title)}<span class="seal">非公開</span>` : `<a href="${esc(p.site || p.repo)}">${esc(p.title)}</a>`}</div><div class="s">${esc(p.summary)}</div></div>
  <div></div><div class="c">${p.total}<small> commits</small></div><div class="w">${localDay(p.last)}</div>
</li>`).join('\n')}</ul>`);
fill('<section class="sec" id="old-sec" hidden>', `<section class="sec" id="old-sec"${older.length ? '' : ' hidden'}>`);

// 結構化資料：這個人是誰、在哪裡找得到、做了哪些東西
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite', '@id': `${site}#site`, url: site, name: 'Chung 的開發手帳', alternateName: 'Chung’s Build Log',
      inLanguage: ['zh-Hant-TW', 'en'], author: { '@id': `${site}#me` },
    },
    {
      '@type': 'Person', '@id': `${site}#me`, name: 'Chung', url: site,
      description: '做 iOS／macOS 原生 App、PWA 與各種小工具的開發者。',
      sameAs: [`https://github.com/${data.owner}`, cfg.links?.linkedin].filter(Boolean),
    },
    {
      '@type': 'ItemList', name: '專案', numberOfItems: data.projects.length,
      itemListElement: data.projects.map((p, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'SoftwareSourceCode', name: p.title, description: p.summary || undefined,
          ...(p.en?.title && p.en.title !== p.title ? { alternateName: p.en.title } : {}),
          ...(p.lang ? { programmingLanguage: p.lang } : {}),
          ...(p.private ? {} : { url: p.site || p.repo, codeRepository: p.repo }),
          author: { '@id': `${site}#me` },
        },
      })),
    },
  ],
};
// </script> 不能出現在 JSON-LD 裡面
fill('</head>', `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n</head>`);

await writeFile(join(dir, 'index.html'), html);
console.log(`prerender：${active.length} 個進行中、${older.length} 個較早的專案寫進 index.html（${(html.length / 1024).toFixed(0)}KB）`);
