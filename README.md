# Chung 的開發手帳

個人首頁：https://chung223.github.io/

列出正在開發的專案，每個專案有 commit 熱力圖、最後更新時間和最近改了什麼。
資料由 GitHub Actions 每 15 分鐘自動抓一次，不需要手動維護。

## 怎麼運作

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁本體，載入 `data.json` 後在瀏覽器端畫出來 |
| `skyline.js` | 天際線的版面與圖形，首頁（canvas）和 README 用的 SVG 共用 |
| `city.js` | 首頁城市裡會動、會互動的部分：依台北時間的天空與工人作息、飛機橫幅、車、放大鏡、特效與季節彩蛋 |
| `projects.json` | 專案的顯示名稱、簡介、標籤，以及哪些要隱藏 |
| `scripts/build-data.mjs` | 用 GitHub API 抓各 repo 的 commit，產生 `data.json` |
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
否則最多 15 分鐘內它就會出現在首頁。把 `autoListPrivate` 改成 `false` 可以回到「沒列的一律不出現」。

私有專案只會公開顯示名稱、簡介、語言、每日 commit 數和最後更新時間；
commit 訊息與網址不會寫進 `data.json`。給其他 agent 的注意事項在 [AGENTS.md](AGENTS.md)。

公開 repo 會自動列出（fork 與封存的除外），不想列的加 `{ "hide": true }`。

## 設定 token（只需一次）

要讀私有 repo，需要一組 fine-grained personal access token：

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
2. Repository access 選 **All repositories**；Permissions 給 **Contents: Read-only**、**Metadata: Read-only**
3. 存成這個 repo 的 secret：`gh secret set STATS_TOKEN --repo chung223/chung223.github.io`

沒有設定時網站照常運作，只是只會列出公開專案。

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
- **季節**：12–2 月下雪；春節（除夕到元宵）掛燈籠；`projects.json` 設定 `"birthday": "MM-DD"` 的話當天飄氣球（會公開）。

平常看不到的狀態可以用網址參數預覽，逗號可以組合：

```
?demo=night,fireworks   ?demo=snow   ?demo=newyear   ?demo=birthday
?demo=dusk   ?demo=lunch   ?demo=overtime   ?demo=off   ?demo=commit
```

部署時會把 `og.svg` 轉成 `og.png`（1200×630），作為貼到社群時的預覽圖。
