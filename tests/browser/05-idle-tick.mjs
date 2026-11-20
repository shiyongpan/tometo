// 第 2 塊：在線掛機核心的瀏覽器驗證（AC-25～30）：對 repo 目錄與發佈組裝目錄各跑一次。
import { runTest, openPage, sleep } from './lib/harness.mjs';
import { startTargets } from './lib/targets.mjs';
import { timeControlScript, handle } from './lib/time-control.mjs';
import { GAME_NAME } from '../../src/data/index.js';
import { getPlaceholderText } from '../../src/core/index.js';
import { RESOURCES, OFFLINE_FACTOR } from '../../src/data/balance.js';
import { formatAmount } from '../../src/shell/format.js';

const r = RESOURCES[0].ratePerSec;
const f = OFFLINE_FACTOR;

await runTest(async ({ br, check, track }) => {
  const targets = await startTargets();
  for (const t of targets) track(t.server);
  for (const t of targets) {
    const tag = `[${t.name}]`;
    const mod = (fn) => `import(${JSON.stringify(t.shellUrl)}).then(${fn})`;
    const amount = `import(${JSON.stringify(t.shellUrl)}).then(m => m.getGameState().resources.placeholder)`;
    const ready = async pg => {
      await pg.waitLoad();
      await pg.wait(`document.documentElement.dataset.ready === '1'`);
    };

    // ----- 不注入 initScript：AC-25、26、27 -----
    let pg = await openPage(br, t.server.url);
    try {
      await ready(pg);
      check((await pg.ev('document.title')) === 'tometo', `${tag} AC-25 分頁標題為 tometo`);
      check(await pg.ev(`!!document.getElementById('app')`), `${tag} AC-25 #app 存在`);
      const name = await pg.ev(`document.getElementById('game-name').textContent`);
      check(name === GAME_NAME && name === getPlaceholderText(), `${tag} AC-25 #game-name 文字正確`, name);
      const res = await pg.ev(`document.getElementById('res-placeholder').textContent`);
      check(/^資源：\d+$/.test(res), `${tag} AC-25 #res-placeholder 顯示「資源：數量」`, res);
      const leaked = await pg.ev(
        `['__dbg','game','shell','core','getGameState','getLastTickMs','state'].filter(k => k in globalThis)`
      );
      check(leaked.length === 0, `${tag} AC-25 全域沒有新掛的字串鍵接口`, leaked);

      // AC-26：複本
      const a = await pg.importIn(t.shellUrl, 'm => m.getGameState()');
      const mutated = await pg.ev(
        mod(`m => { const s = m.getGameState(); s.resources.placeholder = 12345; s.extra = 1; return m.getGameState(); }`)
      );
      check(mutated.resources.placeholder < 12345 && !('extra' in mutated), `${tag} AC-26 getGameState 回傳複本`, mutated);
      check(typeof a.resources.placeholder === 'number', `${tag} AC-26 getGameState 有資源數值`);
      const last = await pg.importIn(t.shellUrl, 'm => m.getLastTickMs()');
      check(typeof last === 'number' && Number.isFinite(last), `${tag} AC-26 getLastTickMs 為數值`, last);

      // AC-27：約 3 秒實際時間的增量
      const s1 = await pg.ev(mod(`m => ({ v: m.getGameState().resources.placeholder, t: Date.now() })`));
      await sleep(3000);
      const s2 = await pg.ev(
        mod(`m => ({
          v: m.getGameState().resources.placeholder,
          t: Date.now(),
          text: document.getElementById('res-placeholder').textContent
        })`)
      );
      const expected = ((s2.t - s1.t) / 1000) * r;
      check(Math.abs(s2.v - s1.v - expected) <= 1.5 * r, `${tag} AC-27 增量約等於經過秒數 × r`, { s1, s2, expected });
      const shown = Number(s2.text.split('：')[1]);
      check(Math.abs(shown - formatAmount(s2.v)) <= 1, `${tag} AC-27 畫面數量接近 formatAmount(狀態)`, { s2, shown });
      check(pg.logs.length === 0, `${tag} 主控台零例外零 error／warning`, pg.logs);
    } finally {
      await pg.close();
    }

    // ----- AC-28：往前撥 300 秒 -----
    pg = await openPage(br, t.server.url, { initScript: timeControlScript() });
    try {
      await ready(pg);
      const before = await pg.ev(mod(`m => { const v = m.getGameState().resources.placeholder; ${handle}.setOffsetMs(300000); return v; }`));
      await pg.wait(`${amount}.then(v => v >= ${before} + 100)`, 5000);
      const after = await pg.ev(amount);
      const want = 120 * r + 180 * r * f;
      check(Math.abs(after - before - want) <= 2 * r, `${tag} AC-28 往前撥 300 秒：前 120 秒在線、其餘離線`, { before, after, want });
    } finally {
      await pg.close();
    }

    // ----- AC-29：往回撥 3600 秒 -----
    pg = await openPage(br, t.server.url, { initScript: timeControlScript() });
    try {
      await ready(pg);
      await sleep(1500);
      const b = await pg.ev(
        mod(`m => { const o = { v: m.getGameState().resources.placeholder, last: m.getLastTickMs() }; ${handle}.setOffsetMs(-3600000); return o; }`)
      );
      await sleep(2600); // 至少 2 次 tick
      const a = await pg.ev(mod(`m => ({ v: m.getGameState().resources.placeholder, last: m.getLastTickMs() })`));
      check(a.v >= b.v, `${tag} AC-29 往回撥後資源沒有減少`, { b, a });
      check(Math.abs(a.v - b.v) <= 1e-9, `${tag} AC-29 往回撥期間增量為 0`, { b, a });
      check(a.last >= b.last, `${tag} AC-29 getLastTickMs 沒有變小`, { b, a });
    } finally {
      await pg.close();
    }

    // ----- AC-30：分頁在背景只計算、不更新畫面 -----
    pg = await openPage(br, t.server.url, { initScript: timeControlScript() });
    try {
      await ready(pg);
      await sleep(1200);
      const h0 = await pg.ev(
        mod(`m => { ${handle}.setVisibility('hidden'); return { v: m.getGameState().resources.placeholder, text: document.getElementById('res-placeholder').textContent }; }`)
      );
      await sleep(3200);
      const h1 = await pg.ev(
        mod(`m => ({ v: m.getGameState().resources.placeholder, text: document.getElementById('res-placeholder').textContent })`)
      );
      check(h1.text === h0.text, `${tag} AC-30 背景時畫面數量不變`, { h0, h1 });
      check(h1.v - h0.v >= 2 * r, `${tag} AC-30 背景時狀態資源持續增加`, { h0, h1 });
      await pg.ev(`${handle}.setVisibility('visible')`);
      await pg.wait(
        mod(`m => document.getElementById('res-placeholder').textContent === '資源：' + (m.getGameState().resources.placeholder + 1e-6 | 0)`),
        1000
      );
      check(true, `${tag} AC-30 切回 visible 後 1 秒內畫面等於 formatAmount(狀態)`);
      check(pg.logs.length === 0, `${tag} AC-30 主控台零例外零 error／warning`, pg.logs);
    } finally {
      await pg.close();
    }
  }
});
