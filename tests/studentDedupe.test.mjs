/* ============================================================================
   名簿の重複のまとめ方の試験 ── 同姓同名が黙って消えない
   ============================================================================
   守りたいこと:
     ・同姓同名の2人（メールが違う）は2人とも残る
     ・同じ学籍番号の行は1つにまとめる（届いていれば、メールより先に使う）
     ・同じメール（大文字小文字・前後の空白の違いは同じとみなす）は1つにまとめる
     ・学籍番号もメールも無い行はまとめない（黙って消さない）
     ・まとめたときは件数を返す（画面がそれを出す）

   負の対照（★わざと壊して赤くなることを確かめる）:
     STUDENT_DEDUPE_TS=<壊した写し> node --test tests/studentDedupe.test.mjs
     MASTER_STORE_TS=<壊した写し>   node --test tests/studentDedupe.test.mjs
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './_load-ts.mjs';

const DEDUPE_TS = process.env.STUDENT_DEDUPE_TS || 'src/stores/studentDedupe.ts';
const STORE_TS = process.env.MASTER_STORE_TS || 'src/stores/useMasterStore.ts';
const ADMIN_TSX = process.env.ADMIN_PAGE_TSX || 'src/components/admin/AdminPage.tsx';

const { studentKey, dedupeByStudentKey } = await loadTs(DEDUPE_TS);

// ★架空の値だけ（実在の人名・メールを入れない）
const row = (name, dx_email, extra = {}) => ({ name, grade: '2年', course: '通常', dx_email, ...extra });
const run = (rows) => dedupeByStudentKey(rows, studentKey);

test('★同姓同名の2人（メールが違う）は、2人とも残る', () => {
  const r = run([row('試験 花子', 'a00000001@example.invalid'), row('試験 花子', 'a00000002@example.invalid')]);
  assert.equal(r.kept.length, 2, '★同姓同名の1人が消えている');
  assert.equal(r.merged, 0);
});

test('同じメールの行は1つにまとめ、あとの行を残す（位置は最初のまま）', () => {
  const r = run([
    row('試験 一郎', 'b00000001@example.invalid', { grade: '1年' }),
    row('試験 次郎', 'b00000009@example.invalid'),
    row('試験 一郎', ' B00000001@Example.Invalid ', { grade: '2年' }),
  ]);
  assert.equal(r.kept.length, 2);
  assert.equal(r.merged, 1);
  assert.equal(r.kept[0].grade, '2年', 'あとの行が残る');
  assert.equal(r.kept[1].name, '試験 次郎', '並び順は最初に出てきた位置のまま');
});

test('★学籍番号が届いていれば、メールより先にそれで比べる', () => {
  // 同じ学籍番号・メールが違う → 1人
  const a = run([
    row('試験 三郎', 'c00000001@example.invalid', { student_id: '99990001' }),
    row('試験 三郎', 'c00000002@example.invalid', { student_id: '99990001' }),
  ]);
  assert.equal(a.kept.length, 1);
  assert.equal(a.merged, 1);
  // 学籍番号が違えば、同じ氏名でも2人
  const b = run([
    row('試験 三郎', '', { student_id: '99990001' }),
    row('試験 三郎', '', { student_id: '99990002' }),
  ]);
  assert.equal(b.kept.length, 2);
  // 数字8桁でない学籍番号は使わない（メールに戻る）
  assert.equal(studentKey(row('x', 'd@example.invalid', { student_id: '12' })), 'e:d@example.invalid');
});

test('★学籍番号もメールも無い行は、同じ氏名でもまとめない（黙って消さない）', () => {
  const r = run([row('試験 四郎', ''), row('試験 四郎', '  ')]);
  assert.equal(r.kept.length, 2);
  assert.equal(r.merged, 0);
});

test('変な行でも落ちない', () => {
  assert.equal(studentKey(null), null);
  assert.equal(studentKey(undefined), null);
  assert.equal(studentKey('x'), null);
  assert.deepEqual(run([]), { kept: [], merged: 0 });
});

// ── ストアと画面が本当にこれを使っているか ──────────────────────────────
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const store = stripComments(readFileSync(STORE_TS, 'utf8'));
const admin = stripComments(readFileSync(ADMIN_TSX, 'utf8'));

test('★ストアの読み込みは、氏名ではなく studentKey でまとめている', () => {
  const m = store.match(/function dedupeStudents[\s\S]*?\n\}/);
  assert.ok(m, '★dedupeStudents が見つからない');
  assert.ok(/studentKey\(/.test(m[0]), '★studentKey を使っていない');
  assert.ok(/dedupeByStudentKey\(/.test(m[0]), '★dedupeByStudentKey を使っていない');
  assert.equal(/\.set\(\s*s\.name\b/.test(store), false, '★氏名をキーにしている行が残っている');
});

test('★まとめた件数を画面に出している（黙ってまとめない）', () => {
  assert.ok(/studentsMerged:\s*d\.merged/.test(store), '★まとめた件数をストアに置いていない');
  assert.ok(/studentsMerged\s*>\s*0/.test(admin), '★画面が件数を出していない');
});
