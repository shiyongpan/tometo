# 第 1 塊：專案骨架＋發佈

- 狀態：已確認
- 版本：v0.5
- 討論輪次：R5

## 一句話描述
把 tometo 從「只有 docs/」變成「有三層空殼、本機伺服器、兩套測試框架、推上 main 就自動測試並發佈到 GitHub Pages」的專案；做完後 https://shiyongpan.github.io/tometo/ 打得開（只有占位畫面，沒有任何遊戲功能）。

這是 v0.1 里程碑切成多塊後的第一塊。之後各塊（掛機、存檔、偽裝……）都建立在這個骨架上。

## 上游對應
- 實現的需求：本塊是基礎建設，沒有對應的 SYS。它建立後續需求要用的條件：
  - 限制條件：CON-001（ES modules、不建置、無外部套件；發佈時改寫 `index.html` 路徑不算建置）、CON-002（工具只用 Node 22+ 內建模組）、CON-003（`load` 之後零網路請求）、CON-004（GitHub Pages）、CON-005（Chrome／Edge）、CON-006（不含公司資訊）
  - 品質情境：QS-040（`core` 能在 Node 直接載入）、QS-061（CDP 監看 `load` 後請求數為 0；本塊建好框架並對占位頁驗證一次）、QS-031（本塊不量測，見「明確不做」）
- 必須遵守的 ADR：
  - ADR-0001：三層（`data`／`core`／`shell`），`core` 是純函式、副作用都在 `shell`
  - ADR-0003：ES modules＋每檔 `// @ts-check`＋JSDoc、不建置、無外部套件、所有模組靜態 `import`、有 `tools/serve.mjs`
  - ADR-0004：push 到 `main` 後 Actions 先跑 `node --test`，通過才發佈，只發佈遊戲檔
  - ADR-0006：加測試檢查 `src/core/` 沒有 `Date.now`、`new Date`、`Math.random`、`performance.now`
- 涉及的介面：IF-001（草稿）：版本目錄 `v/<commit 短雜湊>/`、發佈內容、Pages 來源選 GitHub Actions、工作流程步驟；其第 7 章 IF1-1～4 的查證結果，本塊實際發佈後可以觀察到，見「未決問題」

## 使用情境
| 誰 | 什麼時候 | 現在怎麼做 | 有了這功能之後 |
|---|---|---|---|
| 開發者（使用者） | 開始寫第 2 塊以後的任何功能前 | 沒有程式碼，沒有地方放、沒有辦法跑、沒有辦法測 | 在 `src/` 三層裡加檔案；`node tools/serve.mjs` 在瀏覽器看；`node --test` 與瀏覽器測試驗證 |
| 開發者 | 改完要讓同事拿到新版 | 沒有發佈管線 | `git push` 到 `main`，測試過了網站自動換成新版；測試沒過網站不變 |
| 開發者 | 在 Windows 上編輯、commit | git 會提示 LF／CRLF 轉換 | `.gitattributes` 固定換行規則，不再出現轉換警告 |
| 同事（玩家） | 打開網址 | 打不開 | 打得開，看到占位畫面（沒有遊戲內容） |

## 功能行為
### A. 專案結構與三層空殼
1. repo 根目錄有 `index.html`、`css/`、`src/data/`、`src/core/`、`src/shell/`、`tools/`、`tests/`。（檔案配置見文末「已定案的細節」，實作時可調整）
2. 每一層各有一個最小模組（只做「證明載入鏈通了」，不含遊戲規則）：`shell` 的入口 → 靜態 `import` `core` → 靜態 `import` `data`。方向只能是 shell → core → data。
3. 所有 `.js` 檔第一行是 `// @ts-check`，型別用 JSDoc。
4. `core` 與 `data` 的模組在 Node 22 直接 `import` 不報錯，不需要任何 DOM 或瀏覽器全域物件（QS-040 的地基）。
5. `core` 的原始碼裡不出現 `Date.now`、`new Date`、`Math.random`、`performance.now`（ADR-0006）。
6. `core` 與 `data` 不 import `shell`；`data` 不 import `core`；`core`、`data` 不使用 `document`、`window`、`localStorage`（ADR-0001、`02` 4.1 的規則寫成自動檢查）。
7. 專案不出現任何外部套件：沒有 `node_modules`、沒有 `dependencies`（CON-001、002）。

### B. 頁面
8. 用本機伺服器打開 `index.html`，頁面載入 `shell` 入口，顯示占位畫面；分頁標題為 `tometo`；`<head>` 內嵌空 favicon（`<link rel="icon" href="data:,">`）避免自動請求 `/favicon.ico`。占位文字由 `shell/main.js` 呼叫一個 `core` 函式取得，該函式讀 `data` 的名稱常數（讀 DOM 的文字就能證明 shell → core → data 載入鏈通了）。`main.js` 完成啟動後在 `<html>` 設 `data-ready="1"`，這是「已啟動」訊號（架構師定案，R3）。
8a. 正式頁面不暴露除錯接口：不掛 `__dbg`、不在 `globalThis`／`window` 上掛物件、不加網址參數開關（R3）。
9. 載入過程與載入之後，瀏覽器主控台沒有錯誤或例外。
10. `index.html` 內對 CSS 與模組的引用一律用相對路徑（網站放在 `/tometo/` 子路徑下，不能用以 `/` 開頭的絕對路徑，也不能引用其他網域）。
10a. `index.html` 的本地引用（`css/…`、`src/…`、`assets/…`）只出現在 `href`／`src` 屬性值；不在行內 module 腳本裡寫相對 import（讓發佈組裝只需替換屬性值，R3）。repo 裡的 `index.html` 本身就用能直接執行的相對路徑（例如 `css/game.css`、`src/shell/main.js`）。
11. 所有模組靜態 `import`，不用動態 `import()`（CON-003）；`src/` 內不出現 `import(`（測試框架在頁面外用 CDP 執行 `import()` 不受此限，見功能行為 18）。

### C. 本機伺服器 `tools/serve.mjs`
12. `node tools/serve.mjs` 起一個靜態伺服器，只用 Node 內建模組，預設只聽本機（127.0.0.1），預設埠 8080，可用參數改埠、改服務的目錄（例如指向發佈組裝出來的目錄，用來測版本目錄結構，IF-001 第 6 章）。
13. `.js` 以 `text/javascript`、`.html`、`.css` 以正確的 MIME 回應（否則瀏覽器不肯載入 ES module）；其餘常見素材（`.svg`、`.png`、`.ico`、`.json`）也有對應類型。
14. 目錄請求回 `index.html`；不存在的檔案回 404；請求路徑跳出服務目錄（例如 `/../`）一律拒絕，不回傳目錄外的檔案。
15. 埠被占用時印出看得懂的錯誤並以非 0 結束，不當掉無訊息。
16. 開發用：回應帶不快取的標頭，改檔後重新整理就看到新內容。

### D. 測試框架
17. **`node:test`（`core`、`data` 與專案結構檢查）**：`node --test` 在 repo 根目錄執行，Node 22 以上、不需任何安裝，會跑到下列測試且全部通過：
    - `core`、`data` 能在 Node 載入（功能行為 4）
    - 功能行為 5、6 的原始碼檢查，以及「檢查器本身抓得到違規」的自我測試（用一小段含 `Date.now` 的字串餵給檢查函式，必須被判違規，避免檢查器壞掉卻永遠通過）
    - `index.html` 的引用規則（功能行為 10）
    - 發佈組裝腳本的測試（功能行為 20～23）
    - `tools/serve.mjs` 的行為（功能行為 13、14）
18. **CDP 瀏覽器測試（外殼用）**：複製北境求生 `tests/lib/harness.mjs`、`tests/run.mjs` 的做法，只用 Node 內建的 `fetch`、`WebSocket`、`child_process`，用無頭 Chrome 或 Edge。框架要具備：
    - 找得到 Chrome／Edge（可用環境變數 `CHROME` 指定路徑；沒找到時印出明確訊息）
    - 自己起 `tools/serve.mjs`（空閒埠，不和別的測試撞埠）並在結束時關掉伺服器與瀏覽器
    - 開頁面、執行頁面內運算式、等待條件、點擊、按鍵、截圖
    - **在頁面內 `import()` 指定模組的輔助函式**：用 CDP `Runtime.evaluate`（`awaitPromise: true`）執行 `import('<該頁面 shell 模組的絕對網址>')`；同網址的 ES module 只有一份實例，拿到的就是頁面正在用的那份，測試靠它讀外殼內部狀態（R3）
    - 之後的 shell 模組要把可觀察狀態放在模組層級，或以匯出的 getter 提供（結構規範，供第 2 塊以後遵守）
    - 蒐集頁面的例外與 `console.error`／`warning`
    - **記錄網路請求，並標出 `load` 事件前後**（QS-061 需要）
    - `PASS`／`FAIL` 一行一項的輸出格式；`run.mjs` 依檔名順序跑 `tests/` 裡的瀏覽器測試檔、彙總通過與失敗數、有失敗時以非 0 結束，可用檔名關鍵字只跑一部分
    - 暫存檔放在 `tests/.tmp/`，不進 git
    - **略過外部注入請求的網域清單**（本機環境有時會被防毒軟體等往頁面注入對外請求，會污染零請求判定）：預設為空；repo 內不得寫死任何防毒軟體或網域名稱；只能由環境變數 `TOMETO_IGNORE_HOSTS`（以逗號分隔的主機名稱）在本機設定；實際略過任何請求時，印出一行 `NOTE` 說明略過了哪個主機與幾筆請求（使用者決定，R5）
    與北境求生不同的地方：ES modules 不能用 `file://` 開，所以一律走 `tools/serve.mjs`；北境求生靠把 `__dbg` 塞進副本的做法在 ES modules 沒有「共同作用域」可用，改用上面的頁面內 `import()`。
    備案（只在自我測試 (c) 失敗時啟用）：測試專用 serve 模式在回應 `index.html` 時注入一個 `<script type="module">`；只動 `tools/serve.mjs` 的回應，不動 repo 檔案、不進發佈。
19. 本塊要有至少兩支瀏覽器測試：(a) 占位頁啟動、無例外；(b) `load` 之後零網路請求且載入期間只有同源請求（對本機伺服器的 repo 目錄與發佈組裝目錄各跑一次）。零請求要在任何 `import()` 輔助函式使用之前量完，或單獨開一頁量。

### E. 發佈組裝
20. 有一支獨立的 Node 腳本 `tools/pack.mjs`（架構師定案，R3），匯出 `rewriteIndexHtml(html, version)` 與 `pack({ version, outDir, root })`；CLI 為 `node tools/pack.mjs --version <7 碼> --out <目錄>`，只在直接執行時才跑。它產出要發佈的網站目錄：
    - 白名單複製 `index.html`、`css/`、`src/`、`assets/`（有才複製），不含 `docs/`、`tests/`、`tools/`、`.git`、`.github`、`package.json`、`.gitattributes` 等
    - `css/`、`src/`、`assets/` 放在 `v/<版本>/` 底下，相對結構不變；逐檔複製，內容與 repo 逐位元組相同（不是建置，CON-001）
    - 只改寫輸出的 `index.html`：`href`／`src` 屬性值開頭為 `css/`、`src/`、`assets/` 者，前面加 `v/<版本>/`；不用 `<base>`、不用 import map；`src/` 內部的 import 是相對於模組自己，不用改
    - 預設輸出目錄 `_site`，列入 `.gitignore`
21. 版本只由參數傳入（不呼叫 git、不讀環境變數），並驗證符合 `^[0-9a-f]{7}$`；workflow 傳入 `${GITHUB_SHA::7}`（commit 完整雜湊的前 7 碼）。
22. 同樣的輸入執行兩次，輸出目錄內容完全相同（冪等，IF-001 第 5 章）。
23. 輸入不合法（缺版本、版本格式不符、必要來源缺檔、輸出目錄已存在且非空）時，先驗證再寫檔，腳本以非 0 結束並說明原因；寫入中途失敗要清掉半成品。`rewriteIndexHtml` 對沒有任何可改寫引用的輸入丟錯。改寫後自我驗證：不得殘留未加前綴的本地引用、每個被引用的檔案都存在。
24. 組裝出的目錄用 `tools/serve.mjs` 服務後，頁面行為與在 repo 根目錄直接服務時相同（占位畫面、無例外、零請求）。

### F. GitHub Actions 發佈
25. `.github/workflows/` 有一支工作流程：push 到 `main` 觸發，也允許手動觸發（`workflow_dispatch`，使用者決定，R4）；兩個 job（架構師定案，R3）：
    - `build`：checkout → setup-node（22）→ `node --test` → `tools/pack.mjs` → `upload-pages-artifact`；權限只有 `contents: read`。失敗就停止、不部署，網站維持上一版。手動觸發時可選任何分支，`build` 照跑。
    - `deploy`：`needs: build`、`environment: github-pages`、`if: github.ref == 'refs/heads/main'`（只有 main 會部署，其他分支即使手動觸發也不部署）；只有這個 job 有 `pages: write`、`id-token: write`。
    - `concurrency: pages`，不取消進行中的部署。
    - 只用 `actions/` 官方組織的 action，不用第三方，不用個人存取權杖（IF-001 第 2 章）。不放 `actions/configure-pages`、不放 `.nojekyll`（已實測：兩者都不需要，R5）。
    - 各 action 的版本以實測為準：`actions/checkout@v7`、`actions/setup-node@v7`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`（R5 實測；取代先前 v4／v3 的過時字樣）。日後升級仍用 `gh api repos/actions/<名稱>/releases/latest` 查證，不憑記憶。
26. 部署成功後 https://shiyongpan.github.io/tometo/ 回 200，頁面是占位畫面，瀏覽器實際載入的 CSS 與模組路徑在 `/tometo/v/<7 碼雜湊>/` 之下，雜湊等於該次 commit 的前 7 碼。
27. 前置條件（已滿足，使用者已設定，R4）：repo 的 Settings → Pages → Source 為「GitHub Actions」（IF-001 第 9 章）。

### G. 版本控制設定
28. `.gitattributes` 固定換行規則，使 Windows 上 `git add`／`git commit` 不再出現 LF／CRLF 轉換警告，且 repo 內的文字檔一律 LF；`.gitattributes` 用 `* text=auto eol=lf`（使用者決定，R2）。
29. `.gitignore` 排除 `tests/.tmp/`、`node_modules/`、發佈組裝的輸出目錄 `_site/`。
30. 專案根目錄有一個 `package.json`，欄位只有 `"type": "module"`（`"private": true` 可加可不加；不放 scripts、name、version、dependencies、devDependencies），讓 `.js` 在 Node 被當 ES module；檔案維持 `.js`，不改 `.mjs`、不依賴語法偵測（架構師定案，R3）。

## 驗收條件
以下條件均由 qa-reviewer 以指令輸出、測試結果或實際網址判定。

**結構與三層**
- [ ] 給定乾淨的 checkout，當執行 `node --test`（Node 22+，未執行過任何安裝指令），則結束碼為 0，輸出顯示通過數 ≥ 1 且失敗數為 0。
- [ ] 給定 `src/` 底下所有 `.js` 檔，當逐檔讀第一行，則全部為 `// @ts-check`。
- [ ] 給定 Node 22 的空環境（沒有 `document`、`window`），當 `import` `src/core/` 與 `src/data/` 的入口模組，則不拋例外。
- [ ] 給定 `src/core/` 底下的所有檔案，當以測試掃描，則找不到 `Date.now`、`new Date`、`Math.random`、`performance.now`、`document`、`window`、`localStorage`（含註解中的出現，採嚴格比對）。
- [ ] 給定一段含 `Date.now()` 的測試字串，當餵給該檢查函式，則被判為違規（自我測試）。
- [ ] 給定 `src/core/` 或 `src/data/` 內某檔含 `import ... from '../shell/...'`，當跑方向檢查，則判為違規；目前 repo 內無此情形、檢查通過。
- [ ] 給定 repo，當檢查檔案清單，則沒有 `node_modules/`，`package.json` 內沒有 `dependencies`／`devDependencies`。
- [ ] 給定根目錄 `package.json`，當解析，則 `type` 為 `"module"`，且沒有 `scripts`、`name`、`version`、`dependencies`、`devDependencies` 欄位。

**頁面與伺服器**
- [ ] 給定 `node tools/serve.mjs` 已啟動，當以 Chrome 開 `http://127.0.0.1:<埠>/`，則頁面顯示占位文字（與 `data` 的名稱常數一致）、`document.documentElement.dataset.ready === '1'`、主控台零例外零 error／warning。
- [ ] 給定 `src/` 底下所有檔案，當以測試做字串掃描，則找不到 `__dbg`，也找不到對 `globalThis`／`window` 掛接口的賦值（如 `globalThis.x =`、`window.x =`）。
- [ ] 給定 `index.html`，當檢查，則所有本地引用只出現在 `href`／`src` 屬性值，行內 module 腳本中沒有相對路徑的 import。
- [ ] 給定伺服器已啟動，當請求 `/src/shell/main.js`（實際檔名依實作），則回應狀態 200 且 `Content-Type` 為 `text/javascript`（可含 charset）。
- [ ] 給定伺服器已啟動，當請求不存在的路徑，則回 404；當請求 `/../package.json` 或編碼後的跳脫路徑（如 `/%2e%2e/package.json`），則不回傳該檔案內容（回 4xx）。
- [ ] 給定埠已被占用，當啟動 `tools/serve.mjs`，則印出說明埠被占用的訊息並以非 0 結束。
- [ ] 給定 `index.html`，當掃描所有 `src`／`href` 屬性，則沒有以 `/` 或 `http` 開頭的值，且沒有 `import(`（動態 import）出現在 `src/` 中。

**瀏覽器測試框架**
- [ ] 給定本機有 Chrome 或 Edge，當執行 `node tests/run.mjs`，則輸出每個測試檔的 PASS／FAIL 行與總計行，全部通過時結束碼 0；刻意讓某項檢查失敗時結束碼非 0 且該行以 `FAIL` 開頭。
- [ ] 給定 `node tests/run.mjs <關鍵字>`，當只有部分檔名含該關鍵字，則只跑這些檔。
- [ ] 給定 repo 的所有受版本控制檔案，當執行 `git grep -i kaspersky`，則無結果；harness 原始碼中沒有寫死任何防毒軟體或網域名稱的略過清單。
- [ ] 給定未設定環境變數 `TOMETO_IGNORE_HOSTS`，當檢查 harness 的略過網域清單，則為空；零請求判定對任何外部請求都不略過。
- [ ] 給定 `TOMETO_IGNORE_HOSTS=example.test` 且頁面載入後有一筆對 `example.test` 的請求（自我測試用 fixture），當跑零請求判定，則該請求被略過，且輸出含一行 `NOTE` 說明略過的主機與筆數；對其他主機的請求仍被計入。
- [ ] 給定測試跑完（無論通過或失敗），當檢查程序，則沒有殘留的無頭瀏覽器或 `serve.mjs` 程序。
- [ ] 給定占位頁，當 CDP 測試記錄網路請求，則 `load` 事件前的請求全部是同源，`load` 之後（再等 3 秒）請求數為 0。
- [ ] 給定一個刻意在 `load` 後送出 `fetch` 的測試頁（框架自我測試用的 fixture），當 CDP 監看，則請求數 ≥ 1、測試判為失敗（證明監看真的抓得到）。
- [ ] 給定頁面丟出未捕捉例外的 fixture，當框架蒐集日誌，則該例外出現在日誌裡。
- [ ] 給定占位頁已載入且 shell 入口模組匯出一個旗標（自我測試用，由頁面啟動時設定），當 harness 在頁面內 `import()` 該 shell 模組，則讀到的旗標值與頁面已設定的值相同（證明拿到的是與頁面共用的同一份實例）。若此條失敗，改用功能行為 18 的備案。

**發佈組裝**
- [ ] 給定版本識別 `abc1234` 與輸出目錄，當執行組裝腳本，則輸出目錄頂層只有 `index.html` 與 `v/`；`v/abc1234/` 下有 `css/`、`src/`；找不到 `docs`、`tests`、`tools`、`.git*`、`package.json`。
- [ ] 給定組裝輸出，當讀 `index.html`，則所有本地引用都以 `v/abc1234/` 開頭，沒有指向未加前綴的 `src/` 或 `css/`，且每個被引用的檔案都存在。
- [ ] 給定組裝輸出，當逐檔比對 `v/abc1234/src/**` 與 repo 的 `src/**`，則內容逐位元組相同。
- [ ] 給定同一版本識別，當連續組裝兩次到不同目錄，則兩個目錄的檔案清單與每個檔案的雜湊完全相同。
- [ ] 給定缺少版本參數或版本不符 `^[0-9a-f]{7}$`（例如 `abc12`、`ABC1234`），當執行組裝腳本，則結束碼非 0、有錯誤說明、輸出目錄不存在或為空。
- [ ] 給定輸出目錄已存在且非空，當執行組裝腳本，則結束碼非 0，且該目錄原有內容不變。
- [ ] 給定一段沒有任何以 `css/`、`src/`、`assets/` 開頭的 `href`／`src` 的 HTML，當呼叫 `rewriteIndexHtml`，則丟出錯誤。
- [ ] 給定 `<script src="src/shell/main.js">` 與 `<link href="css/game.css">`，當以版本 `abc1234` 呼叫 `rewriteIndexHtml`，則結果分別為 `v/abc1234/src/shell/main.js` 與 `v/abc1234/css/game.css`，其餘文字不變。
- [ ] 給定組裝輸出用 `serve.mjs` 服務，當跑 CDP 測試，則占位頁啟動、零例外、`load` 後零請求。

**GitHub Actions 與網址**
- [ ] 給定工作流程檔，當檢視，則：觸發條件為 push 到 `main`；`node --test` 步驟在 `build` job、部署在 `deploy` job 且 `needs: build`；Node 版本 ≥ 22；所使用的 action 都屬於 `actions/` 官方組織；沒有個人存取權杖；Actions 不執行 `tests/browser/` 的瀏覽器測試。（檢視）
- [ ] 給定工作流程檔，當檢視權限，則 `build` job 只有 `contents: read`；只有 `deploy` job 有 `pages: write` 與 `id-token: write`；有 `concurrency: pages` 且不取消進行中的部署；`deploy` job 有 `environment: github-pages`。（檢視）
- [ ] 給定工作流程檔中各 action 的版本，當檢視，則每個版本都已用 `gh api repos/actions/<名稱>/releases/latest` 查證過（executor 在回報中附查證結果）。（檢視）
- [ ] 給定 workflow 的 `deploy` job，當檢視，則有 `if: github.ref == 'refs/heads/main'`，且 workflow 有 `workflow_dispatch` 觸發。（檢視）
- [ ] 給定一個測試分支上放了一個故意讓 `node --test` 失敗的 commit（一次性驗證，不動 `main`），當在該分支手動觸發 workflow，則 `build` 失敗、`deploy` 未執行（跳過）、網址仍是上一版（`v/` 路徑的雜湊沒變）；驗完後該分支已從遠端與本機刪除，`main` 上沒有留下壞 commit（以 `git branch -a` 與 `git log main` 確認）。
- [ ] 給定 Pages 來源已設為 GitHub Actions，當 push 通過測試的 commit 到 `main`，則該次 Actions 全綠，且 https://shiyongpan.github.io/tometo/ 在 10 分鐘內回 200 並顯示占位畫面。
- [ ] 給定上一條的網址，當用 Chrome 開啟並看 DevTools Network，則所有請求都是 `shiyongpan.github.io` 同源、CSS 與模組路徑為 `/tometo/v/<7 碼>/…`，雜湊等於部署 commit 的前 7 碼，`load` 之後請求數為 0，主控台沒有錯誤。
- [ ] 給定發佈成功後再 push 第二個 commit 並部署成功，當觀察網站，則記錄舊的 `v/<第一個雜湊>/` 路徑是否仍可存取（觀察紀錄，不判 FAIL；已實測：舊目錄回 404，使用者接受此現狀，見決定紀錄 R5）。

**版本控制**
- [ ] 給定 `.gitattributes`，當在 Windows 上新增含 LF 的文字檔並 `git add`，則不出現換行轉換警告；`git ls-files --eol` 對 repo 內所有文字檔顯示 `i/lf`。（新增含 CRLF 的檔案時，git 提示「CRLF will be replaced by LF」是 `eol=lf` 的固有行為，不算失敗，也不屬於本條判定範圍。）
- [ ] 給定 repo 的 git 設定，當檢視 commit 作者，則為使用者的個人 email、不是公司 email（人工檢視，CON-006）。
- [ ] 給定 repo 內所有檔案（含程式、文件、占位內容），當依 QS-062 檢視，則不含公司名稱、同事姓名、公司 email（人工檢視）。

## 明確不做（Out of scope）
- 任何遊戲功能：掛機與離線結算、存檔／匯出匯入、上班模式與偽裝畫面（含偽裝根元素、換圖示）、設定、設施、冒險、音效、新手引導。`core` 沒有 `advance`、`apply`、`rng`、`save-format` 等實質內容；`data` 沒有任何遊戲資料。
- localStorage 的任何讀寫；多分頁協調（Web Locks）；鍵名前綴實作（IF-002）。
- 離線模擬、斷網測試（QS-050）與「已開分頁斷網照常玩」的測試；本塊的 CDP 框架只要能監看請求，不做網路狀態模擬。
- `tools/simulate.mjs`（數值模擬）、`tools/bundle.mjs`（單檔備案，ASM-002）。
- 型別檢查納入 CI（ADR-0003：CI 不擋型別，只靠編輯器）；Prettier 或任何格式化工具。
- 載入時間量測（QS-031、Q17）與網站大小量測（IF-001 第 6 章）：占位頁沒有代表性，等 v0.1 完成後量。
- 保留或清理舊版本目錄的機制：使用者決定不保留，接受「每次部署整個取代網站、舊 `v/<雜湊>/` 回 404」（R5）。
- 自訂網域、第二個環境（預覽／測試站）、PR 預覽部署。
- 正式的色彩、版面、字型設計；占位頁只要不顯眼、可讀。
- 發佈前清單（QS-062）的自動化；本塊只做人工檢視。
- 偽裝畫面用的 data URL 圖示；占位頁可使用空圖示（避免瀏覽器自動請求 `/favicon.ico`）。
- Chrome／Edge 基準版本號（Q18）的決定與版本偵測。

## 未決問題
| # | 問題 | 要問誰（使用者 / 架構師） | 狀態 |
|---|---|---|---|
（目前沒有未決問題）

## 使用者決定紀錄
- R2：Q1 → 選 A，Actions 發佈前只跑 `node --test`，CDP 瀏覽器測試只在本機跑（不新增 CI 驗收條件，IF-001／ADR-0004 不用改）。
- R2：Q2 → 選 A，全部 LF，`.gitattributes` 用 `* text=auto eol=lf`（改動：功能行為 28 與 G 組驗收）。
- R2：Q3 → 等發佈後觀察再決定，本塊只記錄 IF1-2 觀察結果。
- R4：使用者在動工關卡確認 v0.3，原 11 個 `(假設)` 項目全部照寫定案：預設埠 8080／只聽 127.0.0.1／不快取標頭；版本識別 7 碼；零請求觀察窗 `load` 後 3 秒；部署後 10 分鐘內網址可用；`src/core/` 嚴格字串掃描（含註解）；`core`／`data` 禁用 `document`／`window`／`localStorage`；標題與文字 `tometo`、空 favicon；`serve.mjs` 的 MIME 類型；檔案配置；`.gitignore` 內容（改動：功能行為 6、8、12、13、16、29 與相關驗收，移除 `(假設)` 標記）。
- R4：「測試失敗就不發佈」的驗證改成不動 `main`：workflow 允許 `workflow_dispatch`，`deploy` job 加 `if: github.ref == 'refs/heads/main'`；在測試分支放一個故意讓 `node --test` 失敗的 commit，手動觸發，確認 `build` 失敗、`deploy` 未執行、網址仍是上一版，驗完刪除該分支（遠端與本機）（改動：功能行為 25；F 組驗收取代原「push 壞 commit 到 main」那條，並新增 `if` 與 `workflow_dispatch` 的檢視條件）。
- R4：repo 的 Settings → Pages → Source 已由使用者設為「GitHub Actions」（改動：功能行為 27 前置條件改為已滿足）。
- R5（QA R1 判 FAIL，唯一阻斷項是規格自相矛盾，使用者決定如下）：
  - `.gitattributes` 驗收改為只驗含 LF 的新檔：`git add` 不出現換行轉換警告、`git ls-files --eol` 全為 `i/lf`；新增 CRLF 檔時 git 提示「CRLF will be replaced by LF」是 `eol=lf` 的固有行為，不算失敗（改動：G 組驗收）。
  - 新增需求：瀏覽器測試 harness 的「略過外部注入請求的網域清單」預設為空，repo 內不寫死任何防毒軟體或網域名稱，只能由環境變數 `TOMETO_IGNORE_HOSTS` 在本機設定，觸發略過時印 `NOTE`（改動：功能行為 18 新增一項；測試框架新增三條驗收）。
  - Q3：不保留舊版本目錄，接受每次部署整個取代網站、舊 `v/<雜湊>/` 回 404（IF1-2 已實測，第二次部署後舊目錄 404）（改動：「明確不做」、驗收的 IF1-2 觀察條件；Q3 與 IF1-2 從未決問題移除）。
  - 測試入口：`tests/run.mjs`（轉接）與 `tests/browser/run.mjs` 都保留（改動：檔案配置補說明）。
  - 實測觀察記錄見下方「實測觀察紀錄」。

## 實測觀察紀錄（R5）
- IF1-1：Pages 回應 `Cache-Control: max-age=600`（`index.html` 約 10 分鐘內可能仍是舊版）。
- IF1-2：每次部署整個取代網站；第二次部署後舊 `v/<雜湊>/` 回 404。
- IF1-3：`actions/configure-pages` 與 `.nojekyll` 都不需要；實際使用 `actions/checkout@v7`、`actions/setup-node@v7`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`。

## 架構師意見紀錄
- R3 議題 1：`.js` 怎麼被 Node 當 ES module → 根目錄放只含 `type: module` 的 `package.json`，維持 `.js`；不改 `.mjs`、不依賴 Node 22.7+ 才預設的語法偵測（CON-002 只寫 22+）；無相依、不需安裝，不違反 CON-001、002 → 改動：功能行為 30 去掉假設改定案；新增驗收「`package.json` 的 `type` 為 `module` 且無其他欄位」。
- R3 議題 2：CDP 測試怎麼讀外殼狀態 → 正式頁面不暴露除錯接口；「已啟動」訊號為 `<html data-ready="1">`；測試以 CDP `Runtime.evaluate` 在頁面內 `import('<shell 模組絕對網址>')` 取得與頁面共用的模組實例；占位文字經 shell → core → data 取得；之後的 shell 模組把可觀察狀態放模組層級或匯出 getter；零請求要在任何 `import()` 前量完或單獨開頁；風險：未實測，備案是測試專用 serve 模式注入 `<script type="module">` → 改動：功能行為 8、8a、10a、11、18、19，新增三條驗收（`data-ready`、`src/` 無 `__dbg`／全域掛接口、harness 頁內 `import()` 共用實例自我測試）。
- R3 議題 3：版本目錄改寫與組裝形式 → 屬性值替換（`href`／`src` 開頭為 `css/`、`src/`、`assets/` 者加 `v/<版本>/`），不用 `<base>`／import map；獨立 `tools/pack.mjs`（匯出 `rewriteIndexHtml`、`pack`），版本只由參數傳入並驗證 `^[0-9a-f]{7}$`，不呼叫 git；白名單逐檔複製、先驗證再寫檔、輸出目錄非空拒絕、失敗清半成品、改寫後自我驗證；預設輸出 `_site` 列入 `.gitignore`；workflow 拆 `build`（`contents: read`）與 `deploy`（`needs: build`、`environment: github-pages`、`pages: write`、`id-token: write`），`concurrency: pages` 不取消；只用 `actions/` 官方 action；不放 `configure-pages` 與 `.nojekyll`（待實測）；action 版本由 executor 以 `gh api` 查證；IF1-2 先假設整個取代、待實測 → 改動：功能行為 10a、20～23、25 與對應驗收（組裝、`rewriteIndexHtml`、workflow 結構與權限、版本查證）。

## 已定案的細節（原假設，R4 使用者確認）
目前沒有未經確認的假設。
- 檔案配置：`index.html`、`css/game.css`（最小樣式）、`src/data/index.js`、`src/core/index.js`、`src/shell/main.js`、`tools/serve.mjs`、`tools/pack.mjs`、`tests/*.test.mjs`（`node --test` 預設會抓 `*.test.*`；測試檔副檔名用 `.mjs`，不影響 `src/` 維持 `.js`）、`tests/run.mjs`（轉接，轉呼叫 `tests/browser/run.mjs`，讓 `node tests/run.mjs` 這個入口與北境求生一致）與 `tests/browser/`（`run.mjs`、`lib/harness.mjs`、`NN-*.mjs`，兩個入口都保留，R5；檔名刻意不叫 `*.test.*` 以免被 `node --test` 抓到；Actions 只跑 `node --test`，瀏覽器測試只在本機跑，已由使用者決定，R2）、`.github/workflows/pages.yml`、`.gitattributes`、`.gitignore`、`package.json`。
- 占位頁的標題與文字用 `tometo`；占位頁內嵌空 favicon（`<link rel="icon" href="data:,">`）避免自動請求 `/favicon.ico` 破壞零請求條件。
- 版本識別取 commit 前 7 碼（版本只由參數傳入並驗證格式）。
- 預設埠 8080、只聽 127.0.0.1、開發用不快取標頭。
- 因為 `core` 目前沒有內容，「`core` 不得出現 `document`／`window`／`localStorage`」是把 `02` 4.1 的敘述寫成自動檢查，比 ADR-0006 建議的檢查範圍多一點。
- 只用 `actions/` 官方 action（checkout、setup-node、upload-pages-artifact、deploy-pages），具體版本由 executor 查證（IF1-3）。
- 部署成功後 10 分鐘內網址可用（Pages 傳播時間 IF1-1 尚未查證）。
- 嚴格字串比對：`core` 掃描連註解中的禁用字樣也算違規；零請求的觀察窗為 `load` 後 3 秒。
