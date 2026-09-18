/* ============================================================================
   A4-95 裏側の日付照合の試験
   ============================================================================
   ★負の対照の形
     同じ入力を「修正前（=== のまま）」と「修正後（sameDay_）」の両方に通し、
     ・修正前は外れる（＝これが本番で起きていること）
     ・修正後は当たる
     を並べて見せる。修正前が当たってしまったら、この試験は症状を再現できて
     いないので、緑になっても意味がない。

   ★再現している症状
     2026-09-14 夕方・本番。younetDX には登録できているのに、画面に
     「記録結果を確認できません」が【毎回】出る。ばらつかない＝分岐。
   ============================================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PATCH_95 = path.join(HERE, '..', 'gas-patch_A4-95_日付照合_20260914.js');

/** GAS の Utilities.formatDate の代わり（日本時間の暦日） */
const ctx = createContext({
  Utilities: {
    formatDate: (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10),
  },
});
runInContext(readFileSync(PATCH_95, 'utf8'), ctx);
const sameDay_ = runInContext('sameDay_', ctx);

/** 本番のシートが返してくる「今日の行」。★date は日付型（Date）で返る */
const TODAY = '2026-09-14';
// 日本時間 2026-09-14 00:00 ＝ UTC では 2026-09-13T15:00Z
const CELL_DATE = new Date(Date.UTC(2026, 8, 13, 15, 0, 0));
const ROWS = [
  { date: CELL_DATE, name: '山田', checkinTime: '09:30', checkoutTime: '' },
];

/** 修正前の裏側（本番でいま動いている形） */
const filterBefore = (rows, date) => rows.filter((r) => !date || r.date === date);
/** 修正後の裏側 */
const filterAfter = (rows, date) => rows.filter((r) => !date || sameDay_(r.date, date));

// ============================================================================
test('★負の対照：修正前は、今日の行を1件も返さない（＝これが本番の症状）', () => {
  const got = filterBefore(ROWS, TODAY);
  assert.equal(got.length, 0,
    '修正前なのに行が返ってしまった。この試験は症状を再現できていない');
});

test('修正後は、今日の行を返す', () => {
  const got = filterAfter(ROWS, TODAY);
  assert.equal(got.length, 1, '修正後も行が返らない＝直っていない');
  assert.equal(got[0].checkinTime, '09:30');
});

test('★境界：日本時間の 0時ちょうどの行を、前日と取り違えない', () => {
  // 頭10文字を切り取る実装だと '2026-09-13' になってしまう位置
  assert.equal(sameDay_(CELL_DATE, '2026-09-14'), true, '当日として扱えていない');
  assert.equal(sameDay_(CELL_DATE, '2026-09-13'), false, '前日と取り違えている');
});

test('★境界：ISO文字列で届いても暦日でそろう', () => {
  assert.equal(sameDay_('2026-09-13T15:00:00.000Z', '2026-09-14'), true);
  assert.equal(sameDay_('2026-09-13T14:59:59.000Z', '2026-09-14'), false);
});

test('素の YYYY-MM-DD は今までどおり比べられる（後戻りしない）', () => {
  assert.equal(sameDay_('2026-09-14', '2026-09-14'), true);
  assert.equal(sameDay_('2026-09-13', '2026-09-14'), false);
});

test('空・無効な値は false（勝手に当てない）', () => {
  for (const v of ['', null, undefined, 'あ', new Date('x')]) {
    assert.equal(sameDay_(v, '2026-09-14'), false, `${String(v)} を当ててしまった`);
  }
  assert.equal(sameDay_('2026-09-14', ''), false, '比較したい日付が空なのに当てた');
});

test('登校の重複判定：修正前は二重行を作り、修正後は作らない', () => {
  const sheetRows = [[CELL_DATE, '山田', '1年', '09:30', '']];
  const findBefore = () => sheetRows.findIndex((r) => r[0] === TODAY && r[1] === '山田');
  const findAfter = () => sheetRows.findIndex((r) => sameDay_(r[0], TODAY) && r[1] === '山田');
  assert.equal(findBefore(), -1, '★修正前は既存行を見つけられない＝押すたびに行が増える');
  assert.equal(findAfter(), 0, '修正後は既存行を見つける');
});

test('下校：修正前は「登校の記録がない」と言い、修正後は書き込める', () => {
  const sheetRows = [[CELL_DATE, '山田', '1年', '09:30', '']];
  const hitBefore = sheetRows.findIndex((r) => r[0] === TODAY && r[1] === '山田');
  const hitAfter = sheetRows.findIndex((r) => sameDay_(r[0], TODAY) && r[1] === '山田');
  assert.equal(hitBefore, -1, '★修正前は下校が書けない（no checkin record）');
  assert.equal(hitAfter, 0);
});

test('★触ってはいけない週の比較は、文字列のままで正しい', () => {
  // savePeriod2 は body.week（'2026-W38'）を比べる。日付型にならないので壊れていない
  const weekCell = '2026-W38';
  assert.equal(weekCell === '2026-W38', true);
  assert.equal(sameDay_(weekCell, '2026-W38'), false,
    '週に sameDay_ を当ててはいけない（当たってしまうと誤って直したくなる）');
});
