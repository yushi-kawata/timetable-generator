/* ============================================================================
   教室の座席表（独立ページ）── 開いて最初の取得に失敗したときの「すぐのやり直し」
   ============================================================================

   守りたいこと:
     ・開いて最初の取得に失敗したら、5秒後に【1回だけ】やり直す
     ・そのやり直しも失敗したら、以降は1分ごと（RETRY_MS）に戻る
     ・一度でも取れたあとの失敗では、すぐのやり直しをしない

   負の対照（★わざと壊して赤くなることを確かめる）:
     CLASSROOM_PAGE_JS=<壊した写しのパス> node --test tests/classroomFirstRetry.test.mjs

   ★作り物の画面を与えて start() を実際に走らせる。純粋な関数だけを
     試しても、起動の経路で予約されているかは分からないため。
   ============================================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const JS_PATH = process.env.CLASSROOM_PAGE_JS || path.join(ROOT, 'public', 'classroom.js');
const jsSrc = fs.readFileSync(JS_PATH, 'utf8');

const GOOD_URL = 'https://script.google.com/macros/s/AKfycbTEST_only-000/exec';
const TOKEN = 'test-token-not-real';

const GOOD_JSON = {
  open: true,
  room: 'A教室',
  day: '月',
  dateLabel: '9月28日',
  weekdayLabel: '月',
  grid: { rows: 2, cols: 2 },
  seats: [{ row: 1, col: 1, name: 'テスト' }],
  asof: '2026-09-28T08:30:00',
};

function fakeEl() {
  return {
    textContent: '',
    className: '',
    style: {},
    children: [],
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    querySelector() { return fakeEl(); },
  };
}

/** 次の小さな仕事（then の連鎖）が全部片付くまで待つ */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
}

/**
 * 作り物の画面でページを起動する。
 * @param responses fetch が順に返すもの。'fail' なら通信の失敗、それ以外は JSON
 */
function boot(responses) {
  const els = {};
  for (const id of ['grid', 'room', 'day', 'asof', 'notice', 'closed', 'mask', 'fail', 'clock']) {
    els[id] = fakeEl();
  }
  const timeouts = [];
  let fetchCount = 0;
  const win = {
    location: { hash: '#u=' + GOOD_URL + '&k=' + TOKEN, pathname: '/x/classroom.html', search: '' },
    history: { replaceState() {}, pushState() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Boolean,
    isFinite, Error, RegExp, URLSearchParams, Promise,
    window: win,
    document: {
      readyState: 'complete',
      getElementById: (id) => els[id] || null,
      createElement: () => fakeEl(),
      addEventListener: () => {},
    },
    setInterval: () => 0,
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    fetch: () => {
      const r = responses[Math.min(fetchCount, responses.length - 1)];
      fetchCount++;
      if (r === 'fail') return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(r) });
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(jsSrc, ctx, { filename: JS_PATH });
  return {
    ctx,
    els,
    timeouts,
    get fetchCount() { return fetchCount; },
  };
}

test('★最初の取得に失敗したら、5秒後のやり直しが1回だけ予約される', async () => {
  const env = boot(['fail', 'fail', 'fail']);
  await settle();
  assert.equal(env.fetchCount, 1);
  assert.equal(env.timeouts.length, 1, '★すぐのやり直しが予約されていない');
  assert.equal(env.timeouts[0].ms, 5000);
  // 失敗の表示は出ている
  assert.notEqual(env.els.fail.style.display, 'none');
});

test('★5秒後のやり直しで本当に取りにいき、それも失敗したら以降は予約しない（1分に戻る）', async () => {
  const env = boot(['fail', 'fail', 'fail']);
  await settle();
  env.timeouts[0].fn();
  await settle();
  assert.equal(env.fetchCount, 2, '★やり直しで取りにいっていない');
  assert.equal(env.timeouts.length, 1, '★2回目の失敗でも5秒のやり直しを予約している（叩き続ける）');
});

test('★5秒後のやり直しで取れたら、座席表が出る', async () => {
  const env = boot(['fail', GOOD_JSON]);
  await settle();
  env.timeouts[0].fn();
  await settle();
  assert.equal(env.fetchCount, 2);
  assert.equal(env.els.fail.style.display, 'none', '★取れたのに失敗の表示が残っている');
  assert.equal(env.els.grid.children.length, 4, '★座席が描かれていない');
});

test('最初から取れたときは、すぐのやり直しを予約しない', async () => {
  const env = boot([GOOD_JSON]);
  await settle();
  assert.equal(env.fetchCount, 1);
  assert.equal(env.timeouts.length, 0);
});

test('判断の関数：一度でも取れたあと・使ったあとは 0（予約しない）', () => {
  const env = boot([GOOD_JSON]);
  const C = env.ctx.ClassroomCore;
  assert.equal(C.FIRST_RETRY_MS, 5000);
  assert.equal(C.earlyRetryDelay({ everLoaded: false, earlyRetryUsed: false }), 5000);
  assert.equal(C.earlyRetryDelay({ everLoaded: false, earlyRetryUsed: true }), 0);
  assert.equal(C.earlyRetryDelay({ everLoaded: true, earlyRetryUsed: false }), 0);
  // ★ふだんの間隔は変えていない
  assert.equal(C.RETRY_MS, 60 * 1000);
  assert.equal(C.RELOAD_MS, 10 * 60 * 1000);
});
