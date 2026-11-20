// 略過網域清單的自我測試：預設為空；TOMETO_IGNORE_HOSTS 設定的主機被略過並印 NOTE，其他主機仍被計入。
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runTest, openPage, sleep, startServe, parseIgnoreHosts, REPO } from './lib/harness.mjs';

await runTest(async ({ br, check, track }) => {
  // (1) 未設定環境變數時，略過清單為空（用乾淨環境的子程序驗證）
  const env = { ...process.env };
  delete env.TOMETO_IGNORE_HOSTS;
  const harnessUrl = new URL('./lib/harness.mjs', import.meta.url).href;
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import { getIgnoreHosts } from ${JSON.stringify(harnessUrl)}; console.log(JSON.stringify(getIgnoreHosts()))`],
    { env, encoding: 'utf8' }
  );
  check(r.status === 0 && r.stdout.trim() === '[]', '未設定 TOMETO_IGNORE_HOSTS 時略過清單為空', r.stdout + r.stderr);
  check(JSON.stringify(parseIgnoreHosts('a.test, b.test,')) === '["a.test","b.test"]', '逗號分隔解析');

  // (2) 設 TOMETO_IGNORE_HOSTS=example.test：該主機被略過並印 NOTE，其他主機仍計入
  const saved = process.env.TOMETO_IGNORE_HOSTS;
  process.env.TOMETO_IGNORE_HOSTS = 'example.test';
  try {
    const fx = track(await startServe(path.join(REPO, 'tests', 'browser', 'fixtures')));
    const pg = await openPage(br, fx.url + 'ignored-host.html');
    await pg.waitLoad();
    await sleep(1500);
    const after = pg.requests.filter(q => q.afterLoad).map(q => new URL(q.url).hostname);
    check(!after.includes('example.test'), 'example.test 的請求被略過', after);
    check(after.includes('other.test'), '其他主機（other.test）的請求仍被計入', after);
    await pg.close();
    check(
      pg.notes.some(l => l.startsWith('NOTE') && l.includes('example.test') && /1 筆/.test(l)),
      '輸出含 NOTE，說明略過的主機與筆數',
      pg.notes
    );
  } finally {
    if (saved === undefined) delete process.env.TOMETO_IGNORE_HOSTS;
    else process.env.TOMETO_IGNORE_HOSTS = saved;
  }
});
