// 瀏覽器測試用的時間與可見性控制：只存在於測試端，src/ 不放任何東西。
// 產生一段初始化腳本，由 harness.openPage 以 Page.addScriptToEvaluateOnNewDocument 在頁面腳本之前注入。
// - 以 offset 包住 Date.now（不用 CDP virtual time，真實計時器照常跑）。
// - 在 Document.prototype 覆寫 visibilityState／hidden 的 getter，並由 setVisibility 派發 visibilitychange。
// - 控制把手以 Symbol.for('tometo.test') 為鍵掛在 Date 上，不以字串名稱掛在 globalThis。

/** 把手的鍵（頁面內用 Symbol.for 取得同一個符號）。 */
export const HANDLE_KEY = 'tometo.test';

/** 初始化腳本的原始碼。 */
export function timeControlScript() {
  return `(() => {
  const realNow = Date.now.bind(Date);
  let offsetMs = 0;
  let visibility = 'visible';
  Date.now = () => realNow() + offsetMs;
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => visibility === 'hidden' });
  Object.defineProperty(Date, Symbol.for(${JSON.stringify(HANDLE_KEY)}), {
    value: {
      getOffsetMs: () => offsetMs,
      setOffsetMs: v => { offsetMs = v; },
      setVisibility: v => {
        visibility = v;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    }
  });
})();`;
}

/** 頁面內取得把手的運算式，例如 `${handle}.setOffsetMs(300000)`。 */
export const handle = `Date[Symbol.for(${JSON.stringify(HANDLE_KEY)})]`;
