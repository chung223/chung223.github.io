#!/usr/bin/env node
// 部署前的冒煙測試：用真的瀏覽器打開組裝好的網站，確認看得到該有的東西、沒有錯誤。不過就不部署。
//
// 這些檢查都來自實際發生過的事故：樣式被誤刪導致熱力圖消失、夜景時頁面配色沒跟上、
// 模組檔沒加版本參數、英文版殘留中文或沒翻到的字串。
//
// 檢查不依賴「最近有沒有 commit」：就算一個月沒動工，測試也要能過。
//
// 用法：node scripts/smoke-test.mjs <網站資料夾>   （需要 playwright-core 與系統上的 Chrome）

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const dir = process.argv[2] || '_site';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(dir, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || TYPES['.html'] }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const failed = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed.push(name);
}

const CJK = /[一-鿿]/;
const browser = await chromium.launch({ channel: 'chrome' });

async function open(path, { width, height, locale }) {
  const context = await browser.newContext({ viewport: { width, height }, locale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`頁面錯誤：${e.message}`));
  // 外部資源被擋掉會出現「Failed to load resource」，那是測試自己造成的；本機檔案的錯誤另外用回應狀態抓
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console：${m.text()}`); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(base.length)}`); });
  // 字型、天氣、訪客統計這些外部請求一律擋掉，測試才不會受網路影響
  await context.route((url) => !url.href.startsWith(base), (route) => route.abort());
  await page.goto(base + path, { waitUntil: 'load' });
  return { page, errors, context };
}
// canvas 上有畫東西的像素數
const painted = (page, id) => page.evaluate((id) => {
  const cv = document.getElementById(id), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
}, id);
// 等頁面把資料畫出來；畫不出來（程式出錯、檔案缺漏）就記一筆失敗並附上錯誤，不讓整支測試當掉
async function rendered(page, errors, selector, name) {
  const ok = await page.waitForSelector(selector, { timeout: 8000 }).then(() => true, () => false);
  check(name, ok, errors.join(' | ') || `等不到 ${selector}`);
  return ok;
}
const overflows = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

try {
  // ── 1. 桌機、中文、白天 ──
  {
    const { page, errors, context } = await open('/?demo=day', { width: 1280, height: 900, locale: 'zh-TW' });
    if (await rendered(page, errors, '#ledger dd [data-to]', '首頁（桌機）有畫出來')) {
    await page.waitForTimeout(3000);   // 等大樓長完、數字跳完、印章蓋完

    const s = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel), all = (sel) => [...document.querySelectorAll(sel)];
      const mini = q('#active .card .cells');
      return {
        lang: document.documentElement.lang,
        ledger: all('#ledger dd [data-to]').map((e) => e.textContent),
        leftoverPre: all('.pre').length,
        cards: all('#active .card').length, none: !!q('#active #none'),
        miniH: mini ? mini.offsetHeight : null, miniCells: mini ? mini.children.length : null,
        miniCellW: mini ? mini.children[0].offsetWidth : null,
        feed: all('#feed > li').length,
        hourBars: all('#hours i').map((e) => e.offsetHeight), weekdayBars: all('#weekdays i').length,
        skyH: q('#sky').clientHeight, cars: all('.car').length, banner: q('#banner').textContent,
        linkedin: q('.reach a.btn')?.href || '', contact: q('.contact h2')?.textContent || '',
        fontStack: getComputedStyle(document.body).fontFamily,
      };
    });
    check('中文版的 html lang', s.lang === 'zh-Hant-TW', s.lang);
    check('刊頭四個數字都是數字', s.ledger.length === 4 && s.ledger.every((v) => /^[\d,]+$/.test(v)), JSON.stringify(s.ledger));
    check('預先寫進網頁的靜態內容已被換掉', s.leftoverPre === 0, `還剩 ${s.leftoverPre} 個 .pre`);
    check('專案區有卡片或「沒有符合」的提示', s.cards > 0 || s.none);
    if (s.cards) check('卡片上的小熱力圖排成 26 週 × 7 天的格子', s.miniH > 20 && s.miniH < 200 && s.miniCellW > 3 && s.miniCellW < 30 && s.miniCells === 182, `高 ${s.miniH}、格寬 ${s.miniCellW}、格數 ${s.miniCells}`);
    check('最近動態有內容或空狀態', s.feed >= 1);
    check('作息圖：24 根長條而且最高的有高度', s.hourBars.length === 24 && Math.max(...s.hourBars) > 20 && s.weekdayBars === 7);
    check('天際線 canvas 有高度', s.skyH > 150, `${s.skyH}px`);
    check('天際線真的有畫東西', (await painted(page, 'sky')) > 5000);
    check('街上有車、飛機橫幅有字', s.cars >= 1 && s.banner.length > 0);
    check('LinkedIn 連結與聯絡區塊', s.linkedin.includes('linkedin.com/in/') && s.contact.length > 0);
    check('內文用系統字型（沒有載整套中文字型）', !/^"?Noto Sans TC/.test(s.fontStack), s.fontStack);

    await page.click('#v2d');
    const flat = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#hm .cells i')];
      return { n: cells.length, h: cells[10]?.offsetHeight || 0, total: document.getElementById('hm').offsetHeight, skyHidden: document.getElementById('sky-wrap').hidden };
    });
    check('平面檢視：一年份的格子排成 53 週 × 7 天', flat.n >= 364 && flat.h > 4 && flat.h < 40 && flat.total < 400 && flat.skyHidden, JSON.stringify(flat));
    await page.click('#v3d');

    await page.click('#by-proj');
    check('依專案上色：出現圖例', await page.evaluate(() => !document.getElementById('proj-key').hidden && document.querySelectorAll('#proj-key span').length >= 2));
    await page.click('#by-proj');

    if (await page.$('[data-f="private"]')) {
      await page.click('[data-f="private"]');
      const leak = await page.evaluate(() => [...document.querySelectorAll('[data-kind]')].filter((e) => !e.hidden && e.dataset.vis !== 'private' && getComputedStyle(e).display !== 'none').length);
      check('篩選「非公開」後只剩非公開專案', leak === 0, `還看得到 ${leak} 個公開專案`);
      await page.click('[data-f="all"]');
    }
    check('桌機沒有橫向溢出', !(await overflows(page)));
    check('桌機沒有錯誤', errors.length === 0, errors.join(' | '));
    }
    await context.close();
  }

  // ── 2. 手機、英文、夜景 ──
  {
    const { page, errors, context } = await open('/?demo=night', { width: 375, height: 812, locale: 'en-US' });
    if (await rendered(page, errors, '#ledger dd [data-to]', '首頁（手機）有畫出來')) {
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => {
      const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()).filter(Boolean);
      const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
      return {
        lang: document.documentElement.lang, mode: document.documentElement.dataset.mode, brightness: r + g + b,
        // 這些區塊全是介面文字（不含專案名稱與 commit 訊息），英文版不該出現中文
        ui: text('.sec-h h2, .sec-h .note:not(#hm-note), #ledger dt, #filters .chip, footer a, .contact h2, .contact p, #status, #rhythm-note, .lede, .nums, .log h4, .hush'),
        title: document.title,
      };
    });
    check('英文版的 html lang', s.lang === 'en', s.lang);
    check('夜景：整頁是深色（不只城市）', s.mode === 'dark' && s.brightness < 150, `mode=${s.mode} 亮度=${s.brightness}`);
    const cjk = s.ui.filter((v) => CJK.test(v));
    check('英文版的介面沒有殘留中文', cjk.length === 0 && !CJK.test(s.title), cjk.slice(0, 3).join(' | '));
    const rawKeys = s.ui.filter((v) => /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(v));
    check('沒有漏翻的字串（畫面上不該出現字典的 key）', rawKeys.length === 0, rawKeys.join(', '));
    check('夜景的天際線有畫東西', (await painted(page, 'sky')) > 2000);
    check('手機沒有橫向溢出', !(await overflows(page)));

    await page.click('#lang');
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => ({ lang: document.documentElement.lang, h2: document.querySelector('.sec-h h2').textContent }));
    check('切回中文', back.lang === 'zh-Hant-TW' && CJK.test(back.h2), JSON.stringify(back));
    check('手機沒有錯誤', errors.length === 0, errors.join(' | '));
    }
    await context.close();
  }

  // ── 3. 年度回顧 ──
  {
    const { page, errors, context } = await open('/year.html', { width: 1280, height: 900, locale: 'zh-TW' });
    if (await rendered(page, errors, 'section .big', '年度回顧有畫出來')) {
    const s = await page.evaluate(() => ({ sections: document.querySelectorAll('section').length, numbers: document.querySelectorAll('.big [data-to]').length, title: document.title }));
    check('年度回顧：段落與大數字都在', s.sections >= 8 && s.numbers >= 3, JSON.stringify(s));
    await page.click('#lang');
    await page.waitForTimeout(300);
    check('年度回顧可以切換語言', /Year in Review/.test(await page.title()));
    check('年度回顧沒有錯誤', errors.length === 0, errors.join(' | '));
    }
    await context.close();
  }

  // ── 4. 不跑 JavaScript 也讀得到的東西（搜尋引擎、LLM） ──
  {
    const get = async (p) => { const r = await fetch(base + p); return { ok: r.ok, text: r.ok ? await r.text() : '' }; };
    const html = await get('/index.html');
    check('index.html 裡有預先寫好的專案清單與結構化資料', html.text.includes('class="card pre"') && html.text.includes('application/ld+json'));
    const ld = html.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    let ldOk = false;
    try { ldOk = JSON.parse(ld[1])['@graph'].length >= 3; } catch {}
    check('結構化資料是合法的 JSON', ldOk);
    const llms = await get('/llms.txt');
    check('llms.txt 存在而且有內容', llms.ok && llms.text.startsWith('# ') && llms.text.includes('## Active projects'));
    check('sitemap.xml、robots.txt、feed.xml 都在', (await get('/sitemap.xml')).text.includes('<urlset') && (await get('/robots.txt')).text.includes('Sitemap:') && (await get('/feed.xml')).text.includes('<feed'));

    // 隱私：再檢查一次所有對外的文字檔
    const data = JSON.parse((await get('/data.json')).text);
    const leaky = data.projects.filter((p) => p.private && (p.recent || p.log || p.repo));
    check('私有專案沒有 commit 內容或網址', leaky.length === 0, leaky.map((p) => p.title).join(', '));
  }
} finally {
  await browser.close();
  server.close();
}

if (failed.length) {
  console.error(`\n${failed.length} 項沒過：\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('\n全部通過');
