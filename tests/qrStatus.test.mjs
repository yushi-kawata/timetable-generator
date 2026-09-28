/* ============================================================================
   教務システム（younetDX）用QRの「今日のものか」の判定 ── 台帳 A4-98 恒久対処(2)
   ============================================================================
   ★2026-09-15、窓口が前日（9/14）のQRを配り続け、画面はそれをそのまま
     younetDX へ送っていた（qrData.date は一度も読まれていなかった）。
   ★ここで守ること
     ・届いたQRの日付が「今日（日本時間）」でなければ、送る先として使わない
     ・日付が無い／読めないものも「今日」とは扱わない
     ・取りに行けなかった（例外）ことを捨てない＝'error' として区別する
     ・送る直前にもう一度日付を見る（開いたまま日をまたいだ画面で古いQRを送らない）
   ============================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './_load-ts.mjs';

const { judgeQr, loadQr, pickDxUrl } = await loadTs('src/stores/qrStatus.ts');
const { toYmd } = await loadTs('src/lib/attendanceMatch.ts');

const TODAY = '2026-09-28';
const qr = (over = {}) => ({
  campus: '福岡',
  date: TODAY,
  tokou_qr: 'data:image/png;base64,AAAA',
  gekou_qr: 'data:image/png;base64,BBBB',
  tokou_url: 'https://you-net-dx.jp/attend?type=1&todate=aaa',
  gekou_url: 'https://you-net-dx.jp/attend?type=2&todate=bbb',
  updated_at: '2026/9/28 8:30:12',
  ...over,
});

// ── 4ケース（決裁で指定されたもの）──────────────────────────────────
test('日付が今日なら ok（QRを使う）', async () => {
  const r = await loadQr(async () => qr(), TODAY, toYmd);
  assert.equal(r.status, 'ok');
  assert.equal(r.data.tokou_url, qr().tokou_url);
});

test('★日付が前日なら stale（QRを持たない＝古いトークンを送らせない）', async () => {
  const r = await loadQr(async () => qr({ date: '2026-09-27' }), TODAY, toYmd);
  assert.equal(r.status, 'stale');
  assert.equal(r.data, null);
  assert.equal(r.qrDate, '2026-09-27', '何日のQRだったかは残す（切り分け用）');
});

test('★日付が無いものは今日と扱わない（stale）', async () => {
  for (const date of [undefined, '', '   ', 'きのう', null]) {
    const r = await loadQr(async () => qr({ date }), TODAY, toYmd);
    assert.equal(r.status, 'stale', `date=${JSON.stringify(date)}`);
    assert.equal(r.data, null);
  }
});

test('★取りに行けなかった（例外）は error。捨てずに区別する', async () => {
  const r = await loadQr(async () => { throw new TypeError('Failed to fetch'); }, TODAY, toYmd);
  assert.equal(r.status, 'error');
  assert.equal(r.data, null);
  // JSON として読めなかった場合も同じ
  const r2 = await loadQr(async () => { throw new SyntaxError('Unexpected token <'); }, TODAY, toYmd);
  assert.equal(r2.status, 'error');
});

// ── 周辺 ─────────────────────────────────────────────────────────────
test('窓口の既定の日付の形（2026/9/28）でも今日と読める', async () => {
  const r = await loadQr(async () => qr({ date: '2026/9/28' }), TODAY, toYmd);
  assert.equal(r.status, 'ok');
});

test('窓口が断った・中身が無い返事は error（今日かどうか以前）', async () => {
  for (const body of [{ error: 'unauthorized', reason: 'getClosed' }, null, 'x', {}]) {
    const r = await loadQr(async () => body, TODAY, toYmd);
    assert.equal(r.status, 'error', JSON.stringify(body));
    assert.equal(r.data, null);
  }
});

test('judgeQr は受け取った値を書き換えない', () => {
  const raw = qr({ date: '2026-09-27' });
  const before = JSON.stringify(raw);
  judgeQr(raw, TODAY, toYmd);
  assert.equal(JSON.stringify(raw), before);
});

// ── 送る直前の判定 ───────────────────────────────────────────────────
test('ok で日付が今日なら、登校は tokou_url・下校は gekou_url を送る', () => {
  const st = { status: 'ok', data: qr() };
  assert.deepEqual(pickDxUrl(st, 'in', TODAY, toYmd), { send: true, url: qr().tokou_url });
  assert.deepEqual(pickDxUrl(st, 'out', TODAY, toYmd), { send: true, url: qr().gekou_url });
});

test('ok でURLが空なら、空のまま送る（裏側が noDxUrl を audit に残す＝A4-86 のまま）', () => {
  const st = { status: 'ok', data: qr({ tokou_url: null }) };
  assert.deepEqual(pickDxUrl(st, 'in', TODAY, toYmd), { send: true, url: '' });
});

test('★開いたまま日をまたいだ画面（昨日 ok のまま）は送らない', () => {
  const st = { status: 'ok', data: qr({ date: '2026-09-27' }) };
  assert.deepEqual(pickDxUrl(st, 'in', TODAY, toYmd), { send: false, why: 'qrStale' });
});

test('stale / error / まだ取れていない は送らない', () => {
  assert.deepEqual(pickDxUrl({ status: 'stale', data: null }, 'in', TODAY, toYmd), { send: false, why: 'qrStale' });
  assert.deepEqual(pickDxUrl({ status: 'error', data: null }, 'out', TODAY, toYmd), { send: false, why: 'qrError' });
  assert.deepEqual(pickDxUrl({ status: 'idle', data: null }, 'in', TODAY, toYmd), { send: false, why: 'qrError' });
});
