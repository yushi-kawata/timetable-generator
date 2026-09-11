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
  const calls = { dx: [], reqs: [], confirmed: [], saved: [] };
  const deps = {
    save: async op => { calls.saved.push(op); return true; },
    saveFailureKind: () => '',
    confirmSaved: async () => true,
    runDx: async op => { calls.dx.push(op); },
    isCurrent: () => true,
    setReq: r => { calls.reqs.push(r); },
    onConfirmed: op => { calls.confirmed.push(op); },
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
