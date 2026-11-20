// (a) 占位頁啟動、無例外：對 repo 目錄與發佈組裝目錄各跑一次。
import { runTest, openPage } from './lib/harness.mjs';
import { startTargets } from './lib/targets.mjs';
import { GAME_NAME } from '../../src/data/index.js';
import { getPlaceholderText } from '../../src/core/index.js';

await runTest(async ({ br, check, track }) => {
  const targets = await startTargets();
  for (const t of targets) track(t.server);
  for (const t of targets) {
    const pg = await openPage(br, t.server.url);
    try {
      await pg.waitLoad();
      await pg.wait(`document.documentElement.dataset.ready === '1'`);
      check(true, `[${t.name}] <html data-ready="1">`);
      const title = await pg.ev('document.title');
      check(title === 'tometo', `[${t.name}] 分頁標題為 tometo`, title);
      check(await pg.ev(`!!document.getElementById('app')`), `[${t.name}] #app 存在`);
      const text = await pg.ev(`document.getElementById('game-name').textContent`);
      check(text === GAME_NAME && text === getPlaceholderText(), `[${t.name}] #game-name 文字與 data 名稱常數一致`, text);
      check(pg.logs.length === 0, `[${t.name}] 主控台零例外零 error／warning`, pg.logs);
      const leaked = await pg.ev(`['__dbg','game','shell','core'].filter(k => k in globalThis)`);
      check(leaked.length === 0, `[${t.name}] 全域沒有掛接口`, leaked);
    } finally {
      await pg.close();
    }
  }
});
