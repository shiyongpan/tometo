// 占位頁的測試對象：repo 根目錄直接服務，以及發佈組裝出來的目錄（版本目錄結構）。
import fs from 'node:fs';
import path from 'node:path';
import { pack } from '../../../tools/pack.mjs';
import { REPO, TMP, startServe } from './harness.mjs';

export const PACK_VERSION = 'abc1234';

/**
 * 起兩個伺服器，回傳測試對象。呼叫端負責對每個 target.server.close()（建議交給 runTest 的 track）。
 * @returns {Promise<{name: string, server: {url: string, origin: string, close: () => any}, shellUrl: string}[]>}
 */
export async function startTargets() {
  const out = path.join(fs.mkdtempSync(path.join(TMP, 'site-')), 'site');
  pack({ version: PACK_VERSION, outDir: out, root: REPO });
  const repo = await startServe(REPO);
  const packed = await startServe(out);
  return [
    { name: 'repo', server: repo, shellUrl: new URL('src/shell/main.js', repo.url).href },
    { name: 'pack', server: packed, shellUrl: new URL(`v/${PACK_VERSION}/src/shell/main.js`, packed.url).href }
  ];
}
