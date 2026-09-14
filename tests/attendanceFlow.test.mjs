/* ============================================================================
   出欠の記録の【順番】の試験 ── 台帳 A4-86
   ============================================================================
   ここで守りたいこと（この2本が本体）:
     ・校内の記録が書けたなら、確認できなくても younetDX 連携を試す
     ・校内の記録が書けていないなら、連携しない

   2026-09-07 以降、younetDX への登録が1度も呼ばれていなかった。
   原因は「保存の確認に失敗したら return する」という順番。生徒に押して
   もらわないと分からない作りだったので、ここで押さずに試せるようにした。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const { recordFlow, verifyFlow } = await loadTs('src/components/student/attendanceFlow.ts');

/** 呼ばれた回数と引数を数える土台 */
function makeDeps(over = {}) {
  const calls = { dx: [], reqs: [], confirmed: [], saved: [], skipped: [] };
  const deps = {
    save: async op => { calls.saved.push(op); return true; },
    saveFailureKind: () => '',
    confirmSaved: async () => true,
    runDx: async op => { calls.dx.push(op); },
    isCurrent: () => true,
    setReq: r => { calls.reqs.push(r); },
    onConfirmed: op => { calls.confirmed.push(op); },
    onDxSkipped: (op, why) => { calls.skipped.push([op, why]); },
    ...over,
  };
  return { deps, calls };
}

const lastReq = calls => calls.reqs[calls.reqs.length - 1];

// ── 本体1: 確認できなくても連携は試す ──────────────────────────────
test('保存の確認に失敗しても、younetDX 連携は試される（A4-86 の本体）', async () => {
  const { deps, calls } = makeDeps({ confirmSaved: async () => false });

  const outcome = await recordFlow('in', deps);

  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.dx, ['in'], '連携が1回だけ呼ばれること');
  assert.deepEqual(lastReq(calls), { kind: 'unknown', op: 'in', retried: false },
    '確認できていないのに「記録しました」にしないこと');
  assert.deepEqual(calls.confirmed, [], '確認できていないのに完了扱いにしないこと');
});

test('確認に失敗しても連携する ── 下校も同じ', async () => {
  const { deps, calls } = makeDeps({ confirmSaved: async () => false });
  const outcome = await recordFlow('out', deps);
  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.dx, ['out']);
});

test('確認の途中で例外が出ても、連携は試される', async () => {
  const { deps, calls } = makeDeps({
    confirmSaved: async () => { throw new Error('取り直しに失敗'); },
  });
  const outcome = await recordFlow('in', deps);
  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.dx, ['in']);
});

// ── 本体2: 校内保存が失敗したら連携しない ──────────────────────────
test('校内保存が拒否された（権限）ときは、連携しない', async () => {
  const { deps, calls } = makeDeps({
    save: async () => false,
    saveFailureKind: () => 'forbidden',
  });

  const outcome = await recordFlow('in', deps);

  assert.equal(outcome, 'saveFailed');
  assert.deepEqual(calls.dx, [], '学校に記録が無いのに向こうだけ登録してはいけない');
  assert.deepEqual(lastReq(calls), { kind: 'failed', op: 'in' });
});

test('校内保存がログイン切れで拒否されたときも、連携しない', async () => {
  const { deps, calls } = makeDeps({
    save: async () => false,
    saveFailureKind: () => 'signin',
  });
  assert.equal(await recordFlow('in', deps), 'saveFailed');
  assert.deepEqual(calls.dx, []);
});

test('校内保存が通信で失敗した（成否不明）ときも、連携しない', async () => {
  const { deps, calls } = makeDeps({
    save: async () => false,
    saveFailureKind: () => 'network',
  });

  const outcome = await recordFlow('in', deps);

  assert.equal(outcome, 'saveUnknown');
  assert.deepEqual(calls.dx, []);
  assert.deepEqual(lastReq(calls), { kind: 'unknown', op: 'in', retried: false });
});

// ── ふつうに通ったとき ──────────────────────────────────────────
test('保存できて確認もできたら、連携を試し「記録しました」にする', async () => {
  const { deps, calls } = makeDeps();

  const outcome = await recordFlow('in', deps);

  assert.equal(outcome, 'confirmed');
  assert.deepEqual(calls.dx, ['in']);
  assert.deepEqual(lastReq(calls), { kind: 'idle' });
  assert.deepEqual(calls.confirmed, ['in']);
});

test('順番は 送信中 → 確認中 → 結果', async () => {
  const { deps, calls } = makeDeps();
  await recordFlow('in', deps);
  assert.deepEqual(calls.reqs.map(r => r.kind), ['sending', 'verifying', 'idle']);
});

test('書き込みの返事が返った時点で onSaveSettled が1回呼ばれる（遅延表示を止める）', async () => {
  let settled = 0;
  const { deps } = makeDeps({ onSaveSettled: () => { settled += 1; } });
  await recordFlow('in', deps);
  assert.equal(settled, 1);
});

// ── 追い越し ────────────────────────────────────────────────────
test('新しい操作に追い越されたら、古い手続きは連携しない（二重登録を避ける）', async () => {
  const { deps, calls } = makeDeps({ isCurrent: () => false });
  assert.equal(await recordFlow('in', deps), 'superseded');
  assert.deepEqual(calls.dx, []);
});

// ── 再試行の経路（記録を確認する）──────────────────────────────────
test('「記録を確認する」で記録が見つかったら、連携を再試行する', async () => {
  const { deps, calls } = makeDeps({ dxAlreadySent: () => false });

  const outcome = await verifyFlow('in', deps);

  assert.equal(outcome, 'confirmed');
  assert.deepEqual(calls.dx, ['in'], '再試行の経路が生きていること');
  assert.deepEqual(lastReq(calls), { kind: 'idle' });
});

test('すでに送信できているときは、確認しても二重に送らない', async () => {
  const { deps, calls } = makeDeps({ dxAlreadySent: () => true });
  assert.equal(await verifyFlow('in', deps), 'confirmed');
  assert.deepEqual(calls.dx, []);
});

test('「記録を確認する」で記録が見つからないときは、連携しない', async () => {
  const { deps, calls } = makeDeps({
    confirmSaved: async () => false,
    dxAlreadySent: () => false,
  });

  const outcome = await verifyFlow('in', deps);

  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.dx, [], '校内に記録が無いまま向こうだけ登録しない');
  assert.deepEqual(lastReq(calls), { kind: 'unknown', op: 'in', retried: true });
});

test('「記録を確認する」は新しい校内記録を作らない（読むだけ）', async () => {
  const { deps, calls } = makeDeps({ dxAlreadySent: () => false });
  await verifyFlow('in', deps);
  assert.deepEqual(calls.saved, [], 'checkIn / checkOut を呼ばないこと');
});

// ── 見送りを黙って済ませない（画面側の「無言の出口」を塞ぐ）────────────
//   ★台帳 A4-86 の本体は「連携が呼ばれない」ことだったが、10日間も気づけな
//     かった理由は【呼ばなかったことがどこにも残らない】ことだった。
//     裏側（GAS）は失敗しても audit に1行残す＝無言の出口が無い。
//     画面側にだけ無言の出口が残っていると、「audit に dxCheckIn が無い」を
//     見ても ①画面が呼んでいない ②呼んだが手前で落ちた の区別が付かない。
//   ★連携を【見送った】ときは、必ずその理由を画面へ伝えること。
test('校内保存が拒否されたとき、連携を見送ったことを画面へ伝える', async () => {
  const { deps, calls } = makeDeps({
    save: async () => false,
    saveFailureKind: () => 'forbidden',
  });

  const outcome = await recordFlow('out', deps);

  assert.equal(outcome, 'saveFailed');
  assert.deepEqual(calls.dx, [], '学校に記録が無いのに向こうだけ登録してはいけない');
  assert.deepEqual(calls.skipped, [['out', 'saveFailed']],
    '見送ったことを黙って済ませないこと');
});

test('校内保存の成否が分からないときも、見送りを画面へ伝える', async () => {
  const { deps, calls } = makeDeps({
    save: async () => false,
    saveFailureKind: () => 'network',
  });

  const outcome = await recordFlow('out', deps);

  assert.equal(outcome, 'saveUnknown');
  assert.deepEqual(calls.dx, []);
  assert.deepEqual(calls.skipped, [['out', 'saveUnknown']]);
});

test('「記録を確認する」で記録が見つからないときも、見送りを画面へ伝える', async () => {
  const { deps, calls } = makeDeps({
    confirmSaved: async () => false,
    dxAlreadySent: () => false,
  });

  const outcome = await verifyFlow('out', deps);

  assert.equal(outcome, 'notConfirmed');
  assert.deepEqual(calls.dx, []);
  assert.deepEqual(calls.skipped, [['out', 'notConfirmed']]);
});

// ★出し過ぎも事故になる（下の2本は「言わないこと」の試験）
test('追い越されたときは見送りを伝えない（新しい操作の表示を上書きしない）', async () => {
  const { deps, calls } = makeDeps({ isCurrent: () => false });
  assert.equal(await recordFlow('in', deps), 'superseded');
  assert.deepEqual(calls.dx, []);
  assert.deepEqual(calls.skipped, [], '新しい操作がこれから連携する。黙って譲ること');
});

test('連携を試したときは見送り扱いにしない', async () => {
  const { deps, calls } = makeDeps({ confirmSaved: async () => false });
  assert.equal(await recordFlow('out', deps), 'notConfirmed');
  assert.deepEqual(calls.dx, ['out']);
  assert.deepEqual(calls.skipped, []);
});
