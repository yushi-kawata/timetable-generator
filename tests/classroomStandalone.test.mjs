/* ============================================================================
   教室の座席表の【独立ページ】の試験 ── 2026-09-24
   ============================================================================

   走らせ方（他の試験と一緒に）: npm test

   負の対照（★わざと壊して赤くなることを確かめる）:
     CLASSROOM_PAGE_JS=<壊した写しのパス> node --test tests/classroomStandalone.test.mjs

   ★このページは【ログイン不要】です。だから試験の重心は
     ★★「URL を書き換えられても、変なところに繋ぎ替えられないか」
     ★★「氏名が HTML として解釈される道が無いか」
     ★★「React の画面と本当に切れているか」
     の3つにあります。

   ★public/ の中身は Vite が【そのまま dist へ写す】だけです。
     だからこのファイルは、本番に出るものと同じものを読んでいます。
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
const HTML_PATH = process.env.CLASSROOM_PAGE_HTML || path.join(ROOT, 'public', 'classroom.html');

const jsSrc = fs.readFileSync(JS_PATH, 'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');

/* ──────────────────────────────────────────────────────────────────────────
   ★★注記を取り除いてから見る（2026-09-24 に踏んだ罠）

   最初の版は、ソースをそのまま文字列で検索していました。そのため
   「★Firebase を読み込みません」「★innerHTML は使いません」という
   【注意書きそのもの】に当たって、試験が赤くなりました。
   ＝★丁寧に注意書きを書くほど赤くなる、という壊れた試験です。
   （同じ罠を GAS 側の getDataRange の試験でも踏んでいます）

   ★見るべきは【動くコード】です。注記は取り除いてから見ます。
   ────────────────────────────────────────────────────────────────────────── */

/** JavaScript から // と ブロック注記 を取り除く */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < src.length && src.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

/** HTML から <!-- --> を取り除く */
function stripHtmlComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src.slice(i, i + 4) === '<!--') {
      i += 4;
      while (i < src.length && src.slice(i, i + 3) !== '-->') i++;
      i += 3;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

const jsCode = stripJsComments(jsSrc);
const htmlCode = stripHtmlComments(htmlSrc);

/**
 * ★★取り除く道具そのものを確かめる。
 *   もし取り除きすぎて空になっていたら、下の検査は【全部素通り】します
 *   （＝何も見ていないのに緑になる）。それを防ぐ杭です。
 */
test('★取り除く道具が効きすぎていない（中身が残っている）', () => {
  for (const marker of ['ClassroomCore', 'textContent', 'fetch(', 'parseBookmark']) {
    assert.ok(jsCode.includes(marker), '★コードが消えている: ' + marker);
  }
  for (const marker of ['<div id="grid"', 'classroom.js', '<style>']) {
    assert.ok(htmlCode.includes(marker), '★HTML が消えている: ' + marker);
  }
  assert.ok(jsCode.length > jsSrc.length * 0.2, '★取り除きすぎている');
  assert.ok(jsCode.length < jsSrc.length, '★何も取り除けていない');
});

/**
 * 画面を持たない器で読み込む。
 * ★document を置かないので、画面を触る部分は動きません（early return します）。
 *   ＝この試験が見ているのは「判断するところ」だけです。
 */
function loadCore() {
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Boolean,
    isFinite, Error, RegExp, URLSearchParams,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(jsSrc, ctx, { filename: JS_PATH });
  assert.ok(ctx.ClassroomCore, '★ClassroomCore が出ていない');
  return ctx.ClassroomCore;
}

const C = loadCore();

const GOOD_URL = 'https://script.google.com/macros/s/AKfycbxAbc123_-def456/exec';
const TOKEN = 'a'.repeat(32) + 'b'.repeat(32);

/* ── 1. ★★ブックマークの読み取り（ここが破られると繋ぎ替えられる）──── */

test('ふつうのブックマークから、窓口URLと合い言葉を取り出せる', () => {
  const r = C.parseBookmark('#u=' + GOOD_URL + '&k=' + TOKEN);
  assert.equal(r.ok, true);
  assert.equal(r.url, GOOD_URL);
  assert.equal(r.token, TOKEN);
});

test('★★script.google.com 以外の窓口は通さない（別の相手に繋ぎ替えられない）', () => {
  const bad = [
    'https://evil.example/exec',
    'http://script.google.com/macros/s/AAA/exec',           // http
    'https://script.google.com.evil.example/macros/s/A/exec',
    'https://script.googleusercontent.com/macros/s/AAA/exec',
    'https://script.google.com/macros/s/AAA/dev',           // /dev は通さない
    'https://script.google.com/macros/s/AAA/exec?x=1',      // 後ろに付いている
    'javascript:alert(1)',
    '//script.google.com/macros/s/AAA/exec',
  ];
  for (const u of bad) {
    assert.equal(C.isAllowedGasUrl(u), false, '★通してしまった: ' + u);
    const r = C.parseBookmark('#u=' + encodeURIComponent(u) + '&k=' + TOKEN);
    assert.equal(r.ok, false, '★通してしまった: ' + u);
    assert.equal(r.reason, 'badUrl');
  }
});

test('★合い言葉が無ければ、窓口を叩きにいかない', () => {
  const r = C.parseBookmark('#u=' + GOOD_URL);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'noToken');
});

test('★ハッシュが空でも落ちない', () => {
  for (const h of ['', '#', null, undefined]) {
    const r = C.parseBookmark(h);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'noHash');
  }
});

test('窓口URLだけ無いときは、そうと分かる理由になる', () => {
  const r = C.parseBookmark('#k=' + TOKEN);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'noUrl');
});

test('★合い言葉に記号が入っていても、そのまま窓口に渡る形になる', () => {
  const t = 'ab+cd/ef=gh&ij';
  const r = C.parseBookmark('#u=' + GOOD_URL + '&k=' + encodeURIComponent(t));
  assert.equal(r.ok, true);
  assert.equal(r.token, t);
  const url = C.requestUrl(r.url, r.token);
  assert.ok(url.includes('k=ab%2Bcd%2Fef%3Dgh%26ij'), url);
});

test('叩く URL に、約束した窓口の名前が入っている', () => {
  const url = C.requestUrl(GOOD_URL, TOKEN);
  assert.ok(url.startsWith(GOOD_URL + '?'), url);
  assert.ok(url.includes('action=classroomSeats'), url);
});

/* ── 2. 受け取った中身の確かめ ──────────────────────────────────── */

function payload(over) {
  return Object.assign({
    open: true, room: 'A教室（2年）', day: '木',
    dateLabel: '9月24日', weekdayLabel: '木曜日',
    grid: { rows: 4, cols: 7 },
    seats: [{ name: 'テスト太郎', row: 2, col: 3 }],
    unknownCount: 0,
    asof: '2026-09-24 08:40:12',
  }, over || {});
}

test('約束どおりの中身は通る', () => {
  const v = C.normalize(payload());
  assert.equal(v.ok, true);
  assert.equal(v.day, '木');
  assert.equal(v.rows, 4);
  assert.equal(v.cols, 7);
});

test('★いつの座席表か分からないもの（asof 無し）は出さない', () => {
  const v = C.normalize(payload({ asof: undefined }));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'noAsof');
});

test('★合い言葉が使えなくなったときを、取得の失敗と混ぜない', () => {
  const v = C.normalize({ error: 'notFound' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'notFound');
});

test('★形が違うものを黙って描かない', () => {
  for (const bad of [null, undefined, 'x', 42, {}, { grid: {} },
                     payload({ grid: { rows: 0, cols: 7 } }),
                     payload({ seats: 'not-an-array' })]) {
    const v = C.normalize(bad);
    assert.equal(v.ok, false, '★通してしまった: ' + JSON.stringify(bad));
  }
});

test('窓口が「読み取れない」と言ったときは、そう出す', () => {
  const v = C.normalize({ error: 'seatingUnavailable' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'unavailable');
});

/* ── 3. 教室の形に並べる ────────────────────────────────────────── */

test('席が正しい場所に入る（行1が教卓側・列1が左）', () => {
  const v = C.normalize(payload());
  const g = C.buildGrid(v);
  assert.equal(g.cells.length, 4);
  assert.equal(g.cells[0].length, 7);
  assert.equal(g.cells[1][2], 'テスト太郎');   // row2 col3
  assert.equal(g.cells[0][0], '');
});

test('★教室の外を指す席を、黙って捨てない（空席に見せない）', () => {
  const v = C.normalize(payload({
    seats: [{ name: 'はみ出し', row: 9, col: 1 }, { name: 'ふつう', row: 1, col: 1 }],
  }));
  const g = C.buildGrid(v);
  assert.equal(g.outside, 1);
  assert.equal(g.cells[0][0], 'ふつう');
});

test('★同じ席に2人いても、先の人を消さない（重なりを控える）', () => {
  const v = C.normalize(payload({
    seats: [{ name: '先の人', row: 1, col: 1 }, { name: 'あとの人', row: 1, col: 1 }],
  }));
  const g = C.buildGrid(v);
  assert.equal(g.cells[0][0], '先の人');
  assert.equal(g.overlaps.length, 1);
  assert.equal(g.overlaps[0], 'あとの人');
});

test('席が0件でも、空の教室がちゃんと描ける', () => {
  const v = C.normalize(payload({ seats: [] }));
  const g = C.buildGrid(v);
  assert.equal(g.cells.length, 4);
  assert.equal(g.outside, 0);
  assert.equal(g.overlaps.length, 0);
});

/* ── 4. ★★React の画面と切れているか（このページの存在理由）──────── */

test('★★Firebase を1文字も読み込んでいない（ログインの仕組みを持たない）', () => {
  assert.equal(/firebase/i.test(jsCode), false, '★Firebase が入っている');
  assert.equal(/firebase/i.test(htmlCode), false, '★Firebase が入っている');
});

test('★★React の画面・src/ のどのファイルも読み込んでいない', () => {
  assert.equal(jsCode.includes('import '), false, '★import を書いている');
  assert.equal(jsCode.includes('require('), false);
  assert.equal(htmlCode.includes('/src/'), false, '★src/ を読み込んでいる');
  assert.equal(htmlCode.includes('main.tsx'), false);
  assert.equal(htmlCode.includes('type="module"'), false);
});

test('★★#/seats/classroom（既存のルート）に触れていない＝別の道である', () => {
  assert.equal(jsCode.includes('seats/classroom'), false);
  assert.equal(htmlCode.includes('seats/classroom'), false);
});

test('★★出ていく道（<a> と <button>）が1つも無い', () => {
  assert.equal(/<a[\s>]/i.test(htmlCode), false, '★<a> がある');
  assert.equal(/<button/i.test(htmlCode), false, '★<button> がある');
  assert.equal(jsCode.includes("createElement('a')"), false);
  assert.equal(jsCode.includes("createElement('button')"), false);
});

test('★外のサーバーから何も読み込まない（書体も含めて端末の中だけ）', () => {
  // ★index.html は外から書体を読みますが、このページは読みません。
  //   置きっぱなしの端末が、外に出ていく先を1つでも減らすためです。
  assert.equal(htmlCode.includes('fonts.googleapis.com'), false);
  assert.equal(htmlCode.includes('fonts.gstatic.com'), false);
  assert.equal(/<script[^>]+src=["']https?:/i.test(htmlCode), false, '★外のスクリプトを読んでいる');
});

/* ── 5. ★漏らさない・壊さない ──────────────────────────────────── */

/**
 * ★★このページは public/ にあるので【注記ごとそのまま公開】されます。
 *   src/ の中はビルドで注記が落ちますが、public/ は1文字も削られません
 *   （2026-09-24 に dist/ を実測して確かめました）。
 *   ＝校内の管理番号・役職名・担当の呼び名・ローカルのファイル位置が、
 *     view-source で誰にでも読めてしまいます。
 *   ★この試験は、それが戻ってこないようにする杭です。
 */
const 内部語彙 = [
  '台帳', '社長', '決裁', '理事', '事務長',
  '裏側担当', 'web-gamen', 'web-uragawa', '秘書',
  'A4-', 'C1-', 'C2-', 'C3-', 'A3-',
  'C:' + String.fromCharCode(92), 'C:/', 's-kaw', 'yushi-documents',
];

test('★★公開されるページに、校内の管理番号・役職名・ローカルのファイル位置が無い', () => {
  for (const [name, src] of [['classroom.js', jsSrc], ['classroom.html', htmlSrc]]) {
    for (const word of 内部語彙) {
      assert.equal(src.includes(word), false,
        '★' + name + ' に「' + word + '」が入っています（view-source で読めます）');
    }
  }
});

test('★★合い言葉がソースに埋まっていない（公開リポジトリで読めるため）', () => {
  for (const src of [jsSrc, htmlSrc]) {
    let run = 0;
    let worst = 0;
    for (let i = 0; i < src.length; i++) {
      const c = src.charCodeAt(i);
      const isWord = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
      run = isWord ? run + 1 : 0;
      if (run > worst) worst = run;
    }
    assert.ok(worst < 32, '★32文字以上の英数字の塊がある（長さ ' + worst + '）');
  }
});

test('★★窓口の URL・シートのIDがソースに書かれていない', () => {
  for (const src of [jsSrc, htmlSrc]) {
    assert.equal(src.includes('/macros/s/AKfycb'), false, '★本物の窓口URLらしきものがある');
    assert.equal(src.includes('1tSAMNcd'), false, '★名簿のシートIDがある');
    assert.equal(src.includes('1EE7rY2n'), false, '★時間割のシートIDがある');
  }
});

test('★★氏名を innerHTML で描いていない（HTML として解釈される道を作らない）', () => {
  assert.equal(jsCode.includes('innerHTML'), false, '★innerHTML を使っている');
  assert.ok(jsCode.includes('textContent'), '★textContent で描いていない');
});

test('★合い言葉が「どこから来たか」として外に送られない', () => {
  assert.ok(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(htmlSrc),
    '★referrer の指定が無い');
});

test('★窓口を叩くときに Cookie を付けない', () => {
  assert.ok(jsSrc.includes("credentials: 'omit'"), '★credentials の指定が無い');
});

test('★取れなかった理由に、中の作りを出さない（決まり文句だけ）', () => {
  for (const reason of ['noHash', 'noUrl', 'badUrl', 'noToken', 'notFound',
                        'noAsof', 'badShape', 'unavailable', 'network', 'なにか']) {
    const f = C.failureText(reason);
    assert.ok(f.title && f.hint, reason);
    for (const leak of ['GAS', 'script.google', 'Apps Script', 'spreadsheet', 'token']) {
      assert.equal(f.title.includes(leak), false, reason);
      assert.equal(f.hint.includes(leak), false, reason);
    }
  }
});

/* ── 6. 間隔（決定事項の数字）────────────────────────────────────── */

test('★1分で伏せる（決定事項・当面そのまま残す）', () => {
  // ★2026-09-24 に「残す」と決まっています。
  //   延ばすときは public/classroom.js の MASK_IDLE_MS と、この数字の両方を直すこと。
  assert.equal(C.MASK_IDLE_MS, 60 * 1000);
});

test('うまく取れていれば10分ごと・失敗していれば1分ごとに取り直す', () => {
  assert.equal(C.RELOAD_MS, 10 * 60 * 1000);
  assert.equal(C.RETRY_MS, 60 * 1000);
  assert.ok(C.RETRY_MS < C.RELOAD_MS, '★失敗時の方が長い間隔になっている');
});

test('★窓口の名前がサーバー側と揃っている', () => {
  assert.equal(C.ACTION, 'classroomSeats');
});

/* ── 7. ★★教室名が2か所で食い違っていないか（来年度に効きます）──────
   教室名は【画面側（src/lib/seatChart.ts）】と【サーバー側（GAS の断片）】の
   2か所にあります。★片方だけ直すと、2つの画面が違う教室名を出します。
   ★エラーにはならず、黙って食い違ったまま動きます。

   ★GAS の断片はこのリポジトリの外にあります。
     無いときは【飛ばします】（他所で clone した人の試験を赤くしないため）。
     ★飛ばされたときは結果に「SKIP」と出ます。緑と読み違えないこと。
   ──────────────────────────────────────────────────────────────── */

const GAS_FRAGMENT = 'C:/Users/s-kaw/yushi-documents/gas_教室表示_20260924_v1.js';
const gasFragmentExists = fs.existsSync(GAS_FRAGMENT);

test('★★教室名が、画面側とサーバー側（GAS）で一致している',
  { skip: gasFragmentExists ? false : 'GAS の断片がこの機械にありません' },
  () => {
    const tsSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'seatChart.ts'), 'utf8');
    const ts = /export const SEAT_ROOM_NAME\s*=\s*'([^']*)'/.exec(tsSrc);
    assert.ok(ts, '★画面側の SEAT_ROOM_NAME が見つかりません');

    const gasSrc = fs.readFileSync(GAS_FRAGMENT, 'utf8');
    const gas = /var CLASSROOM_ROOM_NAME_\s*=\s*'([^']*)'/.exec(gasSrc);
    assert.ok(gas, '★サーバー側の CLASSROOM_ROOM_NAME_ が見つかりません');

    assert.equal(
      ts[1], gas[1],
      '★★教室名が食い違っています。\n' +
      '   画面側（src/lib/seatChart.ts の SEAT_ROOM_NAME）  = ' + ts[1] + '\n' +
      '   サーバー側（GAS の CLASSROOM_ROOM_NAME_）         = ' + gas[1] + '\n' +
      '   ★2つの画面が違う教室名を出します。両方を同じ字に直してください。',
    );
  });
