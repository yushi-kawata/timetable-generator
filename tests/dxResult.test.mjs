/* ============================================================================
   連携の「理由」と、生徒に出す文言の試験 ── 台帳 A4-86
   ============================================================================
   裏側（GAS）は理由を返しているのに、画面が true/false に潰していた。
   ここでは
     ・裏側の返事が、画面の使える形（理由つき）になること
     ・理由ごとに文言があり、次にやることが書いてあること
     ・向こう側の結果を保証する言い方（反映しました 等）を混ぜないこと
   を見る。
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const { toDxResult, normalizeDxReason } = await loadTs('src/stores/dxResult.ts');
const { DX_REASON_TEXT, DX_RETRYABLE, DX_BANNED_WORDS, DX_SKIP_TEXT } =
  await loadTs('src/components/student/dxMessages.ts');

/** 裏側が返しうる理由。★増えたらここも増やすこと */
const ALL_REASONS = [
  'noDxUrl', 'badDxUrl', 'notEnrolled', 'noPassword', 'dxLoginFailed',
  'signin', 'forbidden', 'network', 'unknown',
];

// ── 裏側の返事を、理由つきで持ち帰る ───────────────────────────────
test('裏側が ok:true を返したら成功', () => {
  assert.deepEqual(toDxResult({ ok: true }), { ok: true });
});

test('裏側の理由（noPassword）をそのまま持ち帰る', () => {
  assert.deepEqual(toDxResult({ ok: false, reason: 'noPassword' }),
    { ok: false, reason: 'noPassword', code: undefined });
});

test('裏側の理由（notEnrolled）をそのまま持ち帰る', () => {
  assert.equal(toDxResult({ ok: false, reason: 'notEnrolled' }).reason, 'notEnrolled');
});

test('理由が無く code だけのときは unknown ＋ code を残す', () => {
  assert.deepEqual(toDxResult({ ok: false, code: 500 }),
    { ok: false, reason: 'unknown', code: 500 });
});

test('知らない理由は unknown に寄せる（別の理由へ勝手に寄せない）', () => {
  assert.equal(normalizeDxReason('なにか新しい理由'), 'unknown');
  assert.equal(normalizeDxReason(undefined), 'unknown');
  assert.equal(normalizeDxReason(123), 'unknown');
});

test('返事そのものが無いときも unknown（落ちない）', () => {
  assert.deepEqual(toDxResult(undefined), { ok: false, reason: 'unknown', code: undefined });
});

// ── 生徒に出す文言 ──────────────────────────────────────────────
test('すべての理由に文言がある（理由を増やしたら文言も増やす）', () => {
  assert.deepEqual(Object.keys(DX_REASON_TEXT).sort(), [...ALL_REASONS].sort());
  for (const r of ALL_REASONS) {
    assert.ok(DX_REASON_TEXT[r] && DX_REASON_TEXT[r].length > 0, `${r} の文言が空`);
  }
});

test('どの文言にも、次にやることが書いてある', () => {
  for (const r of ALL_REASONS) {
    const t = DX_REASON_TEXT[r];
    const hasNextStep = /先生|もう一度|ログイン/.test(t);
    assert.ok(hasNextStep, `${r}「${t}」に次の一手が無い`);
  }
});

test('向こう側の結果を保証する言い方を混ぜない', () => {
  for (const r of ALL_REASONS) {
    for (const banned of DX_BANNED_WORDS) {
      assert.ok(DX_REASON_TEXT[r].indexOf(banned) === -1,
        `${r} の文言に「${banned}」が入っている`);
    }
  }
});

test('名簿の登録アドレスの件は、本番のGASが指定した言い方にそろえる', () => {
  // 本番 GAS のコメント:「名簿の登録アドレスが違う可能性があります。先生にご連絡ください」
  assert.match(DX_REASON_TEXT.notEnrolled, /名簿の登録アドレスが違う可能性があります/);
});

test('生徒が押しても直らないものに、再試行ボタンを出さない', () => {
  for (const r of ['notEnrolled', 'noPassword', 'badDxUrl', 'forbidden']) {
    assert.ok(DX_RETRYABLE.indexOf(r) === -1, `${r} に再試行を出してはいけない`);
  }
});

test('押し直して直る見込みのあるものには、再試行ボタンを出す', () => {
  for (const r of ['network', 'noDxUrl', 'unknown']) {
    assert.ok(DX_RETRYABLE.indexOf(r) !== -1, `${r} には再試行を出す`);
  }
});

// ── 連携を「見送った」ときの文言 ────────────────────────────────────
//   ★送れなかった（failed）と、そもそも送っていない（skipped）は別物。
//     ここを同じ言い方にすると、台帳 A4-86 と同じ「何も起きなかったのと
//     区別が付かない」状態に戻る。
const ALL_SKIPS = ['saveFailed', 'saveUnknown', 'notConfirmed'];

test('見送りの理由すべてに文言がある', () => {
  assert.deepEqual(Object.keys(DX_SKIP_TEXT).sort(), [...ALL_SKIPS].sort());
  for (const r of ALL_SKIPS) {
    assert.ok(DX_SKIP_TEXT[r] && DX_SKIP_TEXT[r].length > 0, `${r} の文言が空`);
  }
});

test('見送りの文言にも、次にやることが書いてある', () => {
  for (const r of ALL_SKIPS) {
    const t = DX_SKIP_TEXT[r];
    assert.ok(/先生|もう一度|ログイン/.test(t), `${r}「${t}」に次の一手が無い`);
  }
});

test('見送りの文言は「送っていない」と言い切る（送ったように読ませない）', () => {
  for (const r of ALL_SKIPS) {
    const t = DX_SKIP_TEXT[r];
    assert.ok(t.indexOf('送っていません') !== -1,
      `${r}「${t}」が、送っていないことを言い切っていない`);
    for (const banned of DX_BANNED_WORDS) {
      assert.ok(t.indexOf(banned) === -1, `${r} の文言に「${banned}」が入っている`);
    }
  }
});
