// 跑瀏覽器測試：node tests/browser/run.mjs            全部
//               node tests/browser/run.mjs placeholder  只跑檔名含關鍵字的
// 每個測試檔各自開無頭 Chrome／Edge；需要 Node 22 以上與 Chrome／Edge（可用環境變數 CHROME 指定路徑）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const want = process.argv.slice(2);
const files = fs
  .readdirSync(DIR)
  .filter(f => /^\d\d-.+\.mjs$/.test(f) && (!want.length || want.some(w => f.includes(w))))
  .sort();
let pass = 0;
let fail = 0;
const t0 = Date.now();
if (!files.length) {
  console.log('FAIL 沒有符合的測試檔');
  process.exit(1);
}
for (const f of files) {
  const res = await new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(DIR, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    p.stdout.on('data', d => (o += d));
    p.stderr.on('data', d => (o += d));
    const kill = setTimeout(() => {
      o += '\nFAIL 逾時（超過 5 分鐘）';
      p.kill();
    }, 300000);
    p.on('close', code => {
      clearTimeout(kill);
      resolve({ o, code });
    });
  });
  const p = (res.o.match(/^PASS /gm) || []).length;
  const fl = res.o.match(/^FAIL .*/gm) || [];
  // 沒有任何 FAIL 行卻非 0 結束 = 中途當掉
  const crash = res.code !== 0 && !fl.length;
  pass += p;
  fail += fl.length + (crash ? 1 : 0);
  const bad = fl.length || crash;
  console.log(`${bad ? 'FAIL' : 'PASS'} ${f}  ${p} 項通過${fl.length ? `，${fl.length} 項失敗` : ''}${crash ? '，中途出錯' : ''}`);
  for (const l of new Set(res.o.match(/^NOTE .*/gm) || [])) console.log('  ' + l);
  for (const l of fl) console.log(l);
  if (crash) console.log(res.o.trimEnd().split('\n').slice(-30).join('\n'));
}
console.log(`\n共 ${files.length} 個測試檔，${pass} 項通過，${fail} 項失敗（${Math.round((Date.now() - t0) / 1000)} 秒）`);
process.exitCode = fail ? 1 : 0;
