# 第 2 塊：在線掛機核心（經過時間 → 收益、tick 迴圈、120 秒界線）

- 狀態：已確認
- 版本：v0.2
- 討論輪次：R2

## 一句話描述
讓遊戲開著就會自己增加資源，分成兩部分：
- `core`：純函式 `advance(狀態, 經過秒數, 模式)`，依 `data` 裡的產出率計算收益，回傳新狀態和收益明細。
- `shell`：每秒 tick 一次，由 `shell/clock` 算出經過秒數（時間倒退時算 0）；間隔不超過 120 秒全部算在線，超過時前 120 秒算在線、其餘交給離線模式。

畫面上會看到一個占位資源「資源」的數量隨時間增加，分頁在背景時只計算、不更新畫面。

這是 v0.1 的第 2 塊，建立在第 1 塊（骨架＋發佈）上。之後的設施、冒險、離線結算、存檔都會往這個 `advance` 與 tick 迴圈上加東西。

## 上游對應
- 實現的需求：
  - SYS-001（C01，部分）：在線時沒有操作也持續生產資源。本塊只有「一種占位資源以固定速率生產」；冒險戰鬥（SYS-120、121）不在本塊。
  - SYS-002（C01）：兩次 tick 間隔 ≤ 120 秒時依實際經過時間全額補算（背景降頻也一樣）。
  - SYS-005（C02，時間處理部分）：時間倒退時經過秒數算 0、不扣進度，「上次時間」取兩者中較晚的值。本塊只做開頁期間的 tick；存檔裡的「上次 tick 時間」屬於存檔那一塊。
  - SYS-006（C02，界線部分）：間隔 > 120 秒時，前 120 秒以在線計算，其餘以離線模式計算（使用者 R2 確認）。離線的正式折扣與上限（SYS-003、Q2）不在本塊，先用占位倍率，見功能行為 2。
  - SYS-007（C01、C02）：同一段時間不論切成幾段算，資源結果差距 ≤ 1%。本塊沒有事件、經驗、掉落，只驗證資源。
  - SYS-030（C05，部分）：分頁在背景時不更新畫面、只計算（使用者 R2 決定放在本塊）。偽裝時不重畫留給上班模式那一塊。
- 相關品質情境：QS-040（`core` 在 Node 直接執行）、QS-061（tick 運作中 `load` 之後仍零網路請求）。QS-030（背景 CPU < 1%）本塊不量測。
- 必須遵守的 ADR：
  - ADR-0001：`advance` 是純函式；DOM、時鐘、計時器都在 `shell`。
  - ADR-0002：在線與離線同一個 `advance`，只差 `模式`；120 秒界線；任意切法差距 1% 以內，用隨機切法測試驗證。
  - ADR-0003：新檔一律 ES module、`// @ts-check`、JSDoc、靜態 `import`、無外部套件。
  - ADR-0006：只有 `shell/clock` 讀時鐘；`core` 只收經過秒數與模式；`core` 不出現 `Date.now`、`new Date`、`Math.random`、`performance.now`。
- 架構依據：`02` 4.1、5.2（`core/state.js`、`core/advance.js`、`shell/clock.js`、`shell/loop.js`）、6.2 第 1～3 步（第 4 步存檔不在本塊）、6.5、第 8 章「時間」「在線與離線」「畫面輸出」「測試」。
- 涉及的介面：無（不讀寫 localStorage、不匯出入、`load` 後無網路請求）。

## 使用情境
| 誰 | 什麼時候 | 現在怎麼做 | 有了這功能之後 |
|---|---|---|---|
| 玩家 | 打開遊戲、放著不管 | 只有占位文字，什麼都不會動 | 看到「資源」每秒增加 |
| 玩家 | 切到別的分頁工作一陣子（瀏覽器把計時器降到約 1 分鐘一次） | — | 回來時資源跟一直開著前景時一樣多（全額，SYS-002），而且切回來的當下畫面就更新 |
| 玩家 | 電腦睡眠 30 分鐘後喚醒，分頁還開著 | — | 前 120 秒全額、其餘 28 分鐘以離線占位倍率補算 |
| 玩家 | 電腦時間被往回調 | — | 不扣資源；要等時鐘追上原本的時間才重新有收益（SYS-005） |
| 開發者 | 調整產出率 | — | 只改 `src/data/balance.js`，`core` 不動（QS-020 的雛形） |
| 開發者 | 驗證在線、離線、分段一致 | — | `node --test` 在 Node 直接測 `advance`、`clock` 與切分，不需瀏覽器、不需等真實時間 |

## 功能行為
符號：`r` ＝ 占位資源的 `ratePerSec`；`f` ＝ `OFFLINE_FACTOR`（皆定義在 `src/data/balance.js`）。

### A. 資料（`src/data/`）
1. `src/data/balance.js` 匯出 `RESOURCES = Object.freeze([{ id: 'placeholder', name: '資源', ratePerSec: 1 }])`。
2. `src/data/balance.js` 匯出 `OFFLINE_FACTOR = 0.5`，不設上限。這是**占位值**，只為了讓「模式有被正確傳遞」能被測試看出來，**不是** Q2（離線折扣與上限）的答案；C02 那一塊會換成正式的值。檔案內以註解標明。
3. `src/data/index.js` 維持只有 `GAME_NAME`。
4. 數值只放在 `data`；`core` 以 `import` 取得，`src/data/` 以外不以數字字面量重複定義 `r`、`f`。

### B. 核心（`src/core/`）
5. `core/state.js` 匯出 `createInitialState()`：回傳純 JSON 狀態 `{ resources: { placeholder: 0 } }`（每種 `RESOURCES` 一個欄位，值為 0）；不預先加入其他空欄位。每次呼叫回傳新的物件。
6. `core/advance.js` 匯出 `MODE = Object.freeze({ ONLINE: 'online', OFFLINE: 'offline' })`。
7. `advance(state, seconds, mode)` 回傳 `{ state, gains }`：
   - `gains = { resources: { [id]: number } }`，每種資源的增量直接由 `ratePerSec × seconds × 倍率` 計算；倍率在線為 1、離線為 `OFFLINE_FACTOR`。
   - 新 `state.resources[id]` ＝ 舊值 ＋ `gains.resources[id]`。
   - `seconds` 可以是小數；為 0 時新狀態與輸入深相等。
   - 純函式：沿改動路徑淺複製，不修改輸入；相同輸入相同輸出。
8. 非法輸入：`seconds` 為負、`NaN`、`Infinity` 時丟 `RangeError`；`mode` 不是 `MODE` 的兩個值之一時丟 `TypeError`。
9. 本塊沒有事件（升級、解鎖、離線上限），不實作「找下一個事件、分段計算」；不寫用不到的分段程式碼。
10. `core/index.js` 轉匯出 `createInitialState`、`advance`、`MODE`，並保留 `getPlaceholderText`。

### C. 時鐘（`src/shell/clock.js`）
11. `shell/clock.js` 是整個 `src/` 唯一讀時鐘的地方。時鐘來源是 `Date.now()`，只在呼叫當下讀取（寫成預設參數 `readNow = () => Date.now()`，不快取 `Date.now` 的函式參考）；不用 `performance.now`。
12. 匯出純函式 `elapsedSince(last, now)` → `{ elapsedSec, last }`：
    - `now ≥ last`：`elapsedSec = (now − last) / 1000`，`last = now`。
    - `now < last`（時間倒退）：`elapsedSec = 0`，`last` 不變（取兩者中較晚的值，SYS-005）。
    - 後果（使用者 R2 接受）：時間被往回調 1 小時後，要等電腦時間追上原本的「上次時間」才重新有收益；這段期間資源不增也不減。
13. 匯出 `createClock(readNow = () => Date.now())` → `{ tick(), getLast() }`：建立時讀一次 `readNow()` 當初始上次時間；`tick()` 讀現在時間、以 `elapsedSince` 計算並更新上次時間、回傳經過秒數；`getLast()` 回傳上次時間（毫秒）。

### D. tick 迴圈（`src/shell/loop.js`）
14. 匯出 `ONLINE_LIMIT_SEC = 120`，整個 `src/` 只定義這一次。
15. 匯出 `splitElapsed(e)` → `{ online, offline }`：`online = min(e, 120)`，`offline = e − online`；`e` 恰好 120 時全部算在線。
16. 匯出 `applyElapsed(state, e)` → 新狀態：先 `advance(state, online, MODE.ONLINE)`，`offline > 0` 時再 `advance(…, offline, MODE.OFFLINE)`（先在線、後離線）；只回傳新狀態。
17. 匯出 `startLoop({ clock, getState, setState, onTick })` → `{ stop, tickNow }`：
    - 以 `setInterval(…, 1000)` 每秒 tick；不用 `requestAnimationFrame`。
    - 每次 tick：`clock.tick()` 取得經過秒數 → `applyElapsed` → `setState` → `onTick`。
    - 收益只依經過時間，不依 tick 次數；瀏覽器降頻不影響總收益。
    - `tickNow()` 立刻執行一次 tick；`stop()` 清除計時器。
18. `shell/clock.js`、`shell/loop.js` 被 `import` 時不建立計時器、不碰 DOM（Node 測試可直接載入）。
19. 第一次 tick 的上次時間是建立時鐘時讀到的時間（本塊沒有存檔，每次開頁都從 0 開始）。

### E. 啟動與畫面（`src/shell/main.js`、`src/shell/format.js`）
20. 保留第 1 塊的條件：分頁標題 `tometo`、空 favicon、啟動完成設 `<html data-ready="1">`、不暴露全域除錯接口。
21. `main.js` 在 `#app` 內用 `createElement`／`textContent` 建立：
    - `#game-name`：文字為 `getPlaceholderText()`（等於 `GAME_NAME`）。
    - `#res-placeholder`：顯示「資源：數量」。
    不開 `shell/render/` 目錄；不用 `innerHTML`。
22. `shell/format.js` 匯出 `formatAmount(v) = Math.floor(v + 1e-6)`；狀態保留小數，畫面只顯示 `formatAmount` 的結果。
23. `onTick` 只在 `document.visibilityState === 'visible'` 時寫 DOM；分頁在背景時只計算（SYS-030）。外殼一律讀 `visibilityState`，不讀 `document.hidden`。
24. 監聽 `visibilitychange`：變成 `visible` 時立刻 `tickNow()`（補算並更新畫面），不等下一次 tick。
25. `main.js` 匯出 `getGameState()` 與 `getLastTickMs()`，回傳 `structuredClone` 複本（修改回傳值不影響內部），讓 CDP 測試用頁面內 `import()` 讀取；不掛到 `globalThis`／`window`。
26. `main.js` 開頭註解改為「shell 層入口：唯一可以碰 DOM 的地方；只能往下 import core、data」。層級規則：`shell` 可以 import `core` 與 `data`；`core` 不可 import `shell`；`data` 不可 import `core` 或 `shell`。

### F. 測試
27. `node:test` 新增 `advance`（含 SYS-007 隨機切法一致性）、初始狀態、`MODE`、`formatAmount`、`clock`、`loop` 的測試；隨機切法用測試檔自己的固定種子亂數，結果可重現。
28. 原始碼檢查新增：`Date.now`、`new Date`、`performance.now` 只能出現在 `src/shell/clock.js`（嚴格比對、含註解），附自我測試；`src/` 沒有除錯開關、網址參數開關、測試專用分支。
29. 瀏覽器測試控制時間與可見性的方式（只在測試端，`src/` 不加任何東西）：
    - 新增 `tests/browser/lib/time-control.mjs`：產生一段初始化腳本，以 offset 包住 `Date.now`；在 `Document.prototype` 覆寫 `visibilityState`／`hidden` 的 getter，並 dispatch `visibilitychange`。
    - 控制把手以 `Symbol.for('tometo.test')` 為鍵，不以字串名稱掛在 `globalThis`。
    - `harness.mjs` 的 `openPage(br, url, { initScript })` 在 navigate 前以 `Page.addScriptToEvaluateOnNewDocument` 送出腳本；不傳 `initScript` 時行為與現在相同。
    - 不用 CDP virtual time。
30. `01-placeholder` 改成斷言 `#game-name` 的文字 `=== GAME_NAME` 且 `=== getPlaceholderText()`，`#app` 仍存在；其餘斷言不動。第 1 塊的其他既有測試保留並通過。
31. 所有瀏覽器測試照第 1 塊的做法，對 repo 目錄與發佈組裝目錄各跑一次。

## 驗收條件
以下由 qa-reviewer 以測試結果、指令輸出或檢視判定。未特別寫明時，「相等」指相對誤差 ≤ 1e-9。`r` 指 `RESOURCES` 中 `placeholder` 的 `ratePerSec`，`f` 指 `OFFLINE_FACTOR`。

**資料與核心（`node --test`）**
- [ ] AC-01 給定 `src/data/balance.js`，當檢查，則 `RESOURCES` 每項 `ratePerSec > 0`、`OFFLINE_FACTOR` 在 (0, 1]；這些數字不在 `src/data/` 以外以字面量重複定義。（測試＋檢視）
- [ ] AC-02 給定 `MODE`，當檢查，則 `MODE.ONLINE === 'online'`、`MODE.OFFLINE === 'offline'`，且 `Object.isFrozen(MODE)` 為真。
- [ ] AC-03 給定兩次呼叫 `createInitialState()`，當比較，則兩者都是 `{ resources: { placeholder: 0 } }`、深相等但不是同一個物件（改其中一個不影響另一個）。
- [ ] AC-04 給定 `createInitialState()` 與一次 `advance` 的結果狀態，當 `JSON.parse(JSON.stringify(x))`，則與原物件深相等。
- [ ] AC-05 給定初始狀態，當 `advance(狀態, 10, MODE.ONLINE)`，則 `gains.resources.placeholder` 與 `state.resources.placeholder` 都等於 `10 × r`。
- [ ] AC-06 給定初始狀態，當 `advance(狀態, 100, MODE.OFFLINE)`，則資源等於 `100 × r × f`，且小於同秒數在線的結果。
- [ ] AC-07 給定任一狀態，當以 0 秒、兩種模式各呼叫 `advance`，則回傳狀態與輸入深相等。
- [ ] AC-08 給定一個狀態，當呼叫 `advance` 前先深複製、呼叫後比對，則輸入完全未被修改；同樣輸入呼叫兩次，兩個結果深相等。
- [ ] AC-09 給定 `seconds` 為 `-1`、`NaN`、`Infinity`，當呼叫 `advance`，則丟 `RangeError`；給定模式為 `MODE` 以外的值（例如 `'idle'`、`undefined`），則丟 `TypeError`。
- [ ] AC-10 （SYS-007）給定 T ＝ 28800 秒，當用固定種子產生至少 20 組隨機切法（段數涵蓋 1 段、約 1000 段、每秒 1 段的 28800 段，且至少一組含小數秒），在線與離線各自逐段 `advance` 再與一次算完比較，則每組資源的相對差都 ≤ 1%。
- [ ] AC-11 給定 `core/index.js`，當 import，則可取得 `createInitialState`、`advance`、`MODE`、`getPlaceholderText`。
- [ ] AC-12 給定 `formatAmount`，當輸入 `2.9999999999999996`、`2.5`、`0`，則分別回傳 `3`、`2`、`0`。

**時鐘與迴圈（`node --test`，注入 `readNow`，不實際等待）**
- [ ] AC-13 給定 `elapsedSince(t0, t0 + 1500)`，則回傳 `{ elapsedSec: 1.5, last: t0 + 1500 }`；給定 `elapsedSince(t0, t0 − 3600000)`，則回傳 `{ elapsedSec: 0, last: t0 }`。
- [ ] AC-14 給定 `createClock(readNow)` 且 `readNow` 依序回傳 `t0`（建立時）、`t0 − 3600000`、`t0 + 1000`，當連續兩次 `tick()`，則依序回傳 0 與 1，且第一次 `tick()` 後 `getLast()` 仍為 `t0`。
- [ ] AC-15 給定 `loop.js`，當 import，則匯出 `ONLINE_LIMIT_SEC === 120`、`splitElapsed`、`applyElapsed`、`startLoop`；`startLoop` 回傳含 `stop`、`tickNow` 的物件；`120` 這個界線值在 `src/` 只定義一次。（測試＋檢視）
- [ ] AC-16 給定 `splitElapsed` 輸入 1、60、120，則在線分別為 1、60、120，離線皆為 0；輸入 120.5 與 300，則分別為 `{ online: 120, offline: 0.5 }` 與 `{ online: 120, offline: 180 }`。
- [ ] AC-17 給定初始狀態，當 `applyElapsed(狀態, 300)`，則資源等於 `120 × r + 180 × r × f`；當 `applyElapsed(狀態, 0)`，則與輸入深相等。
- [ ] AC-18 給定注入的時鐘與 `startLoop`，當呼叫 `tickNow()`，則 `setState` 收到依經過秒數計算的新狀態、`onTick` 被呼叫一次；`stop()` 之後 Node 程序可以正常結束（不殘留計時器）。
- [ ] AC-19 給定 Node 環境（沒有 `document`、`window`），當 import `src/shell/clock.js`、`src/shell/loop.js`、`src/shell/format.js`，則不拋例外、不建立計時器。

**原始碼與結構（`node --test`）**
- [ ] AC-20 給定 `src/` 所有檔案，當掃描，則 `Date.now`、`new Date`、`performance.now` 只出現在 `src/shell/clock.js`（嚴格比對含註解）；給定放在其他路徑、含 `Date.now()` 的字串，檢查函式判為違規（自我測試）。
- [ ] AC-21 給定 `src/` 所有檔案，當掃描，則沒有網址參數開關（`location.search`、`URLSearchParams`）、沒有 `Symbol.for('tometo.test')` 或其他測試專用分支、沒有 `innerHTML`、沒有 localStorage 讀寫；`src/core/` 沒有 `setInterval`／`setTimeout`。
- [ ] AC-22 給定層級檢查，則 `shell` import `core` 與 `data` 都允許；`core` import `shell` 判違規；`data` import `core` 或 `shell` 判違規（含自我測試）；目前 repo 通過。
- [ ] AC-23 給定 `src/core/` 的新檔案，當跑第 1 塊既有的 `core` 禁用字樣檢查，則通過。
- [ ] AC-24 給定本塊新增或修改的 `src/**/*.js`，當讀第一行，則都是 `// @ts-check`，且都只用靜態 import。

**瀏覽器（CDP，repo 目錄與組裝目錄各跑一次）**
- [ ] AC-25 給定開啟頁面，當等到 `data-ready === '1'`，則分頁標題為 `tometo`、`#app` 存在、`#game-name` 文字 `=== GAME_NAME` 且 `=== getPlaceholderText()`、`#res-placeholder` 顯示「資源：數量」，主控台零例外零 error／warning，全域沒有新掛的字串鍵接口。
- [ ] AC-26 給定頁面已啟動，當呼叫 `getGameState()` 取得回傳值並修改它，再呼叫一次，則第二次的值不受影響；`getLastTickMs()` 同理回傳數值。
- [ ] AC-27 給定頁面已啟動，當間隔約 3 秒實際時間兩次讀取 `getGameState()`，則資源增量與「實際經過秒數 × r」相差不超過 `1.5 × r`；畫面數量與 `formatAmount(狀態數量)` 相差不超過 1。
- [ ] AC-28 給定頁面以 `initScript` 載入時間控制，當把 `Date.now` 往前撥 300 秒並等下一次 tick，則該次資源增量等於 `120 × r + 180 × r × f`，容許 ±`2 × r`。
- [ ] AC-29 給定同上，當把 `Date.now` 往回撥 3600 秒並等至少 2 次 tick，則資源沒有減少、這段增量為 0，`getLastTickMs()` 沒有變小。
- [ ] AC-30 給定同上，當把 `visibilityState` 設為 `hidden` 並維持至少 3 秒，則畫面數量不變、狀態資源持續增加；設回 `visible` 並 dispatch `visibilitychange` 後 1 秒內，畫面數量等於 `formatAmount(狀態數量)`。
- [ ] AC-31 給定時間控制的實作，當檢視 `tests/browser/lib/time-control.mjs` 與 `harness.mjs`，則以 `Page.addScriptToEvaluateOnNewDocument` 注入、把手鍵為 `Symbol.for('tometo.test')`、不以字串名稱掛在 `globalThis`、不用 virtual time；`openPage` 不傳 `initScript` 時，既有 01～04 測試全數通過。（測試＋檢視）
- [ ] AC-32 給定頁面已載入且 tick 在運作（不注入 `initScript`），當跑第 1 塊的零請求測試，則 `load` 後 3 秒請求數為 0、`load` 前請求全部同源。

**整體**
- [ ] AC-33 給定乾淨的 checkout，當執行 `node --test`，則結束碼 0、失敗數 0，第 1 塊的既有測試項目都還在。
- [ ] AC-34 給定本機有 Chrome／Edge，當執行 `node tests/run.mjs`，則全部 PASS、結束碼 0。

## 明確不做（Out of scope）
- **離線結算（C02）的正式內容**：正式的離線折扣與上限（SYS-003、Q2）、離線上限造成的分段事件、開頁時依存檔時間結算、離線摘要（SYS-004）、QS-032 的 2 秒量測。本塊只接好 `模式` 參數，離線用占位倍率 `OFFLINE_FACTOR = 0.5`。
- **存檔（C03）**：localStorage、「上次 tick 時間」的保存、每 30 秒存檔（SYS-010）、`saveVersion`。所以重新整理頁面會從 0 開始，這是預期行為。
- 多分頁主控（SYS-019）：開兩個分頁會各自計算，因為沒有存檔，不會互相覆蓋。
- 上班模式（C04）：偽裝畫面、偽裝時不重畫；本塊只處理「分頁在背景」。
- 設施、角色、冒險戰鬥、經驗、掉落累積值、Boss、事件分段計算（SYS-100、110、120～133）。
- `apply(狀態, 動作)`、`core/rng.js`、`tools/simulate.mjs`、`shell/render/` 目錄。
- QS-030 背景 CPU 量測、ASM-005（背景計時器最慢間隔）的實測。
- 大數字顯示（科學記號、單位縮寫）與正式的畫面設計、配色。
- 防作弊（往前撥時間）：照 ASM-001 單人版不防，往前撥就是一段在線＋離線。

## 未決問題
| # | 問題 | 要問誰（使用者 / 架構師） | 狀態 |
|---|---|---|---|
（目前沒有未決問題）

## 使用者決定紀錄
- R2：Q1 → 離線占位倍率 `f = 0.5`、不設上限，明確標為占位值、不是 Q2 的答案（功能行為 2）。
- R2：Q2 → 確認 SYS-006「間隔超過 120 秒時前 120 秒算在線、其餘離線」。上游 `01` 的【假設】標記由使用者自行處理。
- R2：Q3 → 占位資源名稱「資源」，每秒 1，狀態保留小數、畫面顯示整數（功能行為 1、22）。
- R2：Q4 → SYS-030「分頁在背景時不重畫」放在本塊（功能行為 23、24；AC-30）。
- R2：Q5 → 接受 SYS-005 時間倒退的後果：要等時鐘追上才重新有收益（功能行為 12；AC-29）。

## 架構師意見紀錄
- R2 議題 1（tick 排程）：`setInterval(1000)`；`visibilitychange` 變成 `visible` 時立刻補一次 tick 並更新畫面；不用 `requestAnimationFrame`；`loop.js` 的 `startLoop({ clock, getState, setState, onTick })` 回傳 `{ stop, tickNow }`；`onTick` 只在 `visibilityState === 'visible'` 時寫 DOM，外殼一律讀 `visibilityState`、不讀 `hidden` → 改動：功能行為 17、23、24；AC-15、18、30。
- R2 議題 2（時鐘）：`Date.now()`，只在 `clock.js` 呼叫當下讀（預設參數、不快取函式參考）；匯出 `elapsedSince(last, now)` 與 `createClock(readNow)`，建立時讀一次當初始上次時間；不用 `performance.now`（睡眠期間行為不一致；存檔要 UTC 毫秒）→ 改動：功能行為 11～13；AC-13、14、20。
- R2 議題 3（介面）：狀態為純 JSON `{ resources: { [id]: number } }`，不預先加空欄位；`MODE` 凍結物件；`advance` 回傳 `{ state, gains }`；負數／`NaN`／`Infinity` 丟 `RangeError`，模式不合法丟 `TypeError`；沿改動路徑淺複製；`createInitialState()` 每次回新物件；`applyElapsed` 只回新狀態 → 改動：功能行為 5～8、16；AC-02～09、17。
- R2 議題 4（浮點）：`Number` 累加、狀態保留小數；顯示用 `shell/format.js` 的 `formatAmount(v) = Math.floor(v + 1e-6)`；瀏覽器比對畫面與狀態容許差 1 → 改動：功能行為 22；AC-12、27。
- R2 議題 5（可測性）：Node 注入 `readNow`；`loop.js` 匯出 `ONLINE_LIMIT_SEC`、`splitElapsed`、`applyElapsed`、`startLoop`，import 時不建計時器、不碰 DOM。瀏覽器測試以 `Page.addScriptToEvaluateOnNewDocument` 用 offset 包住 `Date.now`、在 `Document.prototype` 覆寫 `visibilityState`／`hidden` 並 dispatch `visibilitychange`；把手鍵為 `Symbol.for('tometo.test')`、不以字串掛在 `globalThis`；放在 `tests/browser/lib/time-control.mjs`；`openPage(br, url, { initScript })` 在 navigate 前送腳本，不傳時行為不變；不用 virtual time；`src/` 不得有除錯開關。狀態 getter 放 `main.js`：`getGameState()`、`getLastTickMs()`，回傳 `structuredClone` 複本 → 改動：功能行為 14～18、25、28、29；AC-15、18、19、21、26、28～31。
- R2 議題 6（配置）：`src/data/balance.js` 匯出 `RESOURCES` 與 `OFFLINE_FACTOR`；`data/index.js` 維持只有 `GAME_NAME`；`ONLINE_LIMIT_SEC` 放 `shell/loop.js`；`core/index.js` 轉匯出 `createInitialState`、`advance`、`MODE` 並保留 `getPlaceholderText`；`shell` 可直接 import `data`；畫面更新先放 `main.js`，`#app` 內建 `#game-name` 與 `#res-placeholder`，不開 `shell/render/`；`01-placeholder` 改斷言 `#game-name`，其餘不動 → 改動：功能行為 1～3、10、21、26、30；AC-01、11、22、25。

## 已定案的細節（R2 使用者與架構師確認）
目前沒有未經確認的假設。
- 數值：`RESOURCES = [{ id: 'placeholder', name: '資源', ratePerSec: 1 }]`；`OFFLINE_FACTOR = 0.5`（占位）、無上限。
- 界線：`ONLINE_LIMIT_SEC = 120`；恰好 120 秒全算在線；先在線、後離線。
- SYS-007 驗證：T ＝ 8 小時、至少 20 組固定種子的隨機切法、在線與離線各自驗證、相對差 ≤ 1%。
- 檔案配置：
  - `src/data/balance.js`（新）、`src/data/index.js`（不變）
  - `src/core/state.js`、`src/core/advance.js`（新）、`src/core/index.js`（轉匯出）
  - `src/shell/clock.js`、`src/shell/loop.js`、`src/shell/format.js`（新）、`src/shell/main.js`（啟動、畫面、getter）
  - 測試：`tests/*.test.mjs`（新增 `core`、`clock`、`loop`、`format` 的測試，檔名實作時定）、`tests/lib/source-checks.mjs`（時鐘字樣、除錯開關檢查）、`tests/browser/lib/time-control.mjs`（新）、`tests/browser/lib/harness.mjs`（`openPage` 加 `initScript`）、`tests/browser/01-placeholder.mjs`（改斷言）、`tests/browser/05-idle-tick.mjs`（新，檔名可調整）。
