// 框架自我測試：監看真的抓得到 load 後的請求與例外；頁內 import() 拿到與頁面共用的同一份實例。
import path from 'node:path';
import { runTest, openPage, sleep, startServe, REPO } from './lib/harness.mjs';
import { startTargets } from './lib/targets.mjs';

await runTest(async ({ br, check, track }) => {
  // (1) load 後 fetch 的 fixture：請求數 >= 1，等同零請求檢查會判失敗
  const fx = track(await startServe(path.join(REPO, 'tests', 'browser', 'fixtures')));
  let pg = await openPage(br, fx.url + 'late-fetch.html');
  await pg.waitLoad();
  await sleep(1500);
  const after = pg.requests.filter(r => r.afterLoad && /^https?:/.test(r.url));
  check(after.length >= 1, '監看抓得到 load 後的請求（零請求檢查對此頁會判失敗）', pg.requests);
  await pg.close();

  // (2) 未捕捉例外會進日誌
  pg = await openPage(br, fx.url + 'throws.html');
  await pg.waitLoad();
  await sleep(800);
  check(pg.logs.some(l => l.includes('fixture-uncaught')), '未捕捉例外出現在日誌', pg.logs);
  await pg.close();

  // (3) 頁內 import() 與頁面共用同一份模組實例（另一個網址參數則是新實例）
  const targets = await startTargets();
  for (const t of targets) track(t.server);
  for (const t of targets) {
    pg = await openPage(br, t.server.url);
    await pg.waitLoad();
    await pg.wait(`document.documentElement.dataset.ready === '1'`);
    const pageId = await pg.ev('document.documentElement.dataset.bootId');
    const same = await pg.importIn(t.shellUrl, 'm => m.getBootInfo()');
    check(same.ready === true && !!pageId && same.id === pageId, `[${t.name}] import() 取得與頁面共用的實例`, { pageId, same });
    const other = await pg.importIn(t.shellUrl + '?other=1', 'm => m.getBootInfo()');
    check(other.id !== pageId, `[${t.name}] 對照：不同網址是另一份實例`, { pageId, other });
    await pg.close();
  }
});
