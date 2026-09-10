// ============================================================================
// A4-41 dx_password が空のとき嘘の成功を返さない件 ローカル実測（2026-09-09）
// ============================================================================
// 何が問題だったか:
//   名簿の dx_password が空でも younetDX にログインを試み、
//   HTTP の応答が返ってくるので {ok:true} を返しうる。
//   ＝【何も登録されていないのに「反映しました」と生徒に見せる】。
//   生徒はそれを見て安心して帰る。出欠は付いていない。いちばん困る嘘。
//
// 測ること
//   1. ★パスワードが空の生徒 → younetDX への通信が0回で拒否される
//   2. ★空白だけ（'   '）でも同じく止まる（見た目で気づけないので特に大事）
//   3. パスワードがある生徒 → 今までどおり通る（正常系を壊さない）
//   4. 返す理由が読み分けられる（noPassword / notEnrolled / badDxUrl / dxLoginFailed）
//   5. audit に残る（★生徒のメール・氏名は note に書かない）
//   6. ★負の対照＝いま本番で動いている版では 1・2 が FAIL する
//      ＝空パスワードで {ok:true} が返っていたことを実際に見せる
//
// ★本番URLは叩かない。生徒の実データは一切使わない（すべて架空）。
// 使い方: node tmp_verify/test_a441_nopassword.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const FIXED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const CONTROL = 'tmp_verify/control_a441_nopwcheck_20260909.js';  // 本番稼働中の1,353行版

const DXURL = 'https://you-net-dx.jp/yushi/student/pages/attend.php?type=0&studio_id=3';

const HEADERS = ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'];
const ROSTER = [HEADERS,
  // パスワードあり（正常系）
  ['架空太郎', '1', '通常', '○', '', '', '', '', 's26100001@yushi-kokusai.jp', 'pw-TARO'],
  // ★パスワードが空（名簿に入れ忘れ）
  ['架空花子', '2', '通常', '', '○', '', '', '', 's26100002@yushi-kokusai.jp', ''],
  // ★空白だけ（見た目では空と区別がつかない）
  ['架空次郎', '3', '通常', '', '', '○', '', '', 's26100003@yushi-kokusai.jp', '   '],
];

const TOKENS = {
  'TOK-HAVE':  { code: 200, body: { users: [{ email: 's26100001@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-EMPTY': { code: 200, body: { users: [{ email: 's26100002@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-BLANK': { code: 200, body: { users: [{ email: 's26100003@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-NOTIN': { code: 200, body: { users: [{ email: 's26109999@yushi-kokusai.jp', emailVerified: true }] } },
};

function makeSheet(name, rows) {
  let data = rows.map(r => r.slice());
  const touch = { read: 0, write: 0 };
  function ensure(r, c) {
    while (data.length < r) data.push([]);
    const row = data[r - 1];
    while (row.length < c) row.push('');
  }
  return {
    _rows: () => data,
    _touch: touch,
    getName: () => name,
    getDataRange: () => { touch.read++; return { getValues: () => data.map(r => r.slice()) }; },
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((n, r) => Math.max(n, r.length), 0),
    clear: () => { touch.write++; data = []; },
    appendRow: (r) => { touch.write++; data.push(r.slice()); },
    deleteRow: (i) => { touch.write++; data.splice(i - 1, 1); },
    deleteRows: (i, n) => { touch.write++; data.splice(i - 1, n); },
    setFrozenRows: () => {},
    getRange: (row, col, numRows, numCols) => ({
      setValue: (v) => { touch.write++; ensure(row, col); data[row - 1][col - 1] = v; },
      getValues: () => {
        const out = [];
        for (let r = row; r < row + (numRows || 1); r++) {
          const src = data[r - 1] || [];
          const line = [];
          for (let c = col; c < col + (numCols || 1); c++) line.push(src[c - 1] === undefined ? '' : src[c - 1]);
          out.push(line);
        }
        return out;
      },
      setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
    }),
  };
}

/**
 * opts.loginRequired: true にすると、偽の younetDX が
 *   「ログインできていないと出席ページを見せない（student_id を出さない）」
 *   という、ありそうな振る舞いをする。
 */
function loadGas(file, opts) {
  opts = opts || {};
  const sheets = {
    records: makeSheet('records', [['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp']]),
    timetable: makeSheet('timetable', [['data']]),
    students: makeSheet('students', ROSTER),
    attendance: makeSheet('attendance', [['date', 'name', 'grade', 'checkinTime', 'checkoutTime']]),
    period2: makeSheet('period2', [['week', 'name', '月', '火', '水', '木', '金']]),
  };
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => { sheets[n] = makeSheet(n, []); return sheets[n]; },
    }),
    flush: () => {},
  };
  global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => t }) };
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (k) => (k === 'FIREBASE_API_KEY' ? 'FAKE-API-KEY' : null) }),
  };
  const cache = {};
  global.CacheService = {
    getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }),
  };
  global.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_a, s) => require('crypto').createHash('sha256').update(String(s)).digest(),
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  };
  global.Logger = { log: () => {} };

  const calls = [];
  let loggedIn = false;
  global.UrlFetchApp = {
    fetch: (url, params) => {
      params = params || {};
      const u = String(url);
      if (u.indexOf('identitytoolkit.googleapis.com') !== -1) {
        const tok = JSON.parse(params.payload).idToken;
        const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
        return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
      }
      calls.push({ url: u, method: params.method || 'get', payload: params.payload || null });

      // 偽の younetDX：login.php に空でないパスワードが来たらログイン成功とみなす
      if (u.indexOf('login.php') !== -1) {
        const pw = params.payload ? String(params.payload.password || '') : '';
        loggedIn = opts.rejectLogin ? false : pw.trim().length > 0;
      }
      const showAttend = opts.loginRequired ? loggedIn : true;
      return {
        getResponseCode: () => 200,
        getContentText: () => (showAttend
          ? '<input name="student_id" value="777" />'
          : '<form action="login.php">ログインしてください</form>'),
        getAllHeaders: () => ({ 'Set-Cookie': 'PHPSESSID=x; path=/' }),
      };
    },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost });');
  return { doPost: api.doPost, sheets, calls };
}

function post(api, body) { return api.doPost({ postData: { contents: JSON.stringify(body) } }); }

let failures = 0;
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function check(label, cond, detail) {
  if (!cond) failures++;
  say(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
  return cond;
}

// ---------------------------------------------------------------------------
function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  // === 試験1: ★パスワードが空 ===
  say('\n--- 1. ★名簿の dx_password が空の生徒が「登校」を押す ---');
  {
    const api = loadGas(file);
    const sent = { action: 'dxCheckIn', idToken: 'TOK-EMPTY', dxUrl: DXURL };
    const got = String(post(api, sent));
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  younetDX への通信: ' + api.calls.length + '回');
    check('★嘘の ok:true を返さない', got.indexOf('"ok":true') === -1, got.slice(0, 80));
    check('★reason:noPassword が返る', got.indexOf('"reason":"noPassword"') !== -1, got.slice(0, 80));
    check('★younetDX に1回も通信していない', api.calls.length === 0, api.calls.length + '回');
  }

  // === 試験2: ★空白だけ ===
  say('\n--- 2. ★dx_password が空白だけ（\'   \'）の生徒 ---');
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-BLANK', dxUrl: DXURL }));
    say('  返ったもの: ' + got);
    say('  younetDX への通信: ' + api.calls.length + '回');
    check('★嘘の ok:true を返さない', got.indexOf('"ok":true') === -1, got.slice(0, 80));
    check('★reason:noPassword が返る', got.indexOf('"reason":"noPassword"') !== -1, got.slice(0, 80));
    check('★younetDX に1回も通信していない', api.calls.length === 0, api.calls.length + '回');
  }

  // === 試験3: パスワードがある生徒は今までどおり ===
  say('\n--- 3. パスワードがある生徒は今までどおり通る（正常系）---');
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-HAVE', dxUrl: DXURL }));
    const loginCall = api.calls.filter(c => c.url.indexOf('login.php') !== -1)[0];
    say('  返ったもの: ' + got);
    say('  younetDX へのログイン: ' + (loginCall ? JSON.stringify(loginCall.payload) : '(なし)'));
    check('★登校できる', got.indexOf('"ok":true') !== -1, got.slice(0, 80));
    check('自分のパスワードでログインしている',
      !!loginCall && loginCall.payload.password === 'pw-TARO',
      loginCall ? loginCall.payload.password : '(なし)');
  }

  // === 試験4: 理由が読み分けられる ===
  say('\n--- 4. 拒否の理由が読み分けられること（画面が文言を出し分けられる）---');
  {
    const cases = [
      ['TOK-EMPTY', DXURL,                       'noPassword',  'パスワードが空'],
      ['TOK-NOTIN', DXURL,                       'notEnrolled', '名簿に居ない'],
      ['TOK-HAVE',  'https://evil.example/',     'badDxUrl',    'QRの行き先が変'],
      ['TOK-HAVE',  '',                          'noDxUrl',     'QRが読めていない'],
    ];
    for (const [tok, url, want, why] of cases) {
      const api = loadGas(file);
      const got = String(post(api, { action: 'dxCheckIn', idToken: tok, dxUrl: url }));
      const ok = got.indexOf('"reason":"' + want + '"') !== -1;
      if (!ok) failures++;
      say(`  ${ok ? 'PASS' : '**FAIL**'}  ${why.padEnd(20)} → ${want.padEnd(12)} 返り: ${got.slice(0, 60)}`);
    }
  }

  // === 試験5: ★パスワードは入っているが違っていた場合 ===
  say('\n--- 5. ★パスワードは入っているが違っていて、ログインできない場合 ---');
  {
    // 偽の younetDX が「ログインしていないと出席ページを見せない」振る舞いをし、
    // かつログインを失敗させる（＝名簿のパスワードが古い・打ち間違い）。
    const api = loadGas(file, { loginRequired: true, rejectLogin: true });
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-HAVE', dxUrl: DXURL }));
    say('  返ったもの: ' + got);
    check('★嘘の ok:true を返さない', got.indexOf('"ok":true') === -1, got.slice(0, 80));
    check('★reason:dxLoginFailed で読み分けられる',
      got.indexOf('"reason":"dxLoginFailed"') !== -1, got.slice(0, 80));
  }
  say('\n--- 5b. ログインできていれば今までどおり通る（正常系）---');
  {
    const api = loadGas(file, { loginRequired: true });
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-HAVE', dxUrl: DXURL }));
    say('  返ったもの: ' + got);
    check('★出席ページが見えていれば通る', got.indexOf('"ok":true') !== -1, got.slice(0, 70));
  }

  // === 試験6: audit の記録 ===
  say('\n--- 6. 操作の記録（audit）---');
  {
    const api = loadGas(file);
    post(api, { action: 'dxCheckIn', idToken: 'TOK-EMPTY', dxUrl: DXURL });
    const rows = api.sheets['audit'] ? api.sheets['audit']._rows().slice(1) : [];
    say('  audit の中身: ' + (rows.length ? rows.map(r => r.join('|')).join(' / ') : '(なし)'));
    check('拒否が記録される', rows.length >= 1, rows.length + '行');
    const notes = rows.map(r => String(r[4] || '')).join(' ');
    check('★理由が分かる（noPassword）', notes.indexOf('noPassword') !== -1, notes);
    check('★note にメールアドレスが入っていない', notes.indexOf('@') === -1, notes);
    check('★note に生徒の氏名が入っていない', notes.indexOf('架空') === -1, notes);
    check('★note に平文パスワードが入っていない', notes.indexOf('pw-') === -1, notes);
  }
}

say('============================================================');
say(' A4-41 空パスワードで嘘の成功を返さない 実測  ' + new Date().toISOString());
say('============================================================');

failures = 0;
runSuite(FIXED, '本命：送る前に止める版');
const fixedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：いま本番で動いている版（1,353行）で同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(CONTROL, '負の対照：空パスワードでも送ってしまう版');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（止める版）      : FAIL ${fixedFailures} 件  → 0 でなければならない`);
say(` 負の対照（止めない版）: FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = fixedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_nopassword_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
