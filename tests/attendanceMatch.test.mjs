/* ============================================================================
   出欠の行の見つけ方の試験 ── 台帳 A4-95（2026-09-14）
   ============================================================================
   2026-09-14、younetDX には記録できているのに画面は
   「記録結果を確認できません」と出ていた。＝【確認】の側が壊れている。

   ★スプレッドシートの日付は文字列とは限らない（日付型で入る）。
     JSON にすると "2026-09-14T00:00:00.000Z" のような形で届きうる。
     === の厳密比較は黙って外れ、CSV に当てた検査は緑のまま本番だけ壊れる
     （2026-09-11 に同じ罠で2システムが壊れている）。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const { sameDay, findAttendance } = await loadTs('src/lib/attendanceMatch.ts');

const TODAY = '2026-09-14';

test('同じ日付の文字列は一致する', () => {
  assert.equal(sameDay('2026-09-14', TODAY), true);
});

// ── 本体: 日付型で届いても一致させる ──────────────────────────────
test('★ISO日時で届いても同じ日として扱う（スプレッドシートの日付セルの罠）', () => {
  assert.equal(sameDay('2026-09-14T00:00:00.000Z', TODAY), true);
  assert.equal(sameDay('2026-09-14T15:00:00+09:00', TODAY), true);
});

test('★スラッシュ区切り・ゼロ無しでも同じ日として扱う', () => {
  assert.equal(sameDay('2026/09/14', TODAY), true);
  assert.equal(sameDay('2026/9/14', TODAY), true);
});

test('違う日は一致しない（緩めすぎない）', () => {
  assert.equal(sameDay('2026-09-13', TODAY), false);
  assert.equal(sameDay('2026-10-14', TODAY), false);
  assert.equal(sameDay('', TODAY), false);
  assert.equal(sameDay(null, TODAY), false);
  assert.equal(sameDay('ぜんぜん違う', TODAY), false);
});

test('★その人のその日の行を見つける', () => {
  const list = [
    { date: '2026-09-13', name: '山田', checkinTime: '08:40', checkoutTime: '' },
    { date: '2026-09-14T00:00:00.000Z', name: '山田', checkinTime: '08:42', checkoutTime: '' },
  ];
  const rec = findAttendance(list, TODAY, '山田');
  assert.ok(rec, '日付型で届いていても見つかること');
  assert.equal(rec.checkinTime, '08:42');
});

test('名前の前後の空白で取り違えない', () => {
  const list = [{ date: TODAY, name: ' 山田 ', checkinTime: '08:42', checkoutTime: '' }];
  assert.ok(findAttendance(list, TODAY, '山田'));
});

test('別人の行は返さない', () => {
  const list = [{ date: TODAY, name: '田中', checkinTime: '08:42', checkoutTime: '' }];
  assert.equal(findAttendance(list, TODAY, '山田'), undefined);
});

test('配列でないものを渡しても落ちない', () => {
  assert.equal(findAttendance(null, TODAY, '山田'), undefined);
});
