/* ============================================================================
   出欠の操作ボタンの出し分け ── 送信に失敗した画面で記録し直させない
   ============================================================================
   守りたいこと:
     ・成否不明（unknown）・失敗確定（failed）の画面には「記録を確認する」だけ。
       登校する／下校する／もう一度記録する は出さない（二重に送らせない）
     ・「記録を確認する」で記録が【無い】と確かめられたら、ふだんの画面に戻り、
       そこで初めて登校する（下校する）が出る
     ・確かめられなかったとき（取り直しの失敗）は、成否不明のまま

   負の対照（★わざと壊して赤くなることを確かめる）:
     ATTENDANCE_ACTIONS_TS=<壊した写し> node --test tests/attendanceActions.test.mjs
     ATTENDANCE_PANEL_TSX=<壊した写し>  node --test tests/attendanceActions.test.mjs
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './_load-ts.mjs';

const ACTIONS_TS = process.env.ATTENDANCE_ACTIONS_TS || 'src/components/student/attendanceActions.ts';
const PANEL_TSX = process.env.ATTENDANCE_PANEL_TSX || 'src/components/student/AttendancePanel.tsx';

const { pickAttendanceAction } = await loadTs(ACTIONS_TS);
const { verifyFlow, recordFlow } = await loadTs('src/components/student/attendanceFlow.ts');

const base = { loading: false, checkedIn: false, checkedOut: false, checkoutVisible: true };

/** 記録し直す種類のボタンか */
const isRecord = (a) => a.kind === 'record';

// ── 本体: 失敗・成否不明の画面 ─────────────────────────────────────
for (const op of ['in', 'out']) {
  for (const retried of [false, true]) {
    test(`★成否不明（${op}・retried=${retried}）では「記録を確認する」だけ`, () => {
      const a = pickAttendanceAction({
        ...base, checkedIn: op === 'out', req: { kind: 'unknown', op, retried },
      });
      assert.deepEqual(a, { kind: 'verify', op });
    });
  }
  test(`★失敗確定（${op}）でも「記録を確認する」だけ（いきなり記録し直させない）`, () => {
    const a = pickAttendanceAction({
      ...base, checkedIn: op === 'out', req: { kind: 'failed', op },
    });
    assert.deepEqual(a, { kind: 'verify', op });
  });
}

test('★成否不明の画面で、未登校のままでも「登校する」を出さない', () => {
  // 記録があるのに未記録に見える食い違いが起きても、二重に押させない
  const a = pickAttendanceAction({ ...base, req: { kind: 'unknown', op: 'in', retried: false } });
  assert.equal(isRecord(a), false);
});

// ── ふだんの画面（ここは変えていない）──────────────────────────────
test('ふだん：未記録なら「登校する」', () => {
  assert.deepEqual(pickAttendanceAction({ ...base, req: { kind: 'idle' } }), { kind: 'record', op: 'in' });
});
test('ふだん：登校済みなら「下校する」、直後は場所だけ空ける', () => {
  assert.deepEqual(pickAttendanceAction({ ...base, checkedIn: true, req: { kind: 'idle' } }),
    { kind: 'record', op: 'out' });
  assert.deepEqual(pickAttendanceAction({ ...base, checkedIn: true, checkoutVisible: false, req: { kind: 'idle' } }),
    { kind: 'spacer' });
});
test('ふだん：下校まで済んだらボタンなし／読み込み中・送信中は押せない', () => {
  assert.deepEqual(pickAttendanceAction({ ...base, checkedIn: true, checkedOut: true, req: { kind: 'idle' } }),
    { kind: 'none' });
  assert.deepEqual(pickAttendanceAction({ ...base, loading: true, req: { kind: 'idle' } }), { kind: 'loading' });
  assert.deepEqual(pickAttendanceAction({ ...base, req: { kind: 'sending', op: 'in' } }), { kind: 'busy' });
  assert.deepEqual(pickAttendanceAction({ ...base, req: { kind: 'verifying', op: 'in' } }), { kind: 'busy' });
});

// ── 「記録を確認する」の結末 ────────────────────────────────────────
function verifyDeps(result) {
  const calls = { reqs: [], dx: [], skipped: [] };
  const deps = {
    confirmSaved: async () => result,
    runDx: async (op) => { calls.dx.push(op); },
    dxAlreadySent: () => false,
    isCurrent: () => true,
    setReq: (r) => { calls.reqs.push(r); },
    onDxSkipped: (op, why) => { calls.skipped.push([op, why]); },
  };
  return { deps, calls };
}

test('★記録が無いと確かめられたら、ふだんの画面に戻る（ここで初めて登校するが出る）', async () => {
  const { deps, calls } = verifyDeps('absent');
  assert.equal(await verifyFlow('in', deps), 'absent');
  const last = calls.reqs[calls.reqs.length - 1];
  assert.deepEqual(last, { kind: 'idle' });
  assert.deepEqual(calls.dx, [], '★記録が無いのに教務システムへ送っている');
  assert.deepEqual(calls.skipped, [['in', 'notConfirmed']]);
  // 戻った先の画面では「登校する」が出る
  assert.deepEqual(pickAttendanceAction({ ...base, req: last }), { kind: 'record', op: 'in' });
});

test('★取り直しに失敗したときは成否不明のまま（記録し直すボタンは出ない）', async () => {
  const { deps, calls } = verifyDeps(false);
  assert.equal(await verifyFlow('in', deps), 'notConfirmed');
  const last = calls.reqs[calls.reqs.length - 1];
  assert.deepEqual(last, { kind: 'unknown', op: 'in', retried: true });
  assert.equal(isRecord(pickAttendanceAction({ ...base, req: last })), false);
});

test('★書けた直後の確認で absent が返っても「確認できた」とは扱わない', async () => {
  const calls = { reqs: [], dx: [] };
  const outcome = await recordFlow('in', {
    save: async () => true,
    saveFailureKind: () => '',
    confirmSaved: async () => 'absent',
    runDx: async (op) => { calls.dx.push(op); },
    isCurrent: () => true,
    setReq: (r) => { calls.reqs.push(r); },
  });
  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.reqs[calls.reqs.length - 1], { kind: 'unknown', op: 'in', retried: false });
});

// ── 画面が本当にこの決め方を使っているか（模造品で緑にしない）──────────
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const panel = stripComments(readFileSync(PANEL_TSX, 'utf8'));

test('★画面は pickAttendanceAction でボタンを決めている', () => {
  assert.ok(/pickAttendanceAction\(/.test(panel), '★画面が出し分けの関数を使っていない');
});

test('★画面に「もう一度、登校を記録する」「もう一度記録する」のボタンが残っていない', () => {
  assert.equal(panel.includes('もう一度、登校を記録する'), false);
  assert.equal(panel.includes('もう一度、下校を記録する'), false);
  assert.equal(/>\s*もう一度記録する\s*</.test(panel), false);
});
