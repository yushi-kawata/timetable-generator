/* TypeScript のまま試験するための小さな読み込み器。
   ★新しい依存は入れない。リポジトリに既にある typescript でその場で変換するだけ。
   ★対象は「import を持たない純粋なモジュール」だけ（型の import は消える）。 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const outDir = mkdtempSync(path.join(tmpdir(), 'ttg-test-'));

export async function loadTs(relPath) {
  const abs = path.resolve(process.cwd(), relPath);
  const src = readFileSync(abs, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
    fileName: abs,
  }).outputText;
  const out = path.join(outDir, path.basename(abs).replace(/\.tsx?$/, '.mjs'));
  writeFileSync(out, js, 'utf8');
  return import(pathToFileURL(out).href);
}
