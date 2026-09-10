// ============================================================================
// A4-41 dxCheckIn のなりすまし塞ぎ ローカル実測（2026-09-09）
// ============================================================================
// 社長決裁: 「職員が生徒の代理でQRを叩く運用は無い」
//   → 誰の登校かは body.email ではなく authEmail（番人が確かめた本人）で決める。
//
// 測ること
//   1. ★ログイン済みの生徒Aが、本文に生徒Bのメールを書いても
//      【Bの登校が younetDX に登録されない】＝Aの資格情報しか使われない
//   2. 名簿に居ない人（職員）は notEnrolled。younetDX に1回も触らない
//   3. 本文にメールを書かなくても、本人なら普通に登校できる
//   4. ★負の対照＝今日の修正前のファイル（git HEAD）では 1 が FAIL すること
//      （＝この試験が空回りしていないことの担保）
//
// ★本番URLは叩かない。younetDX にも出ない。全部この中の偽物に向かう。
// ★生徒の実データは一切使わない。すべて架空の値。
// 使い方: node tmp_verify/test_a441_dxcheckin.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const FIXED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const CONTROL = 'tmp_verify/control_a441_before_20260909.js';  // 今日の修正前（git HEAD）

// 名簿（架空）。★生徒Aと生徒Bを用意して、AがBになりすませるかを見る
const HEADERS = ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'];
const ROSTER = [HEADERS,
  // 生徒B（なりすまされる側）
  ['架空太郎', '1', '通常', '○', '', '', '', '', 's26100001@yushi-kokusai.jp', 'pw-BBBBB'],
  // 生徒A（なりすます側）。★わざと前後空白・大文字混じり
  ['架空四郎', '3', '通常', '', '', '', '○', '', '  S26100004@Yushi-Kokusai.JP  ', 'pw-AAAAA'],
];

const TOKENS = {
  'TOKEN-A':     { code: 200, body: { users: [{ email: 's26100004@yushi-kokusai.jp', emailVerified: true }] } }, // 生徒A
  'TOKEN-B':     { code: 200, body: { users: [{ email: 's26100001@yushi-kokusai.jp', emailVerified: true }] } }, // 生徒B
  'TOKEN-STAFF': { code: 200, body: { users: [{ email: 's-hisho09@yushi-kokusai.jp', emailVerified: true }] } },  // 名簿に居ない職員
};

function makeSheet(name, rows) {
  let data = rows.map(r => r.slice());
  const touch = { read: 0, write: 0 };
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
    getRange: () => ({ setValue: () => { touch.write++; }, getValues: () => data.map(r => r.slice()) }),
    setFrozenRows: () => {},
  };
}

function loadGas(file) {
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

  // ★偽の younetDX。ここに来た「ログインID・パスワード」を全部記録する。
  //   これが本試験の目盛り＝誰の資格情報で入ろうとしたかが分かる。
  const dxCalls = [];
  global.UrlFetchApp = {
    fetch: (url, params) => {
      params = params || {};
      if (String(url).indexOf('identitytoolkit.googleapis.com') !== -1) {
        const tok = JSON.parse(params.payload).idToken;
        const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
        return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
      }
      dxCalls.push({ url: String(url), payload: params.payload || null });
      return {
        getResponseCode: () => 200,
        getContentText: () => '<input name="student_id" value="777" />',
        getAllHeaders: () => ({ 'Set-Cookie': 'PHPSESSID=x; path=/' }),
      };
    },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけで、外部入力は一切通していない
  // （既存 tmp_verify/test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost });');
  return { doPost: api.doPost, sheets, dxCalls };
}

function post(api, body) {
  return api.doPost({ postData: { contents: JSON.stringify(body) } });
}
// younetDX に送られたログインIDとパスワードを取り出す
function loginAttempt(dxCalls) {
  const hit = dxCalls.filter(c => c.url.indexOf('login.php') !== -1)[0];
  if (!hit || !hit.payload) return null;
  return { login_id: hit.payload.login_id, password: hit.payload.password };
}

let failures = 0;
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function check(label, cond, detail) {
  if (!cond) failures++;
  say(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
  return cond;
}

const DXURL = 'https://you-net-dx.jp/yushi/student/pages/attend.php?type=0&studio_id=3';

// ---------------------------------------------------------------------------
// 同じ試験を、直した版と 修正前の版 の両方に流す
// ---------------------------------------------------------------------------
function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  // === 試験1: ★なりすまし。生徒Aのトークンで、本文に生徒Bのメールを書く ===
  say('\n--- ★なりすまし: 生徒A が本文に 生徒B のメールを書いて登校を叩く ---');
  {
    const api = loadGas(file);
    const sent = {
      action: 'dxCheckIn',
      idToken: 'TOKEN-A',                        // ログインしているのは 生徒A
      email: 's26100001@yushi-kokusai.jp',       // ★本文では 生徒B を名乗る
      dxUrl: DXURL,
    };
    const got = String(post(api, sent));
    const used = loginAttempt(api.dxCalls);
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  younetDX に送られた資格情報: ' + (used ? JSON.stringify(used) : '(1回も送っていない)'));

    check('★生徒B のパスワードが使われていない',
      !used || used.password !== 'pw-BBBBB', used ? used.password : '(なし)');
    check('★生徒B のログインIDが使われていない',
      !used || String(used.login_id).trim().toLowerCase() !== 's26100001@yushi-kokusai.jp',
      used ? String(used.login_id) : '(なし)');
    check('使われたのは 生徒A 自身の資格情報',
      !!used && used.password === 'pw-AAAAA'
        && String(used.login_id).trim().toLowerCase() === 's26100004@yushi-kokusai.jp',
      used ? JSON.stringify(used) : '(なし)');
  }

  // === 試験2: 逆向きも見る（生徒B が 生徒A を名乗る）===
  say('\n--- ★なりすまし（逆向き）: 生徒B が 生徒A のメールを書く ---');
  {
    const api = loadGas(file);
    const sent = {
      action: 'dxCheckIn', idToken: 'TOKEN-B',
      email: '  S26100004@Yushi-Kokusai.JP  ',   // 名簿の生の値をそのまま名乗ってみる
      dxUrl: DXURL,
    };
    const got = String(post(api, sent));
    const used = loginAttempt(api.dxCalls);
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  younetDX に送られた資格情報: ' + (used ? JSON.stringify(used) : '(1回も送っていない)'));
    check('★生徒A の資格情報が使われていない', !used || used.password !== 'pw-AAAAA',
      used ? used.password : '(なし)');
    check('使われたのは 生徒B 自身の資格情報', !!used && used.password === 'pw-BBBBB',
      used ? JSON.stringify(used) : '(なし)');
  }

  // === 試験3: 本文にメールを書かなくても、本人なら普通に登校できる ===
  say('\n--- 本人が普通に登校する（本文にメールを書かない）---');
  {
    const api = loadGas(file);
    const sent = { action: 'dxCheckIn', idToken: 'TOKEN-A', dxUrl: DXURL };
    const got = String(post(api, sent));
    const used = loginAttempt(api.dxCalls);
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  younetDX に送られた資格情報: ' + (used ? JSON.stringify(used) : '(1回も送っていない)'));
    check('★本文にメールが無くても本人として登校できる', got.indexOf('"ok":true') !== -1, got.slice(0, 80));
    check('自分の資格情報で younetDX にログインしている',
      !!used && used.password === 'pw-AAAAA', used ? JSON.stringify(used) : '(なし)');
    check('★シートの平文パスワードを読む経路は生きている（消すとQRが死ぬ）', !!used);
  }

  // === 試験4: 名簿に居ない人（職員）===
  say('\n--- 名簿に居ない人（職員）が登校を叩く ---');
  {
    const api = loadGas(file);
    const sent = {
      action: 'dxCheckIn', idToken: 'TOKEN-STAFF',
      email: 's26100001@yushi-kokusai.jp',       // 本文では生徒Bを名乗る
      dxUrl: DXURL,
    };
    const got = String(post(api, sent));
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  younetDX への通信: ' + api.dxCalls.length + '回');
    check('reason:notEnrolled が返る（getMe と同じ）',
      got.indexOf('"reason":"notEnrolled"') !== -1, got.slice(0, 90));
    check('★younetDX に1回も触っていない', api.dxCalls.length === 0, api.dxCalls.length + '回');
  }

  // === 試験5: 番人（無認証・デタラメ）===
  say('\n--- 番人（トークンなし／デタラメ）---');
  for (const [nm, tk] of [['トークンなし', undefined], ['デタラメなトークン', 'DEADBEEF']]) {
    const api = loadGas(file);
    const b = { action: 'dxCheckIn', email: 's26100001@yushi-kokusai.jp', dxUrl: DXURL };
    if (tk) b.idToken = tk;
    const got = String(post(api, b));
    check(`${nm} → 拒否`, got.indexOf('"error":"unauthorized"') !== -1, got.slice(0, 70));
    check(`${nm} → younetDX に1回も触らない`, api.dxCalls.length === 0);
  }

  // === 試験6: audit の記録（★生徒のメール・氏名を note に書かない）===
  say('\n--- 操作の記録（audit）---');
  {
    const api = loadGas(file);
    post(api, { action: 'dxCheckIn', idToken: 'TOKEN-A', dxUrl: DXURL });
    post(api, { action: 'dxCheckIn', idToken: 'TOKEN-STAFF', dxUrl: DXURL });
    const rows = api.sheets['audit'] ? api.sheets['audit']._rows().slice(1) : [];
    say('  audit の中身: ' + (rows.length ? rows.map(r => r.join('|')).join('  /  ') : '(なし)'));
    check('成功・失敗の両方が記録される', rows.length === 2, rows.length + '行');
    const notes = rows.map(r => String(r[4] || '')).join(' ');
    check('★note にメールアドレスが入っていない', notes.indexOf('@') === -1, notes);
    check('★note に生徒の氏名が入っていない', notes.indexOf('架空') === -1, notes);
    check('★note に平文パスワードが入っていない', notes.indexOf('pw-') === -1, notes);
  }
}

say('============================================================');
say(' A4-41 dxCheckIn なりすまし塞ぎの実測  ' + new Date().toISOString());
say('============================================================');

failures = 0;
runSuite(FIXED, '本命：塞いだ版');
const fixedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：今日の修正前（git HEAD）で同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(CONTROL, '負の対照：修正前（body.email を信じていた版）');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（塞いだ版）      : FAIL ${fixedFailures} 件  → 0 でなければならない`);
say(` 負の対照（修正前）    : FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = fixedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_dxcheckin_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
