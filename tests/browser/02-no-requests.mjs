// (b) load 之後零網路請求、載入期間只有同源請求（QS-061）：對 repo 目錄與發佈組裝目錄各跑一次。
// 這裡不使用 import() 輔助函式，避免干擾請求計數。
import { runTest, openPage, sleep } from './lib/harness.mjs';
import { startTargets } from './lib/targets.mjs';

await runTest(async ({ br, check, track }) => {
  const targets = await startTargets();
  for (const t of targets) track(t.server);
  for (const t of targets) {
    const pg = await openPage(br, t.server.url);
    try {
      await pg.waitLoad();
      await sleep(3000); // load 之後再等 3 秒
      // data: 不是網路請求
      const net = pg.requests.filter(r => /^https?:/.test(r.url));
      const before = net.filter(r => !r.afterLoad);
      const after = net.filter(r => r.afterLoad);
      check(before.length >= 3, `[${t.name}] load 前有請求被記錄（html、css、模組）`, net.map(r => r.url));
      const foreign = before.filter(r => new URL(r.url).origin !== t.server.origin);
      check(foreign.length === 0, `[${t.name}] load 前的請求全部同源`, foreign);
      check(after.length === 0, `[${t.name}] load 之後 3 秒請求數為 0`, after);
      check(pg.logs.length === 0, `[${t.name}] 主控台沒有錯誤`, pg.logs);
    } finally {
      await pg.close();
    }
  }
});
