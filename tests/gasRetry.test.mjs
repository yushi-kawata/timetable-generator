/* ============================================================================
   GAS の応答が不安定なときの、やり直しの決まりの試験 ── 台帳 A4-101
   ============================================================================
   2026-09-18 の症状＝画面が断続的に「通信に失敗しました」。
   script.googleusercontent.com（GASの応答の2段目）への 404 が6件＝
   画面が読み込み時に叩く窓口の数。窓口そのものは生きていた。

   ここで守ること:
     ・つながらない／404・5xx／JSONが読めない → やり直す
     ・★拒否（unauthorized / forbidden）→ やり直さない（正しい返事なので無駄）
     ・★書き込み → やり直さない（二重に書く恐れ）
     ・★知らない窓口 → やり直さない（安全側に倒す）
     ・失敗したら、何が起きたかを画面に出せるだけの材料を返す
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const {
  GAS_RETRY_DELAYS_MS,
  GAS_MAX_ATTEMPTS,
  RETRYABLE_READ_ACTIONS,
  isRetryableAction,
  shouldRetry,
  retryDelayMs,
  urlTail,
  gasFailureDetail,
  MSG_GAS_FLAKY,
} = await loadTs('src/lib/gasRetry.ts');

const URL_OK = 'https://script.google.com/macros/s/AKfycbwW8j8jnGDBD8PKO_EEfCOFik/exec';

// ── どの窓口をやり直してよいか ────────────────────────────────────

test('読み取りの窓口はやり直してよい', () => {
  for (const a of ['getTT', 'getMe', 'getStudents', 'getAttendance', 'getPeriod2', 'getRecs', 'getSeating']) {
    assert.equal(isRetryableAction(a), true, a + ' がやり直せない');
  }
});

test('★書き込みの窓口はやり直さない（二重に書く恐れ）', () => {
  for (const a of [
    'saveSeating', 'saveStudents', 'saveTT', 'checkIn', 'checkOut',
    'savePeriod2', 'saveRec', 'deleteRec', 'clearRecs',
    'staffRecordAttendance', 'proxyAttendance', 'dxCheckIn',
  ]) {
    assert.equal(isRetryableAction(a), false, a + ' をやり直す作りになっている');
  }
});

test('★知らない窓口はやり直さない（安全側に倒す）', () => {
  assert.equal(isRetryableAction('saveSomethingNew'), false);
  assert.equal(isRetryableAction(''), false);
  assert.equal(isRetryableAction(undefined), false);
});

test('読み取りの一覧に、書き込みらしい名前が紛れていない', () => {
  for (const a of RETRYABLE_READ_ACTIONS) {
    assert.equal(a.startsWith('get'), true, a + ' は get で始まらない');
  }
});

// ── やり直すかどうか ──────────────────────────────────────────────

test('つながらない／404／5xx／JSONが読めない は、やり直す', () => {
  for (const outcome of ['networkError', 'httpError', 'badJson']) {
    assert.equal(
      shouldRetry({ action: 'getSeating', outcome, attempt: 1 }),
      true,
      outcome + ' をやり直していない',
    );
  }
});

test('★拒否（unauthorized / forbidden）は1回でやめる', () => {
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'rejected', attempt: 1 }), false);
  assert.equal(shouldRetry({ action: 'getStudents', outcome: 'rejected', attempt: 1 }), false);
});

test('通ったらやり直さない', () => {
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'ok', attempt: 1 }), false);
});

test('★書き込みは、つながらなくてもやり直さない', () => {
  assert.equal(shouldRetry({ action: 'saveSeating', outcome: 'networkError', attempt: 1 }), false);
  assert.equal(shouldRetry({ action: 'saveSeating', outcome: 'httpError', attempt: 1 }), false);
  assert.equal(shouldRetry({ action: 'checkIn', outcome: 'badJson', attempt: 1 }), false);
});

test('★3回で打ち切る（永久に叩き続けない）', () => {
  assert.equal(GAS_MAX_ATTEMPTS, 3);
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'httpError', attempt: 1 }), true);
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'httpError', attempt: 2 }), true);
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'httpError', attempt: 3 }), false);
  assert.equal(shouldRetry({ action: 'getSeating', outcome: 'httpError', attempt: 9 }), false);
});

test('待ち時間は短く、だんだん延びる（画面が固まって見えない範囲）', () => {
  assert.deepEqual(GAS_RETRY_DELAYS_MS, [300, 800]);
  assert.equal(retryDelayMs(1), 300);
  assert.equal(retryDelayMs(2), 800);
  assert.equal(retryDelayMs(3), 0, '3回目のあとに待とうとしている');
  assert.equal(retryDelayMs(0), 0);
});

// ── 失敗したときに画面へ出す材料 ──────────────────────────────────

test('★失敗の1行に「番号・回数・窓口」が入る（切り分けに20分かけないため）', () => {
  const d = gasFailureDetail({ status: 404, attempts: 3, url: URL_OK });
  assert.ok(d.includes('404'), d);
  assert.ok(d.includes('3 回試しました'), d);
  assert.ok(d.includes('窓口'), d);
});

test('★窓口は末尾だけ出す（全部は出さない）', () => {
  const tail = urlTail(URL_OK);
  assert.ok(tail.length <= 21, tail);
  assert.equal(URL_OK.endsWith(tail.slice(1)), true);
  assert.equal(tail.includes('script.google.com'), false, '窓口を丸ごと出している');
});

test('窓口の設定が無いときも、そうと分かる', () => {
  assert.equal(urlTail(''), '(窓口の設定なし)');
});

test('HTTPの番号が無い失敗（つながらない）でも、回数と窓口は出る', () => {
  const d = gasFailureDetail({ status: null, attempts: 3, url: URL_OK });
  assert.equal(d.includes('応答'), false);
  assert.ok(d.includes('3 回試しました'), d);
});

test('★言い方は「壊れた」ではない（つなぎ直せば通るため）', () => {
  assert.ok(MSG_GAS_FLAKY.includes('不安定'));
  assert.equal(MSG_GAS_FLAKY.includes('壊れ'), false);
});
