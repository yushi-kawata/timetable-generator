/* ============================================================================
   出欠の時刻が画面に出るまでの試験（2026-09-16）
   ============================================================================
   ★本番で起きたこと（14:57 の実物）
       ✓ 登校と下校を記録しました
       登校  1899-12-30T00:08:00.000Z
       下校  1899-12-30T05:57:00.000Z
     1899-12-30 はスプレッドシートの【時刻シリアルの起点】。
     「時刻だけ」のセルは 1899-12-30 からの経過時間として持たれ、
     日付型として返ると この形で届く。
       00:08Z ＝ 日本時間 9:08 ／ 05:57Z ＝ 14:57（撮影時刻と一致）
     ＝値は正しく、【表示だけ】が壊れている。

   ★この試験の作り（A4-99 と同じ）
     模造品ではなく、本番のソース（AttendancePanel.tsx）から
     時刻欄を組み立てている部分を取り出して動かす。
     整形関数は差し替え可能な形で渡すので、
     「生のまま出しているか／整形を通しているか」だけを見る。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = path.join(HERE, '..', 'src', 'components', 'student', 'AttendancePanel.tsx');
const src = readFileSync(PANEL, 'utf8');

/** 本番のソースから「時刻欄を組み立てている部分」をそのまま取り出す */
function timesBlock() {
  const from = src.indexOf('const times');
  assert.notEqual(from, -1, 'times を組み立てている部分が見つからない（形が変わった？）');
  const marker = src.indexOf("'下校'", from);
  assert.notEqual(marker, -1, '下校の行が見つからない');
  const end = src.indexOf('\n', marker);
  return src.slice(from, end);
}

/** 取り出した TypeScript をそのまま動かせるようにする */
const runTimes = (() => {
  const block = timesBlock();
  const js = ts.transpileModule(
    `(function (a, toTimeText) {\n${block}\n return times; })`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const fn = runInNewContext(js);
  // ★vm の中で作られた配列は別realmのもの。そのまま deepEqual すると
  //   中身ではなく作られた場所の違いで落ちる＝欠陥を捕まえたことにならない。
  //   こちら側の素の配列に写してから比べる。
  return (a, toTimeText) =>
    Array.from(fn(a, toTimeText), (t) => ({ label: t.label, time: t.time }));
})();

/** 差し替え用の整形関数（本番の実体はここでは使わない＝経路だけを見る） */
const STUB = {
  '1899-12-30T00:08:00.000Z': '9:08',
  '1899-12-30T05:57:00.000Z': '14:57',
  '09:08': '9:08',
};
const stubFormat = (v) => STUB[v] ?? '';

// ============================================================================

test('★日付型由来の時刻を、生のまま画面に出さない（＝整形を通している）', () => {
  const got = runTimes(
    { checkinTime: '1899-12-30T00:08:00.000Z', checkoutTime: '1899-12-30T05:57:00.000Z' },
    stubFormat,
  );
  assert.deepEqual(got, [
    { label: '登校', time: '9:08' },
    { label: '下校', time: '14:57' },
  ], '本番の画面に出ていたのと同じ生の値が、そのまま時刻欄に流れている');
});

test('素の "09:08" も整形を通る（表示を1つの規則にそろえる）', () => {
  const got = runTimes({ checkinTime: '09:08', checkoutTime: '' }, stubFormat);
  assert.deepEqual(got, [{ label: '登校', time: '9:08' }]);
});

test('★空のときは、その行そのものを出さない', () => {
  assert.deepEqual(runTimes({ checkinTime: '', checkoutTime: '' }, stubFormat), []);
});

test('★整形できない値のときも、行を出さない（Invalid Date と書かない）', () => {
  const got = runTimes({ checkinTime: 'こわれた値', checkoutTime: '' }, stubFormat);
  assert.deepEqual(got, [], '読めない値を、そのまま画面に出している');
});

test('下校だけが読めないときは、登校だけを出す', () => {
  const got = runTimes({ checkinTime: '09:08', checkoutTime: 'こわれた値' }, stubFormat);
  assert.deepEqual(got, [{ label: '登校', time: '9:08' }]);
});

test('★「記録した／していない」の判定には手を入れていない（生の値のまま）', () => {
  // ここが整形後の値に変わると、読めない時刻のときに「未記録」に戻り、
  // 押せる「登校する」が復活する＝A4-99 の二重登録に逆戻りする。
  const panel = src.slice(src.indexOf('const checkedIn'), src.indexOf('const checkedIn') + 120);
  assert.match(panel, /const checkedIn = !!checkinTime;/);
  assert.match(panel, /const checkedOut = !!checkoutTime;/);
});
