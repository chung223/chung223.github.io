# 給 agent 的注意事項

這個 repo 是 https://chung223.github.io/ 的原始碼。網站會自動列出 chung223 名下的專案，
每 15 分鐘由 GitHub Actions 重抓一次。架構與設定方式見 [README.md](README.md)。

## 最重要的一件事：這裡的輸出全部是公開的

`projects.json`、`data.json`、產生的 SVG／PNG 都會被部署到公開網站，這個 repo 本身也是公開的。

- **私有 repo 會自動列出。** 沒有另外設定時，顯示名稱是 repo 名稱、簡介是 GitHub 上的 description。
  所以私有 repo 的**名稱與 description 等於公開**。
- **私有 repo 的 commit 訊息、網址絕不能輸出。** `scripts/build-data.mjs` 只在 `!repo.private` 時寫入
  `recent`、`log`、`repo`。改這支腳本後，務必確認 `data.json` 裡私有專案沒有這三個欄位。
- 在 `projects.json` 幫私有專案寫 `title`／`summary` 時，寫成可以公開的一句話。
  不要放客戶或單位名稱、內部系統細節、帳號、網址。工作相關的專案寫得含糊一點。

## 在別的專案裡建立或推送新 repo 時

只要是在 chung223 帳號下，下一次排程（最多 15 分鐘）它就會出現在首頁。

1. **description 寫成可以公開的內容。** 私有 repo 也一樣。
2. **不該公開的 repo，在建立之前先到這個 repo 的 `projects.json` 加設定**（repo 還不存在也可以先寫）：
   - `"<repo 名稱>": { "hide": true }`：完全不出現。
   - `"<repo 名稱>": { "aggregateOnly": true }`：只把 commit 數計入總熱力圖，不列名。
3. 拿不準該不該公開就先問使用者，或先標 `hide`，之後再打開。
4. 想要比 repo 名稱更好的顯示名稱或中文簡介，加
   `"<repo 名稱>": { "title": "…", "summary": "…", "tags": ["iOS"] }`。

幫專案加設定時，順手補上 `summary_en`（名稱是中文的話再加 `title_en`），英文版才不會出現中文。

fork 與封存的 repo 不會列出（要列就加 `"include": true`）。

## 改這個 repo 時

- 本機預覽：`STATS_TOKEN="$(gh auth token)" node scripts/build-data.mjs data.json`，再 `python3 -m http.server 4173`。
  `data.json` 與產生的圖檔不進版控。
- `skyline.js` 同時被瀏覽器和 Node 載入（首頁 canvas、README 用的 SVG、分享預覽圖共用），不要在裡面用只有其中一邊有的 API。
- 平常看不到的狀態用 `?demo=` 預覽，清單在 README 的「城市裡的彩蛋」。
- 改 CSS 之後，除了立體天際線，也要看一眼卡片上的小熱力圖和「平面」檢視（曾經在整理樣式時被誤刪過）。
- 部署時 workflow 會替 `./skyline.js`、`./city.js` 的 import 加上版本參數。新增頁面或模組檔時要一起加進
  `.github/workflows/pages.yml` 的複製與 `sed` 步驟，否則線上會 404 或配到快取的舊版。
- 介面上的文字一律放 `i18n.js`，中英文都要有；不要把字串直接寫在 `index.html`、`app.js`、`city.js`、`year.html` 裡。
- 首頁拆成 `index.html`（標記）、`styles.css`、`app.js`。不要再把樣式或程式塞回 `index.html`。
- 改完跑一次 `npm run site && npm test`（見 README 的「測試」）。新增會影響畫面的功能時，順手在 `scripts/smoke-test.mjs` 補一條檢查。
- 新增要部署的檔案時，`.github/workflows/pages.yml` 的複製清單和 `package.json` 的 `site` 指令都要加。
- 走 PR，不直接推 `main`。合併後看一次部署有沒有成功。
