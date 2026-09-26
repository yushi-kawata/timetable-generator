/* ============================================================================
   名簿の取り直しに失敗したら保存を止める ── の試験
   ============================================================================
   守りたいこと:
     ・保存してよいのは、いちばん新しい名簿の読み込みが成功したときだけ
     ・止めるときは理由を文字で出す（押せない灰色のボタンを置かない）
     ・失敗・未読み込みのときは「名簿を読み込み直す」を出す
     ・画面だけに頼らず、ストアの saveStudents も裏側を叩く前に止める

   負の対照（★わざと壊して赤くなることを確かめる）:
     STUDENT_SAVE_GATE_TS=<壊した写し> node --test tests/studentSaveGate.test.mjs
     MASTER_STORE_TS=<壊した写し>      node --test tests/studentSaveGate.test.mjs
     ADMIN_PAGE_TSX=<壊した写し>       node --test tests/studentSaveGate.test.mjs
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './_load-ts.mjs';

const GATE_TS = process.env.STUDENT_SAVE_GATE_TS || 'src/stores/studentSaveGate.ts';
const STORE_TS = process.env.MASTER_STORE_TS || 'src/stores/useMasterStore.ts';
const ADMIN_TSX = process.env.ADMIN_PAGE_TSX || 'src/components/admin/AdminPage.tsx';

const { studentSaveGate } = await loadTs(GATE_TS);

test('読み込みが成功していれば保存できる', () => {
  assert.deepEqual(studentSaveGate('ok'), { canSave: true });
});

for (const sync of ['failed', 'idle', 'loading']) {
  test(`★${sync} のときは保存を止め、理由を文字で出す`, () => {
    const g = studentSaveGate(sync);
    assert.equal(g.canSave, false, `★${sync} なのに保存できる`);
    assert.ok(typeof g.message === 'string' && g.message.length > 10, '★理由の文字が無い');
  });
}

test('★読み込み直せなかったとき：古いかもしれないこと・上書きになること・次の一手を言う', () => {
  const g = studentSaveGate('failed');
  assert.ok(g.message.includes('古い'));
  assert.ok(g.message.includes('上書き'));
  assert.ok(g.message.includes('名簿を読み込み直す'));
  assert.equal(g.canReload, true);
});

test('読み込み中は読み込み直すボタンを出さない（二重に叩かない）', () => {
  assert.equal(studentSaveGate('loading').canReload, false);
  assert.equal(studentSaveGate('idle').canReload, true);
});

test('知らない値でも保存できる側に倒さない', () => {
  assert.equal(studentSaveGate(undefined).canSave, false);
  assert.equal(studentSaveGate('xyz').canSave, false);
});

// ── ストアと画面が本当にこれを使っているか ──────────────────────────────
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const store = stripComments(readFileSync(STORE_TS, 'utf8'));
const admin = stripComments(readFileSync(ADMIN_TSX, 'utf8'));

function body(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '★' + head + ' が見つからない');
  // 次の「      xxx: async」まで
  const rest = src.slice(i + head.length);
  const j = rest.search(/\n {6}[A-Za-z]+: (async )?\(/);
  return j === -1 ? rest : rest.slice(0, j);
}

test('★saveStudents は裏側を叩く前に studentSaveGate で止める', () => {
  const b = body(store, 'saveStudents: async');
  const gateAt = b.indexOf('studentSaveGate(');
  const callAt = b.indexOf("gasCall");
  assert.ok(gateAt >= 0, '★saveStudents が保存の可否を見ていない');
  assert.ok(callAt > gateAt, '★裏側を叩いたあとで可否を見ている');
});

test('★fetchStudents は失敗したとき failed にする（else が無いと古い名簿のまま保存できる）', () => {
  const b = body(store, 'fetchStudents: async');
  assert.ok(/studentsSync:\s*'loading'/.test(b));
  assert.ok(/studentsSync:\s*'ok'/.test(b));
  assert.ok(/else\s*\{[^}]*studentsSync:\s*'failed'/.test(b), '★失敗したときに止めていない');
});

test('★fetchAll（職員）も、名簿が取れなかったら failed にする', () => {
  const b = body(store, 'fetchAll: async');
  assert.ok(/studentsSync:\s*'failed'/.test(b));
});

test('★画面：保存ボタンは保存できるときだけ置き、止めるときは理由と読み込み直すボタン', () => {
  assert.ok(/studentSaveGate\(studentsSync\)/.test(admin), '★画面が可否を見ていない');
  assert.ok(/saveGate\.canSave\s*&&\s*\(\s*<button[\s\S]*?onClick=\{handleSaveStudents\}/.test(admin),
    '★保存ボタンが可否の外に置かれている');
  assert.ok(/!saveGate\.canSave\s*&&[\s\S]*?\{saveGate\.message\}/.test(admin), '★止めた理由を出していない');
  assert.ok(admin.includes('名簿を読み込み直す'), '★読み込み直すボタンが無い');
  // ★押せない灰色のボタンで止めていない
  assert.equal(/disabled=\{[^}]*saveGate/.test(admin), false, '★押せないボタンで止めている');
});
