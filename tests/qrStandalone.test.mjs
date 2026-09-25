/* 登校・下校QRの独立ページの試験 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const JS_PATH = process.env.QR_PAGE_JS || path.join(ROOT, 'public', 'qr.js');
const jsSrc = fs.readFileSync(JS_PATH, 'utf8');
const HTML_PATH = process.env.QR_PAGE_HTML || path.join(ROOT, 'public', 'qr.html');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');

/** 画面の無い器で読み込み、試験用の窓口だけを取り出す */
function loadCore() {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox);
  assert.ok(sandbox.QrCore, '★QrCore が出ていない');
  return sandbox.QrCore;
}

test('窓口を叩くURLを組み立てられる', () => {
  const core = loadCore();
  assert.equal(
    core.requestUrl('https://script.google.com/macros/s/AAA/exec'),
    'https://script.google.com/macros/s/AAA/exec?action=api',
  );
});

test('返ってきた中身から、必要なものだけを取り出す', () => {
  const core = loadCore();
  const view = core.normalize({
    campus: '福岡',
    date: '2026-09-25',
    tokou_qr: 'data:image/png;base64,AAA',
    gekou_qr: 'data:image/png;base64,BBB',
    tokou_url: 'https://example.invalid/x',
    gekou_url: 'https://example.invalid/y',
    updated_at: '2026/9/25 8:30:24',
  });
  assert.equal(view.ok, true);
  assert.equal(view.date, '2026-09-25');
  assert.equal(view.tokou, 'data:image/png;base64,AAA');
  assert.equal(view.gekou, 'data:image/png;base64,BBB');
  assert.equal(view.updatedAt, '2026/9/25 8:30:24');
});

test('★出席URLは取り出さない（画面に出す道を作らない）', () => {
  const core = loadCore();
  const view = core.normalize({
    date: '2026-09-25',
    tokou_qr: 'data:image/png;base64,AAA',
    gekou_qr: 'data:image/png;base64,BBB',
    tokou_url: 'https://example.invalid/x',
    gekou_url: 'https://example.invalid/y',
    updated_at: '2026/9/25 8:30:24',
  });
  const text = JSON.stringify(view);
  assert.equal(text.includes('example.invalid'), false);
  assert.equal(text.includes('tokou_url'), false);
  assert.equal(text.includes('gekou_url'), false);
});

test('★画像でないものは受け取らない', () => {
  const core = loadCore();
  for (const bad of ['', null, undefined, 'https://evil.example/x.png', 'javascript:alert(1)']) {
    const view = core.normalize({
      date: '2026-09-25', tokou_qr: bad, gekou_qr: 'data:image/png;base64,BBB',
      updated_at: '2026/9/25 8:30:24',
    });
    assert.equal(view.ok, false, '受け取ってはいけない: ' + String(bad));
  }
});

/**
 * ★上と対になる試験。下校側だけを壊す。
 *   上の試験は tokou_qr しか壊さないので、下校側の検査が抜けても緑のままです
 *   （例: !isPng(json.tokou_qr) || !isPng(json.tokou_qr) と書き間違えた場合）。
 */
test('★画像でないものは受け取らない（下校側も同じように見ている）', () => {
  const core = loadCore();
  for (const bad of ['', null, undefined, 'https://evil.example/x.png', 'javascript:alert(1)']) {
    const view = core.normalize({
      date: '2026-09-25', tokou_qr: 'data:image/png;base64,AAA', gekou_qr: bad,
      updated_at: '2026/9/25 8:30:24',
    });
    assert.equal(view.ok, false, '受け取ってはいけない: ' + String(bad));
  }
});

test('★日付が無いものは受け取らない（いつのQRか分からないものを出さない）', () => {
  const core = loadCore();
  const view = core.normalize({
    tokou_qr: 'data:image/png;base64,AAA',
    gekou_qr: 'data:image/png;base64,BBB',
    updated_at: '2026/9/25 8:30:24',
  });
  assert.equal(view.ok, false);
});

/** 注記（コメント）を取り除いてから中身だけを見る */
function codeOnly(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
}

/**
 * ★★取り除く道具そのものを確かめる杭。
 *   codeOnly が取り除きすぎて空を返すと、「〜が無いこと」を見ている試験
 *   （React も Firebase も読み込まない／1分で伏せるを入れていない）は
 *   【中身が無いので全部素通り】します＝何も見ていないのに緑になります。
 */
test('★取り除く道具が効きすぎていない（中身が残っている）', () => {
  const html = codeOnly(htmlSrc);
  const js = codeOnly(jsSrc);
  for (const marker of ['id="tokouImg"', 'qr.js', '<style>', '.card.out']) {
    assert.ok(html.includes(marker), '★HTML が消えている: ' + marker);
  }
  for (const marker of ['QrCore', 'normalize', 'isPng']) {
    assert.ok(js.includes(marker), '★コードが消えている: ' + marker);
  }
  assert.ok(js.length > jsSrc.length * 0.2, '★取り除きすぎている');
  assert.ok(js.length < jsSrc.length, '★何も取り除けていない');
});

/**
 * CSS の「.card.in { … }」のかたまりの中身を取り出す。
 * ★`.card.in` は `.card.in .label` にも現れるので、
 *   選択子の直後が（空白をはさんで）「{」であるものだけを拾います。
 */
function cardBlock(body, kind) {
  const m = kind === 'in'
    ? body.match(/\.card\.in\s*\{([^}]*)\}/)
    : body.match(/\.card\.out\s*\{([^}]*)\}/);
  return m ? m[1].trim() : null;
}

test('★必要な入れ物がそろっている', () => {
  for (const id of ['campus', 'clock', 'tokouImg', 'gekouImg', 'asof', 'fail']) {
    assert.ok(htmlSrc.includes('id="' + id + '"'), '無い: ' + id);
  }
});

test('★React も Firebase も読み込まない', () => {
  const body = codeOnly(htmlSrc);
  assert.equal(/assets\/index-/.test(body), false);
  assert.equal(/firebase/i.test(body), false);
});

test('★外のサーバーを読み込まない（読むのは自分の qr.js だけ）', () => {
  const body = codeOnly(htmlSrc);
  const srcs = [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(srcs, ['qr.js']);
  // ★src の無い <script>（直書き）が1つも無いこと。
  //   src だけを見ていると、中に直接書かれた処理を見落とします。
  for (const tag of [...body.matchAll(/<script\b[^>]*>/g)].map(m => m[0])) {
    assert.ok(/\ssrc="/.test(tag), '★直書きの script がある: ' + tag);
  }
});

test('★出どころを外に渡さない', () => {
  assert.ok(htmlSrc.includes('name="referrer"') && htmlSrc.includes('no-referrer'));
});

test('★検索に載せない', () => {
  assert.ok(htmlSrc.includes('noindex'));
});

/**
 * ★★書いてはいけない語の一覧を、そのままここに並べないこと。
 *   ★この試験ファイルも、公開されるリポジトリに入ります。
 *     一覧を生で書くと「隠したい語の一覧」そのものを公開することになります
 *     （見張りの役目は正しいのに、見張り自身が漏らす形）。
 *   ★だから畳んで持ち、使うときだけ開きます。
 *   ★これは秘密を守る仕組みではありません（開き方はすぐ下に書いてあります）。
 *     検索や人の目に、そのままの形で引っかからないようにするためのものです。
 */
const FORBIDDEN_B64 =
  '5Y+w5bizCuekvumVtwrmsbroo4EK55CG5LqLCuS6i+WLmemVtwroo4/lgbQK56eY5pu4CkE0LQpDMS0KQTMtCkM6XApzLWthdw==';

function forbiddenWords() {
  return Buffer.from(FORBIDDEN_B64, 'base64').toString('utf8').split('\n');
}

/**
 * ★★畳んだものが、本当に開けているかの杭。
 *   開き方を間違えて空や文字化けになっても、下の検査は
 *   【1つも見つからない＝緑】になります＝壊れているのに合格します。
 */
test('★書いてはいけない語の一覧が、ちゃんと開けている', () => {
  const words = forbiddenWords();
  assert.equal(words.length, 12, '★一覧の数が合わない（開き方が違う）');
  for (const w of words) {
    assert.ok(w.length >= 2, '★中身が壊れている');
    assert.equal(w.includes('�'), false, '★文字化けしている');
  }
  // ★開いたもので本当に照合できるか（わざと含む文字列で試す）
  assert.ok(('xx' + words[0] + 'yy').includes(words[0]), '★照合できていない');
});

test('★校内の呼び名や管理番号を書かない（そのまま配信されるため）', () => {
  const words = forbiddenWords();
  for (const src of [htmlSrc, jsSrc]) {
    for (let i = 0; i < words.length; i++) {
      assert.equal(src.includes(words[i]), false,
        '★公開されるファイルに、書いてはいけない語が入っています（一覧の ' + (i + 1) + ' 番目）');
    }
  }
});

test('★★登校と下校を、色・矢印・言葉の3つで分けている', () => {
  const body = codeOnly(htmlSrc);
  // 矢印
  assert.ok(body.includes('▼ 登校'), '登校の矢印が無い');
  assert.ok(body.includes('▲ 下校'), '下校の矢印が無い');
  // 言葉（矢印だけだと、色が見えない人に伝わらない）
  assert.ok(body.includes('来たとき'), '登校の言い換えが無い');
  assert.ok(body.includes('帰るとき'), '下校の言い換えが無い');
  // 色（2つの枠に別の色が当たっていること）
  assert.ok(/\.card\.in\b/.test(body) && /\.card\.out\b/.test(body), '枠の区別が無い');
  assert.ok(/--in\s*:/.test(body) && /--out\s*:/.test(body), '色の指定が無い');
  assert.notEqual(
    (body.match(/--in\s*:\s*([^;]+);/) || [])[1],
    (body.match(/--out\s*:\s*([^;]+);/) || [])[1],
    '登校と下校が同じ色になっている',
  );

  /* ★★ここから：選択子と色が本当に結びついているかを見る。
       上の3つ（選択子が2つある／色が2つ宣言されている／その値が違う）は
       すべて真でも【2つの枠が別の色で出る】ことを導けません。
       下校の枠が var(--in) を使うよう書き換えても、上だけなら緑のままです。 */
  var inBlock = cardBlock(body, 'in');
  var outBlock = cardBlock(body, 'out');
  assert.ok(inBlock, '登校の枠の指定が見つからない');
  assert.ok(outBlock, '下校の枠の指定が見つからない');
  assert.ok(inBlock.includes('var(--in)'), '登校の枠が登校の色を使っていない');
  assert.equal(inBlock.includes('var(--out)'), false, '登校の枠が下校の色を使っている');
  assert.ok(outBlock.includes('var(--out)'), '下校の枠が下校の色を使っていない');
  assert.equal(outBlock.includes('var(--in)'), false, '下校の枠が登校の色を使っている');
  assert.notEqual(inBlock, outBlock, '2つの枠の指定が同じ');
});

test('★★「1分で伏せる」を入れていない（このページは出しっぱなし）', () => {
  const body = codeOnly(htmlSrc);
  const js = codeOnly(jsSrc);
  assert.equal(body.includes('id="mask"'), false, '伏せるための入れ物がある');
  assert.equal(/MASK_IDLE_MS/.test(js), false, '伏せる処理が入っている');
  assert.equal(/lastTouchAt/.test(js), false, '伏せる処理が入っている');
});

/* ──────────────────────────────────────────────────────────────────────
   ★起動の処理を実際に走らせる試験
   ★★作り物（モック）が本物と同じ動きをしているかに注意すること。
     座席表では、偽物が本物と違う動きをしていたため、試験が嘘をついた。
   ────────────────────────────────────────────────────────────────────── */

function makeEl() {
  return { textContent: '', src: '', style: { display: '' }, alt: '' };
}

/** 画面のある器を作って qr.js を走らせる */
function loadWithDom(opts) {
  const els = {
    campus: makeEl(), clock: makeEl(),
    tokouImg: makeEl(), gekouImg: makeEl(),
    asof: makeEl(), fail: makeEl(),
  };
  const calls = [];
  /**
   * ★★登録された見張りを【控える】作り物。
   *   ただ 0 を返すだけの作り物にすると、「登録されたかどうか」も
   *   「何を登録したか」も試験できません（登録の行を消しても緑のままになる）。
   *   控えておけば、あとから自分で呼んで確かめられます。
   */
  const timers = [];
  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById: (id) => els[id] || null,
      addEventListener: () => {},
    },
    window: { addEventListener: () => {} },
    setInterval: (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; },
    fetch: (url) => {
      calls.push(url);
      if (opts.fail) return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.json) });
    },
    Date: Date,
    encodeURIComponent: encodeURIComponent,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(jsSrc, sandbox);
  return { els, calls, timers, core: sandbox.QrCore };
}

const OK_JSON = {
  campus: '福岡', date: '2026-09-25',
  tokou_qr: 'data:image/png;base64,AAA',
  gekou_qr: 'data:image/png;base64,BBB',
  tokou_url: 'https://example.invalid/x',
  gekou_url: 'https://example.invalid/y',
  updated_at: '2026/9/25 8:30:24',
};

/** ★「今日」「前の日」は走らせる日で変わるので、その場で作る */
function ymdOf(d) {
  const p2 = (x) => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
const TODAY = ymdOf(new Date());
const YESTERDAY = ymdOf(new Date(Date.now() - 24 * 60 * 60 * 1000));

test('★起動すると、窓口を1回だけ叩く（杭：起動が本当に走っているか）', async () => {
  const { calls } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 1, '起動が走っていない可能性があります');
  assert.ok(calls[0].endsWith('?action=api'));
});

test('★取れたら、2つのQRを画面に入れる', async () => {
  const { els } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA');
  assert.equal(els.gekouImg.src, 'data:image/png;base64,BBB');
  assert.ok(els.asof.textContent.includes('8:30'));
});

test('★出席URLを画面のどこにも入れない', async () => {
  const { els } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  const all = Object.values(els).map((e) => e.textContent + '|' + e.src).join('|');
  assert.equal(all.includes('example.invalid'), false);
});

test('★★取れなかったとき、出ているQRを消さない', async () => {
  const { els, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA');
  await core._loadForTest({ fail: true });
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA', '消えてはいけない');
  assert.notEqual(els.fail.textContent, '', '取れていないことは伝える');
});

/**
 * ★★「出ない」ではなく【どの文字が出るか】まで見ます。
 *   「空でないこと」だけを見ていると、★別の文言に取り違えても緑のままです。
 *   実際、QRが1枚も無いのに「上のQRはそのまま使えます」と出す壊し方が、
 *   空でない検査を素通りしました（上にQRなど無いのに、です）。
 */
test('★何も取れていないときは、取れていないと言う', async () => {
  const { els, core } = loadWithDom({ fail: true });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.fail.textContent, core.MESSAGES.noneYet);
  assert.equal(els.fail.textContent.includes('そのまま使えます'), false,
    '★上にQRが無いのに「そのまま使えます」と言っている');
});

test('★今日のQRで取り直しに失敗したときの文言', async () => {
  const { els, core } = loadWithDom({ json: Object.assign({}, OK_JSON, { date: TODAY }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.fail.textContent, '');
  await core._loadForTest({ fail: true });
  assert.equal(els.fail.textContent, core.MESSAGES.retryFailed);
});

/* ── 見出しと、前の日のQR ──────────────────────────────────────────── */

test('★見出しの曜日は、窓口が返した日付から出す（端末の時計から出さない）', () => {
  const core = loadCore();
  assert.equal(core.headingText('福岡', '2026-09-25'), '福岡　9月25日（金）');
  // ★遠い過去の日付でも、その日の曜日が出ること（＝端末の今日を見ていない）
  assert.equal(core.headingText('', '2020-01-01'), '1月1日（水）');
  assert.equal(core.headingText('福岡', ''), '福岡');
  assert.equal(core.headingText('福岡', 'おかしな値'), '福岡');
});

test('★見出しに、校舎と「そのQRの日付・曜日」を出す', async () => {
  const { els } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.campus.textContent, '福岡　9月25日（金）');
});

test('★日付が変わったら、前の日のQRだと分かる', () => {
  const core = loadCore();
  const now = new Date(2026, 8, 25, 9, 0);
  assert.equal(core.isStale('2026-09-25', now), false);
  assert.equal(core.isStale('2026-09-24', now), true);
  assert.equal(core.isStale('', now), true);
});

test('★今日のQRなら、前の日だとは言わない', async () => {
  const { els } = loadWithDom({ json: Object.assign({}, OK_JSON, { date: TODAY }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(els.fail.textContent, '');
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA');
});

test('★★前の日のQRは、そうと分かる文言を出す（★QRそのものは消さない）', async () => {
  const { els } = loadWithDom({ json: Object.assign({}, OK_JSON, { date: YESTERDAY }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(els.fail.textContent.includes('前の日'), '前の日だと伝えていない');
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA', '★QRを消してはいけない');
});

/* ──────────────────────────────────────────────────────────────────────
   ★★文言は「状態の組」で決まる
   「前の日のQRだ」と「取り直しに失敗した」は【同時に真になりえます】。
   出す場所が1つしかないので、後から書いたほうが勝つ作りにすると
   ★前の日のQRに「そのまま使えます」と書いてしまいます＝嘘をつきます。
   ────────────────────────────────────────────────────────────────────── */

const BEFORE_MADE = new Date(2026, 8, 25, 7, 0);   // つくられる時刻より前
const AFTER_MADE = new Date(2026, 8, 25, 10, 0);   // つくられる時刻より後

test('★★文言は、状態の組から決まる（QRが出ているとき）', () => {
  const core = loadCore();
  // 今日 × 成功 → 何も出さない
  assert.equal(core.statusMessage(true, false, false, AFTER_MADE), '');
  // 今日 × 失敗
  assert.ok(core.statusMessage(true, false, true, AFTER_MADE).includes('そのまま使えます'));
  // 前の日 × 成功 × つくられる前 → まだ無いだけなので、騒がない
  const early = core.statusMessage(true, true, false, BEFORE_MADE);
  assert.ok(early.includes('まだつくられていません'), '早い時間の文言が違う');
  assert.equal(early.includes('職員に知らせて'), false, '★毎朝かならず鳴る警報にしない');
  // 前の日 × 成功 × つくられる時刻を過ぎている → おかしいので知らせる
  assert.ok(core.statusMessage(true, true, false, AFTER_MADE).includes('職員に知らせて'));
  // ★★前の日 × 失敗 → 時刻によらず「使えない」と言う
  for (const now of [BEFORE_MADE, AFTER_MADE]) {
    const both = core.statusMessage(true, true, true, now);
    assert.ok(both.includes('職員に知らせて'), '前の日だと伝えていない');
    assert.equal(both.includes('そのまま使えます'), false,
      '★前の日のQRを「そのまま使えます」と言っている');
  }
});

test('★★QRがまだ1枚も出ていないとき', () => {
  const core = loadCore();
  // まだ取れていないだけ（失敗もしていない）→ 何も出さない
  assert.equal(core.statusMessage(false, false, false, AFTER_MADE), '');
  // 取れなかった → 取れていないと言う
  assert.ok(core.statusMessage(false, false, true, AFTER_MADE).includes('取得できませんでした'));
  // ★QRが出ていないなら「前の日か」も時刻も関係しない（そこで早く返る）
  for (const stale of [false, true]) {
    for (const now of [BEFORE_MADE, AFTER_MADE]) {
      assert.ok(core.statusMessage(false, stale, true, now).includes('取得できませんでした'));
      assert.equal(core.statusMessage(false, stale, false, now), '');
    }
  }
});

test('★つくられる時刻のちょうど境目', () => {
  const core = loadCore();
  const just = new Date(2026, 8, 25, 8, 30);
  const one = new Date(2026, 8, 25, 8, 29);
  assert.ok(core.statusMessage(true, true, false, one).includes('まだつくられていません'));
  assert.ok(core.statusMessage(true, true, false, just).includes('職員に知らせて'));
});

test('★★前の日のQRのまま取り直しに失敗しても「そのまま使えます」と言わない', async () => {
  const { els, core } = loadWithDom({ json: Object.assign({}, OK_JSON, { date: YESTERDAY }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(els.fail.textContent.includes('前の日'), '前の日だと伝えていない');
  await core._loadForTest({ fail: true });
  assert.equal(els.fail.textContent.includes('そのまま使えます'), false,
    '★前の日のQRを「そのまま使えます」と言っている（嘘）');
  assert.ok(els.fail.textContent.includes('前の日'), '前の日だと伝え続けること');
  assert.equal(els.tokouImg.src, 'data:image/png;base64,AAA', '★QRを消してはいけない');
});

/* ──────────────────────────────────────────────────────────────────────
   ★時計まわり（tick）を実際に回す
   ★★本物の時計を待たない。作り物の時計を差し込んで回します。
   ────────────────────────────────────────────────────────────────────── */

test('★10分たったら取り直す', async () => {
  const { calls, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  // ★基準を作り物の時計にそろえる（本物の時計に左右されないため）
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 0));
  await core._loadForTest();
  const n = calls.length;
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 9, 0));
  core._tickForTest();
  assert.equal(calls.length, n, '9分では取り直さない');
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 10, 0));
  core._tickForTest();
  assert.equal(calls.length, n + 1, '10分たっても取り直していない');
});

test('★取れなかったら60秒後に再試行する', async () => {
  const { calls, core } = loadWithDom({ fail: true });
  await new Promise((r) => setTimeout(r, 10));
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 0));
  await core._loadForTest();
  const n = calls.length;
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 0, 30));
  core._tickForTest();
  assert.equal(calls.length, n, '30秒では再試行しない');
  core._setNowForTest(() => new Date(2026, 8, 25, 10, 1, 0));
  core._tickForTest();
  assert.equal(calls.length, n + 1, '60秒たっても再試行していない');
});

test('★★日付が変わったら取り直す', async () => {
  const { calls, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  core._setNowForTest(() => new Date(2026, 8, 25, 23, 59, 0));
  await core._loadForTest();
  const n = calls.length;
  core._setNowForTest(() => new Date(2026, 8, 25, 23, 59, 30));
  core._tickForTest();
  assert.equal(calls.length, n, '同じ日のうちは取り直さない');
  core._setNowForTest(() => new Date(2026, 8, 26, 0, 0, 0));
  core._tickForTest();
  assert.equal(calls.length, n + 1, '★日付が変わったのに取り直していない');
  // ★変わったあとに叩き続けないこと（前の日のQRが出ている間ずっと叩くと窓口に負担）
  core._tickForTest();
  assert.equal(calls.length, n + 1, '★日付が変わるたびに1回だけにすること');
});

test('★時計に時刻が入る', async () => {
  const { els, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  els.clock.textContent = '（まだ書かれていない目印）';
  core._setNowForTest(() => new Date(2026, 8, 25, 9, 5, 0));
  core._tickForTest();
  assert.equal(els.clock.textContent, '09:05');
});

/**
 * ★★起動した時点で、時計に中身が入っていること。
 *   見張りの初回は【登録の15秒後】に来ます。起動時に1回呼ばないと、
 *   ★教室の画面は最初の15秒、時計が空のままになります。
 *   ここは時間を1ミリ秒も進めずに見ます（進めると見張りの話になってしまう）。
 */
test('★★起動した時点で時計に中身が入っている（15秒待たない）', () => {
  const { els, calls } = loadWithDom({ json: OK_JSON });
  assert.match(els.clock.textContent, /^\d{2}:\d{2}$/,
    '★起動直後の時計が空。見張りの初回（15秒後）まで空のままになります');
  // ★起動時に見張りを1回呼んでも、窓口を二度叩かないこと
  assert.equal(calls.length, 1, '★起動で窓口を二度叩いている');
});

/* ──────────────────────────────────────────────────────────────────────
   ★★見張りの「登録そのもの」を見る
   上の試験は tick の中身を見ていますが、【登録の1行を消しても緑のまま】でした。
   ＝1段外側が空いています。作り物に控えさせて、そこを塞ぎます。
   ────────────────────────────────────────────────────────────────────── */

test('★★時計の見張りを、間隔をつけて登録している', async () => {
  const { timers, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(timers.length, 1, '★見張りが登録されていない');
  assert.equal(timers[0].ms, core.TICK_MS, '登録した間隔が違う');
  assert.equal(typeof timers[0].fn, 'function', '登録したものが関数でない');
});

test('★★登録された関数を自分で呼ぶと、見張りと同じことが起きる', async () => {
  const { els, timers, core } = loadWithDom({ json: OK_JSON });
  await new Promise((r) => setTimeout(r, 10));
  els.clock.textContent = '（まだ書かれていない目印）';
  core._setNowForTest(() => new Date(2026, 8, 25, 9, 5, 0));
  // ★控えておいた関数を、試験から呼ぶ
  timers[0].fn();
  assert.equal(els.clock.textContent, '09:05', '★登録されているのは見張りではない');
});

/* ── 見た目の指定が消えていないかの杭 ─────────────────────────────── */

/**
 * ★この杭は「書かれているか」しか見ていません。
 *   ★★その指定が本当に効いているか（画像が正方形に収まるか、
 *     狭い画面で横にはみ出さないか）は【見ていません】。
 *     効きめは実物を描いて目で確かめる必要があります。
 */
test('★見た目の指定が消えていない（杭。効きめは見ていない）', () => {
  const body = codeOnly(htmlSrc);
  assert.ok(/aspect-ratio\s*:\s*1\s*\/\s*1/.test(body), 'aspect-ratio が消えている');
  assert.ok(/min-width\s*:\s*0/.test(body), 'min-width:0 が消えている');
  assert.ok(/max-width\s*:\s*100%/.test(body), 'max-width:100% が消えている');
});
