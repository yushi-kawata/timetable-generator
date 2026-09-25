/* ============================================================================
   教室のiPadの「外枠」ページの試験 ── 2026-09-25
   ============================================================================

   走らせ方（他の試験と一緒に）: npm test

   ★このページは、登校・下校と座席表を【1枚にまとめる】ためだけのものです。
     中身は2つとも iframe で、それぞれが自分の世界で動きます。

   ★★だから試験の重心は3つ。
     ・座席表の iframe の URL を、外枠のハッシュから正しく組み立てられるか
     ・★登校・下校の iframe に、合い言葉が【渡っていない】こと
     ・触られないまま時間が経ったら、登校・下校に戻ること
   ============================================================================ */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const JS_PATH = process.env.KIOSK_PAGE_JS || path.join(ROOT, 'public', 'kiosk.js');
const HTML_PATH = process.env.KIOSK_PAGE_HTML || path.join(ROOT, 'public', 'kiosk.html');
const jsSrc = fs.readFileSync(JS_PATH, 'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');

/** ★試験で使う、本物に似せた合い言葉つきのハッシュ */
const GAS = 'https://script.google.com/macros/s/AKfycbTESTonlyNOTreal12345/exec';
const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);
const HASH = '#u=' + GAS + '&k=' + TOKEN;

/** 画面の無い器で読み込み、試験用の窓口だけを取り出す */
function loadCore() {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox);
  assert.ok(sandbox.KioskCore, '★KioskCore が出ていない');
  return sandbox.KioskCore;
}

/* ── 1. 画面を触らない部分 ────────────────────────────────────────── */

test('★座席表の iframe の URL を、ハッシュから組み立てる', () => {
  const core = loadCore();
  assert.equal(core.classroomSrc(HASH), 'classroom.html' + HASH);
});

test('★ハッシュが無いときは、ハッシュなしの座席表を指す', () => {
  const core = loadCore();
  // ★外枠が独自のエラー画面を作らない。向こうが「設定がされていません」と出す
  for (const h of ['', '#', null, undefined]) {
    assert.equal(core.classroomSrc(h), 'classroom.html', '入力: ' + String(h));
  }
});

test('★ハッシュの中身は、1文字も変えずに渡す', () => {
  const core = loadCore();
  // ★向こうは u= と k= を読むので、順序も記号もそのままでないと壊れます
  const weird = '#u=' + GAS + '&k=' + TOKEN + '&x=1';
  assert.equal(core.classroomSrc(weird), 'classroom.html' + weird);
});

test('★★登校・下校の iframe には、合い言葉を渡さない', () => {
  const core = loadCore();
  const src = core.qrSrc();
  assert.equal(src, 'qr.html');
  assert.equal(src.includes(TOKEN), false, '★合い言葉が入っている');
  assert.equal(src.includes('#'), false, '★ハッシュが付いている');
});

/* ── 2. 画面のある器で、実際に起動させる ──────────────────────────── */

/**
 * ★呼ばれたことを控える作り物（返り値だけ返す作り物では、呼び出しを試験できない）。
 *
 * ★★src は「いまの値」だけでなく【何回入れられたか】も控えます。
 *   本物の iframe は、同じURLをもう一度入れても【読み直し】が起きます。
 *   ところが最後の値だけを見ていると、同じ値を入れ直しても気づけません。
 *   （実際にそれで、切り替えのたびに読み直す壊し方が素通りしました）
 */
function makeEl() {
  const el = {
    hidden: false, className: '', textContent: '',
    attrs: {}, handlers: {}, srcWrites: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    fire(type) { if (this.handlers[type]) this.handlers[type](); },
  };
  let value = '';
  Object.defineProperty(el, 'src', {
    get() { return value; },
    set(v) { value = String(v); el.srcWrites.push(value); },
    enumerable: true, configurable: true,
  });
  return el;
}

function loadWithDom(hash) {
  const els = {
    qrFrame: makeEl(), seatsFrame: makeEl(),
    tabQr: makeEl(), tabSeats: makeEl(),
  };
  const timers = [];
  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById: (id) => els[id] || null,
      addEventListener: () => {},
    },
    window: { location: { hash: hash || '' }, addEventListener: () => {} },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    Date,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox);
  return { els, timers, core: sandbox.KioskCore };
}

test('★★起動すると、2枚とも読み込む（どちらも自分の世界で動く）', () => {
  const { els } = loadWithDom(HASH);
  assert.equal(els.qrFrame.src, 'qr.html');
  assert.equal(els.seatsFrame.src, 'classroom.html' + HASH);
});

test('★★合い言葉が、登校・下校の側へ回り込んでいないこと', () => {
  const { els } = loadWithDom(HASH);
  // ★QRの iframe に関わるものを、まとめて調べる
  const all = els.qrFrame.src + '|' + JSON.stringify(els.qrFrame.attrs);
  assert.equal(all.includes(TOKEN), false, '★合い言葉が渡っている');
  assert.equal(all.includes('AKfycb'), false, '★窓口のURLが渡っている');
  assert.equal(all.includes('#'), false, '★ハッシュが渡っている');
});

test('★最初に出るのは、登校・下校', () => {
  const { els } = loadWithDom(HASH);
  assert.equal(els.qrFrame.hidden, false, '★登校・下校が出ていない');
  assert.equal(els.seatsFrame.hidden, true, '★座席表が出てしまっている');
});

test('★帯を押すと、座席表に切り替わる', () => {
  const { els } = loadWithDom(HASH);
  els.tabSeats.fire('click');
  assert.equal(els.seatsFrame.hidden, false);
  assert.equal(els.qrFrame.hidden, true);
  els.tabQr.fire('click');
  assert.equal(els.qrFrame.hidden, false);
  assert.equal(els.seatsFrame.hidden, true);
});

test('★★切り替えても、2枚とも読み込んだまま（読み直さない）', () => {
  const { els } = loadWithDom(HASH);
  els.tabSeats.fire('click');
  els.tabQr.fire('click');
  els.tabSeats.fire('click');
  // ★★「いまの値」ではなく「何回入れたか」で見る。
  //   同じURLを入れ直しても、本物の iframe は読み直してしまうため。
  assert.equal(els.seatsFrame.srcWrites.length, 1, '★切り替えのたびに読み直している（座席表）');
  assert.equal(els.qrFrame.srcWrites.length, 1, '★切り替えのたびに読み直している（登校・下校）');
  assert.equal(els.seatsFrame.src, 'classroom.html' + HASH);
  assert.equal(els.qrFrame.src, 'qr.html');
});

test('★いま選ばれている方が分かる印が付く', () => {
  const { els } = loadWithDom(HASH);
  assert.equal(els.tabQr.attrs['aria-selected'], 'true');
  assert.equal(els.tabSeats.attrs['aria-selected'], 'false');
  els.tabSeats.fire('click');
  assert.equal(els.tabQr.attrs['aria-selected'], 'false');
  assert.equal(els.tabSeats.attrs['aria-selected'], 'true');
});

/* ── 3. しばらく触られなかったら、登校・下校に戻る ───────────────── */

test('★★90秒さわられなければ、登校・下校に戻る', () => {
  const { els, core } = loadWithDom(HASH);
  const T0 = new Date(2026, 8, 25, 10, 0, 0);
  core._setNowForTest(() => T0);
  els.tabSeats.fire('click');
  assert.equal(els.seatsFrame.hidden, false);

  core._setNowForTest(() => new Date(2026, 8, 25, 10, 1, 29));
  core._tickForTest();
  assert.equal(els.seatsFrame.hidden, false, '89秒では戻らない');

  core._setNowForTest(() => new Date(2026, 8, 25, 10, 1, 30));
  core._tickForTest();
  assert.equal(els.qrFrame.hidden, false, '★90秒たっても戻っていない');
  assert.equal(els.seatsFrame.hidden, true);
});

test('★帯を触ると、戻るまでの時間を数え直す', () => {
  const { els, core } = loadWithDom(HASH);
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 0));
  els.tabSeats.fire('click');
  // 89秒たったところで、もう一度触る
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 1, 29));
  els.tabSeats.fire('click');
  // そこから89秒（＝最初から178秒）でも、まだ戻らない
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 2, 58));
  core._tickForTest();
  assert.equal(els.seatsFrame.hidden, false, '★数え直せていない');
});

test('★登校・下校を見ているときは、何も起きない', () => {
  const { els, core } = loadWithDom(HASH);
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 0));
  core._setNowForTest(() => new Date(2026, 8, 25, 12, 0, 0));
  core._tickForTest();
  assert.equal(els.qrFrame.hidden, false);
  assert.equal(els.seatsFrame.hidden, true);
});

test('★★見張りを、間隔をつけて登録している', () => {
  const { timers, core } = loadWithDom(HASH);
  assert.equal(timers.length, 1, '★見張りが登録されていない');
  assert.equal(timers[0].ms, core.TICK_MS);
  assert.equal(typeof timers[0].fn, 'function');
});

test('★★登録された関数を自分で呼ぶと、見張りと同じことが起きる', () => {
  const { els, timers, core } = loadWithDom(HASH);
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 0));
  els.tabSeats.fire('click');
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 5, 0));
  timers[0].fn();
  assert.equal(els.qrFrame.hidden, false, '★登録されているのは見張りではない');
});

/* ── 4. 公開されるファイルの見張り ────────────────────────────────── */

test('★★公開ファイルに、合い言葉らしき長い文字列を書かない', () => {
  for (const [name, src] of [['kiosk.html', htmlSrc], ['kiosk.js', jsSrc]]) {
    const runs = src.match(/[A-Za-z0-9]{32,}/g) || [];
    assert.deepEqual(runs, [], '★長い文字列がある（' + name + '）');
    assert.equal(src.includes('AKfycb'), false, '★窓口のURLらしきものがある（' + name + '）');
    assert.equal(src.includes('script.google.com'), false, '★窓口のURLがある（' + name + '）');
  }
});

test('★合い言葉を端末に保存しない', () => {
  assert.equal(/localStorage/.test(jsSrc), false, '★端末に保存している');
  assert.equal(/sessionStorage/.test(jsSrc), false, '★端末に保存している');
  assert.equal(/document\.cookie/.test(jsSrc), false, '★端末に保存している');
});

test('★必要な入れ物がそろっている', () => {
  for (const id of ['qrFrame', 'seatsFrame', 'tabQr', 'tabSeats']) {
    assert.ok(htmlSrc.includes('id="' + id + '"'), '無い: ' + id);
  }
});

test('★中身の2枚を、自分のところから読み込む（外のサーバーを見ない）', () => {
  const srcs = [...htmlSrc.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['kiosk.js']);
  assert.equal(/firebase/i.test(htmlSrc), false);
  assert.equal(/assets\/index-/.test(htmlSrc), false);
});

test('★校内の呼び名や管理番号を書かない（そのまま配信されるため）', () => {
  const words = Buffer.from(
    '5Y+w5bizCuekvumVtwrmsbroo4EK55CG5LqLCuS6i+WLmemVtwroo4/lgbQK56eY5pu4CkE0LQpDMS0KQTMtCkM6XApzLWthdw==',
    'base64',
  ).toString('utf8').split('\n');
  assert.equal(words.length, 12, '★一覧の開き方が違う');
  for (const src of [htmlSrc, jsSrc]) {
    for (let i = 0; i < words.length; i++) {
      assert.equal(src.includes(words[i]), false,
        '★書いてはいけない語が入っています（一覧の ' + (i + 1) + ' 番目）');
    }
  }
});
