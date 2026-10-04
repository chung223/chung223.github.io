# Chung 的開發手帳

個人首頁：https://chung223.github.io/

列出正在開發的專案，每個專案有 commit 熱力圖、最後更新時間和最近改了什麼。
資料由 GitHub Actions 每 15 分鐘自動抓一次，不需要手動維護。

## 怎麼運作

| 檔案 | 用途 |
|---|---|
| `index.html` | 首頁本體，載入 `data.json` 後在瀏覽器端畫出來 |
| `projects.json` | 專案的顯示名稱、簡介、標籤，以及哪些要隱藏 |
| `scripts/build-data.mjs` | 用 GitHub API 抓各 repo 的 commit，產生 `data.json` |
| `.github/workflows/pages.yml` | push 與排程時產生資料並部署；資料沒變就略過部署 |

`data.json` 不進版控，每次部署時重新產生。merge commit 和機器人的自動 commit 不計入。

## 私有專案

私有 repo **預設完全不會出現**。要顯示必須在 `projects.json` 明確列出：

```jsonc
"repo-name": { "title": "顯示名稱", "summary": "一句話簡介", "tags": ["iOS"] }  // 顯示卡片
"repo-name": { "aggregateOnly": true }                                          // 只計入總熱力圖，不列名
```

私有專案只會公開顯示名稱、簡介、語言、每日 commit 數和最後更新時間；
commit 訊息、repo 名稱與網址都不會寫進 `data.json`。

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
