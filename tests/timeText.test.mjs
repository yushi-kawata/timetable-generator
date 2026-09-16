/* ============================================================================
   時刻の表し方の試験 ── src/lib/timeText.ts（2026-09-16）
   ============================================================================
   ★届く値は1種類ではない
     ・"09:08" … 文字列のセル
     ・"1899-12-30T00:08:00.000Z" … 「時刻だけ」のセルが日付型で返ったもの
       （1899-12-30 はスプレッドシートの時刻シリアルの起点）
     どちらも「9:08」と出さなければならない。
   ★日本時間で読むこと。端末のタイムゾーン任せにしない
     00:08Z を端末（例：UTC）の時計で読むと 0:08 になり、9時間ずれる。
   ★読めない値では何も出さない（Invalid Date / NaN:NaN を画面に出さない）。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './_load-ts.mjs';

const { toTimeText } = await loadTs('src/lib/timeText.ts');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// ── 日付型で届いた時刻（今回の本命）────────────────────────────────
test('★時刻シリアル由来（1899-12-30…Z）を日本時間で読む', () => {
  assert.equal(toTimeText('1899-12-30T00:08:00.000Z'), '9:08');
  assert.equal(toTimeText('1899-12-30T05:57:00.000Z'), '14:57');
});

test('今日の日付が付いた日付型でも同じ', () => {
  assert.equal(toTimeText('2026-09-16T05:57:00.000Z'), '14:57');
  assert.equal(toTimeText('2026-09-16T00:08:00+09:00'), '0:08');
});

test('Date そのものが渡っても読める', () => {
  assert.equal(toTimeText(new Date('1899-12-30T00:08:00.000Z')), '9:08');
});

// ── 素の文字列（今までどおり）──────────────────────────────────────
test('"09:08" / "9:08" / "14:57" はそのまま読める（先頭の0は落とす）', () => {
  assert.equal(toTimeText('09:08'), '9:08');
  assert.equal(toTimeText('9:08'), '9:08');
  assert.equal(toTimeText('14:57'), '14:57');
  assert.equal(toTimeText(' 09:08 '), '9:08');
  assert.equal(toTimeText('09:08:30'), '9:08');
});

test('24時間表記のまま出す（午後を 2:57 にしない）', () => {
  assert.equal(toTimeText('1899-12-30T05:57:00.000Z'), '14:57');
  assert.equal(toTimeText('23:05'), '23:05');
});

test('真夜中は 0:00（24:00 にしない）', () => {
  assert.equal(toTimeText('1899-12-30T15:00:00.000Z'), '0:00');
  assert.equal(toTimeText('00:00'), '0:00');
});

// ── 読めない値（画面に何も出さない）────────────────────────────────
test('★空・読めない値では何も出さない', () => {
  for (const v of ['', '   ', 'こわれた値', 'Invalid Date', '99:99', '25:00', '9時8分', 'abc']) {
    assert.equal(toTimeText(v), '', `${JSON.stringify(v)} を時刻として出してしまった`);
  }
});

test('★文字列でないものでも落ちない', () => {
  for (const v of [null, undefined, 0, 1, {}, [], NaN, new Date('x')]) {
    assert.equal(toTimeText(v), '', `${String(v)} を時刻として出してしまった`);
  }
});

// ── ★端末のタイムゾーンに左右されない ──────────────────────────────
test('★端末のタイムゾーンが日本以外でも 9:08 と出る（UTC / ニューヨーク）', () => {
  const script = [
    "const { loadTs } = await import('./tests/_load-ts.mjs');",
    "const { toTimeText } = await loadTs('src/lib/timeText.ts');",
    "console.log(JSON.stringify([",
    "  Intl.DateTimeFormat().resolvedOptions().timeZone,",
    "  toTimeText('1899-12-30T00:08:00.000Z'),",
    "  toTimeText('1899-12-30T05:57:00.000Z'),",
    "  toTimeText('09:08'),",
    "]));",
  ].join('\n');

  for (const tz of ['UTC', 'America/New_York']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    const [seen, a, b, c] = JSON.parse(out.trim().split('\n').pop());
    assert.equal(seen, tz, `子プロセスのタイムゾーンが ${tz} になっていない（試験が効いていない）`);
    assert.equal(a, '9:08', `${tz} の端末で 9:08 にならない（端末の時計で読んでいる）`);
    assert.equal(b, '14:57', `${tz} の端末で 14:57 にならない`);
    assert.equal(c, '9:08', `${tz} の端末で 素の "09:08" が読めない`);
  }
});
