# Chung 的開發手帳

個人首頁：https://chung223.github.io/

列出正在開發的專案，每個專案有 commit 熱力圖、最後更新時間和最近改了什麼。
資料由 GitHub Actions 自動抓，不需要手動維護（實際頻率見下面的「更新頻率」）。

## 怎麼運作

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁的骨架（標記） |
| `styles.css` | 首頁的樣式 |
| `app.js` | 首頁的主程式：載入 `data.json`，畫出數字、熱力圖、動態、卡片，並接上城市 |
| `skyline.js` | 天際線的版面與圖形，首頁（canvas）和 README 用的 SVG 共用 |
| `analytics.js` | 訪客統計的載入（首頁與年度回顧共用） |
| `i18n.js` | 中英文字典與語言切換（首頁、年度回顧、城市共用） |
| `year.html` | 年度回顧：過去 365 天的總數、最長連續、最高的一棟、前五名專案、作息 |
| `city.js` | 首頁城市裡會動、會互動的部分：依台北時間的天空與工人作息、飛機橫幅、車、放大鏡、特效與季節彩蛋 |
| `projects.json` | 專案的顯示名稱、簡介、標籤，以及哪些要隱藏 |
| `scripts/build-data.mjs` | 用 GitHub API 抓各 repo 的 commit，產生 `data.json` |
| `scripts/prerender.mjs` | 部署時把數字、專案清單、結構化資料寫進 `index.html`，給搜尋引擎與不跑 JavaScript 的讀者 |
| `scripts/smoke-test.mjs` | 部署前用真的瀏覽器打開網站做檢查，沒過就不部署 |
| `.github/workflows/pages.yml` | push 與排程時產生資料並部署；資料沒變就略過部署 |

`data.json` 不進版控，每次部署時重新產生。同時會產生 `skyline-{light,dark}.svg` 與
`projects-{light,dark}.svg`，給 GitHub 個人頁（`chung223/chung223` 的 README）嵌入。merge commit 和機器人的自動 commit 不計入。

## 私有專案

私有 repo **會自動列出**（`projects.json` 的 `"autoListPrivate": true`）。沒有另外設定時，
顯示名稱就是 repo 名稱、簡介就是 GitHub 上的 description，所以**這兩樣等於公開**。

```jsonc
"repo-name": { "title": "顯示名稱", "summary": "一句話簡介", "tags": ["iOS"] }  // 換成比較好的名稱與簡介
"repo-name": { "aggregateOnly": true }                                          // 只計入總熱力圖，不列名
"repo-name": { "hide": true }                                                   // 完全不出現
```

不想公開的 repo 要**在建立之前**先加 `hide` 或 `aggregateOnly`（設定可以先寫，repo 還不存在也沒關係），
否則下一次同步它就會出現在首頁（最快 15 分鐘）。把 `autoListPrivate` 改成 `false` 可以回到「沒列的一律不出現」。

私有專案只會公開顯示名稱、簡介、語言、每日 commit 數和最後更新時間；
commit 訊息與網址不會寫進 `data.json`。給其他 agent 的注意事項在 [AGENTS.md](AGENTS.md)。

公開 repo 會自動列出（fork 與封存的除外），不想列的加 `{ "hide": true }`。

## 訪客統計

用 [GoatCounter](https://www.goatcounter.com/)（不用 cookie、不追蹤個人）。到那邊免費註冊、選一個代號，
填進 `projects.json` 的 `"analytics": { "goatcounter": "你的代號" }` 就會開始統計；留空就不載入任何統計程式。
首頁與年度回顧都會統計；只在正式網址上，本機預覽與 `?demo=` 不算。

## 字型與效能

內文用系統內建的中文字型，只有標題的楷體（LXGW WenKai TC）和數字的等寬字（DM Mono）從 Google Fonts 載，
而且不擋首次顯示。城市整張重畫一次約 1–2 毫秒，每半秒一次，不需要另外快取。

## 英文版

右上角的「EN／中」可以切換語言，預設照瀏覽器語言，選擇會記住。介面文字在 `i18n.js`；
專案的英文名稱與簡介寫在 `projects.json` 的 `title_en`、`summary_en`（沒寫就沿用中文）。
commit 訊息、README 用的圖和週報不翻譯。

## 更新頻率

排程設定是每 15 分鐘，但 **GitHub 會節流免費的排程**。2026-10-04 到 10-05 實測：27 小時只執行了 6 次，
間隔 2.7–7 小時，中位數約 3 小時。所以新的 commit 通常要幾個小時後才會出現在首頁。

要接近即時，需要由外部準時呼叫這個 workflow。任何能定時發 HTTP 請求的地方都可以（自己的主機的 crontab、
cron-job.org 之類的服務）：

```bash
# 每 15 分鐘一次。TOKEN 是只對這個 repo 有「Actions: Read and write」權限的 fine-grained PAT
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/chung223/chung223.github.io/actions/workflows/pages.yml/dispatches \
  -d '{"ref":"main","inputs":{"auto":"true"}}'
```

`auto: true` 代表資料沒變就略過部署，所以頻繁呼叫不會造成頻繁部署。

## 設定 token（只需一次）

要讀私有 repo，需要一組 fine-grained personal access token：

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
2. Repository access 選 **All repositories**；Permissions 給 **Contents: Read-only**、**Metadata: Read-only**
3. 存成這個 repo 的 secret：`gh secret set STATS_TOKEN --repo chung223/chung223.github.io`

沒有設定時網站照常運作，只是只會列出公開專案。

## 給搜尋引擎與 LLM

- `index.html` 在部署時會預先寫入內容與 JSON-LD（Person、WebSite、專案清單）。
- `sitemap.xml`、`robots.txt` 每次部署重新產生。
- `llms.txt`（[llmstxt.org](https://llmstxt.org) 的格式）：用英文寫的整站摘要，含聯絡方式、一年的統計、每個專案一行說明，以及 `data.json` 等機器可讀資料的位置。聯絡用的 LinkedIn 網址設在 `projects.json` 的 `links.linkedin`。

## 測試

部署前會跑 `scripts/smoke-test.mjs`：桌機中文白天、手機英文夜景、年度回顧各開一次，檢查熱力圖格子的排列、
夜景整頁是深色、英文版沒有殘留中文或漏翻的字串、沒有錯誤訊息與缺檔、私有專案沒有外洩。本機跑法：

```bash
npm install --no-save playwright-core   # 第一次
STATS_TOKEN="$(gh auth token)" npm run site && npm test
```

需要系統上有 Chrome。檢查不依賴最近有沒有 commit，久沒動工也要能過。

## 本機預覽

```bash
STATS_TOKEN="$(gh auth token)" node scripts/build-data.mjs data.json
python3 -m http.server 4173
```

## 城市裡的彩蛋

- **時間**：太陽月亮照台北時間移動，傍晚有晚霞，18:30–05:30 自動變夜景（右上角按鈕可以手動切換，只影響這次造訪）。
- **工人作息**：白天施工、12–13 點吃便當、晚上收工；晚上兩小時內還有 commit 就顯示「加班中」。
- **新 commit**：頁面開著時抓到今天的 commit 變多，今天那棟樓會長高、工人歡呼、撒彩帶。
- **里程碑**：一年中最高的那棟插旗；連續動工每滿 7 天的晚上放煙火；連續沒動工越久，綠地越茂密。
- **互動**：點大樓看當天各專案的 commit；點工人打招呼（每次換一句）；街上的車數量跟最近七天的 commit 數成正比。
- **天氣**：照台北的即時天氣（Open-Meteo）：下雨就下雨、工人撐傘；雷雨會閃電；颱風天工人停工。
- **依專案上色**：commit 最多的六個專案各一個顏色，每棟樓塗上當天最主要那個專案的顏色。
- **尖峰時段**：現在如果是一年裡最常動工的三個鐘頭之一，街上的車加倍、開得慢。
- **季節**：12–2 月下雪；春節（除夕到元宵）掛燈籠；`projects.json` 設定 `"birthday": "MM-DD"` 的話當天飄氣球（會公開）。

平常看不到的狀態可以用網址參數預覽，逗號可以組合：

```
?demo=night,fireworks   ?demo=snow   ?demo=newyear   ?demo=birthday
?demo=dusk   ?demo=lunch   ?demo=overtime   ?demo=off   ?demo=commit
?demo=rain   ?demo=storm   ?demo=typhoon   ?demo=debug（把內部狀態掛到 window.__city）
```

部署時會把 `og.svg` 轉成 `og.png`（1200×630），作為貼到社群時的預覽圖。

## 其他產出

- `feed.xml`：週報（Atom）。最近八個完整的週各一篇，列出每個專案的 commit 數；公開專案附訊息，私有專案只有數量。
- `data.json` 的 `hours`／`weekdays`：一年內 commit 落在哪個鐘頭、星期幾（全部專案加總，不分專案）。
- 專案圖示：公開專案會從它的網站抓 apple-touch-icon；私有專案可在 `projects.json` 用 `"icon": "https://…"` 指定。
