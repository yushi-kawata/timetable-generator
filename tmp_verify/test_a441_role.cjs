// ============================================================================
// A4-41 職員か生徒かの判定 ローカル実測（2026-09-09）
// ============================================================================
// 社長決裁の規則（@ より前の形で判定）:
//   ・アルファベット1文字＋数字8桁          → 生徒   例) s26100012
//   ・ハイフンを含む（前は1文字とは限らない）→ 職員   例) s-kawata / sa-sakai / s-ohno
//   ・どちらにも当てはまらない               → 拒否（★職員扱いにしない）
//
// ★★最大の落とし穴: 生徒も職員も「s」で始まる。
//   「s で始まったら生徒」と書くと職員が全員生徒扱いになる。
//
// 測ること
//   1. 判定関数そのものの表駆動試験（想定外・@2つ・別ドメイン・大文字・空白を含む）
//   2. ★生徒のトークンで getStudents を叩くと拒否される／職員なら通る（実際に叩く）
//   3. ★生徒のトークンで saveStudents を叩いても名簿が1行も変わらない
//   4. 生徒が使うアクション（getMe / checkIn / dxCheckIn ほか）は通る
//   5. getAttendance / getPeriod2 は生徒には本人の行だけ
//   6. 「ログインし直せ」と「権限が無い」が区別できる
//   7. ★負の対照＝判定を入れる前のファイルでは 2・3・5 が FAIL すること
//
// ★本番URLは叩かない。生徒の実データは一切使わない（すべて架空）。
// 使い方: node tmp_verify/test_a441_role.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const FIXED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const CONTROL = 'tmp_verify/control_a441_norole_20260909.js';  // 判定を入れる直前の版

const HEADERS = ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'];
const ROSTER = [HEADERS,
  ['架空太郎', '1', '通常', '○', '', '', '', '', 's26100001@yushi-kokusai.jp', 'pw-TARO'],
  ['架空四郎', '3', '通常', '', '', '', '○', '', 's26100004@yushi-kokusai.jp', 'pw-SHIRO'],
];
const ATTENDANCE = [
  ['date', 'name', 'grade', 'checkinTime', 'checkoutTime'],
  ['2026-09-09', '架空太郎', '1', '09:00', ''],
  ['2026-09-09', '架空四郎', '3', '09:05', ''],
];
const PERIOD2 = [
  ['week', 'name', '月', '火', '水', '木', '金'],
  ['W37', '架空太郎', '{}', '{}', '{}', '{}', '{}'],
  ['W37', '架空四郎', '{}', '{}', '{}', '{}', '{}'],
];

const TOKENS = {
  'TOK-STUDENT': { code: 200, body: { users: [{ email: 's26100004@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-STAFF':   { code: 200, body: { users: [{ email: 's-hisho09@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-STAFF2':  { code: 200, body: { users: [{ email: 'sa-sakai@yushi-kokusai.jp', emailVerified: true }] } },
  // ★どちらとも判定できない形（ハイフン無し・数字8桁でもない）
  'TOK-WEIRD':   { code: 200, body: { users: [{ email: 'kawata@yushi-kokusai.jp', emailVerified: true }] } },
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
    records: makeSheet('records', [['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp'],
                                   [1, 'W37', '架空太郎', '1', '[]', '{}', 't']]),
    timetable: makeSheet('timetable', [['data'], [JSON.stringify({ 月: {} })]]),
    students: makeSheet('students', ROSTER),
    attendance: makeSheet('attendance', ATTENDANCE),
    period2: makeSheet('period2', PERIOD2),
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
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost, ' +
    'classifyRole_: (typeof classifyRole_ === "function" ? classifyRole_ : null) });');
  return { doGet: api.doGet, doPost: api.doPost, classifyRole_: api.classifyRole_, sheets, dxCalls };
}

function post(api, body) {
  return api.doPost({ postData: { contents: JSON.stringify(body) } });
}

let failures = 0;
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function check(label, cond, detail) {
  if (!cond) failures++;
  say(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
  return cond;
}

// ---------------------------------------------------------------------------
// 試験1: 判定関数そのもの（表駆動）
// ---------------------------------------------------------------------------
const ROLE_TABLE = [
  // [入力, 期待, 説明]
  ['s26100012@yushi-kokusai.jp',            'student', '1文字＋数字8桁'],
  ['a00000001@yushi-kokusai.jp',            'student', '別の頭文字'],
  ['z99999999@yushi-kokusai.jp',            'student', '数字9つ並びの端'],
  ['s-hisho09@yushi-kokusai.jp',             'staff',   '★s で始まるが職員'],
  ['sa-sakai@yushi-kokusai.jp',             'staff',   'ハイフン前が2文字'],
  ['s-hisho10@yushi-kokusai.jp',               'staff',   'ハイフン後が短い'],
  ['s-kawata-jr@yushi-kokusai.jp',          'staff',   'ハイフン2つ'],
  ['S-Kawata@Yushi-Kokusai.JP',             'staff',   '大文字混じり'],
  ['  S26100012@Yushi-Kokusai.JP  ',        'student', '前後の空白＋大文字'],
  ['s2610001@yushi-kokusai.jp',             null,      '数字7桁＝想定外'],
  ['s261000123@yushi-kokusai.jp',           null,      '数字9桁＝想定外'],
  ['26100012@yushi-kokusai.jp',             null,      '先頭が数字'],
  ['ss26100012@yushi-kokusai.jp',           null,      '英字2文字＋数字8桁'],
  ['kawata@yushi-kokusai.jp',               null,      '★ハイフン無し＝職員に倒さない'],
  ['-kawata@yushi-kokusai.jp',              null,      'ハイフンが先頭'],
  ['kawata-@yushi-kokusai.jp',              null,      'ハイフンが末尾'],
  ['s-kawata@gmail.com',                    null,      '別ドメイン'],
  ['s26100012@yushi-kokusai.jp.example.com', null,     '似せたドメイン'],
  ['s-hisho09@yushi-kokusai.jp.evil@x.com',  null,      '★@ が2つ'],
  ['s-hisho09@yushi-kokusai.jp@evil.com',    null,      '★@ が2つ（別の形）'],
  ['@yushi-kokusai.jp',                     null,      '@ の前が空'],
  ['s26100012',                             null,      '@ が無い'],
  ['',                                      null,      '空文字'],
];

function runRoleTable(api, label) {
  say(`\n--- 判定関数そのもの（${ROLE_TABLE.length}通り）${label} ---`);
  if (!api.classifyRole_) {
    check('判定関数 classifyRole_ がある', false, '★この版には入っていません');
    return;
  }
  let ng = 0;
  for (const [input, want, note] of ROLE_TABLE) {
    const got = api.classifyRole_(input);
    const ok = got === want;
    if (!ok) ng++;
    say(`  ${ok ? 'PASS' : '**FAIL**'}  ${String(input || '(空)').padEnd(42)} → ${String(got)}`
        + `${ok ? '' : ' ★' + String(want) + ' のはず'}   ${note}`);
  }
  check(`判定 ${ROLE_TABLE.length}通り すべて期待どおり`, ng === 0, ng ? `${ng}件ちがう` : '');
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  runRoleTable(loadGas(file), '');

  // === 試験2: ★生徒のトークンで getStudents を叩く ===
  say('\n--- ★生徒のトークンで getStudents（全生徒の名簿）を叩く ---');
  {
    const api = loadGas(file);
    const sent = { action: 'getStudents', idToken: 'TOK-STUDENT' };
    const got = String(post(api, sent));
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    check('★拒否される', got.indexOf('"error":"forbidden"') !== -1, got.slice(0, 90));
    check('★reason は staffOnly', got.indexOf('"reason":"staffOnly"') !== -1);
    check('★他人の氏名が1件も返らない', got.indexOf('架空太郎') === -1, got.slice(0, 90));
    check('★dx_email が1件も返らない', got.indexOf('@yushi-kokusai.jp') === -1);
  }

  say('\n--- 職員のトークンなら getStudents は通る ---');
  for (const tk of ['TOK-STAFF', 'TOK-STAFF2']) {
    const api = loadGas(file);
    const got = String(post(api, { action: 'getStudents', idToken: tk }));
    let arr = null; try { arr = JSON.parse(got); } catch (e) {}
    check(`${tk} → 通る（2件返る）`, Array.isArray(arr) && arr.length === 2,
      Array.isArray(arr) ? arr.length + '件' : got.slice(0, 80));
    check(`${tk} → 平文パスワードは返らない`, got.indexOf('pw-') === -1);
  }

  // === 試験3: ★生徒が名簿を消せないこと ===
  say('\n--- ★生徒のトークンで saveStudents（名簿の作り直し）を叩く ---');
  {
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets.students._rows());
    const sent = { action: 'saveStudents', idToken: 'TOK-STUDENT', data: [], confirmEmpty: true };
    const got = String(post(api, sent));
    const after = JSON.stringify(api.sheets.students._rows());
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    check('★拒否される（staffOnly）', got.indexOf('"reason":"staffOnly"') !== -1, got.slice(0, 90));
    check('★名簿が1行も変わっていない', before === after,
      before === after ? '' : '行数 ' + api.sheets.students._rows().length);
  }

  // === 試験4: 職員だけの残り（getRecs / saveRec / deleteRec / clearRecs / saveTT）===
  say('\n--- 職員だけの残りを生徒が叩く ---');
  for (const act of ['getRecs', 'saveRec', 'deleteRec', 'clearRecs', 'saveTT']) {
    const api = loadGas(file);
    const b = { action: act, idToken: 'TOK-STUDENT' };
    if (act === 'saveRec') b.data = { id: 9, week: 'W37', name: 'x', grade: '1', days: {}, sel: {}, timestamp: 't' };
    if (act === 'deleteRec') b.id = 1;
    if (act === 'saveTT') b.data = { dummy: true };
    const recsBefore = JSON.stringify(api.sheets.records._rows());
    const got = String(post(api, b));
    const denied = got.indexOf('"reason":"staffOnly"') !== -1;
    const intact = JSON.stringify(api.sheets.records._rows()) === recsBefore;
    check(`${act.padEnd(12)} → 生徒は拒否・データ無傷`, denied && intact, got.slice(0, 60));
  }

  // === 試験5: 生徒が使うアクションは通る ===
  say('\n--- 生徒が使うアクションは通ること（登校できなくなっては困る）---');
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'getMe', idToken: 'TOK-STUDENT' }));
    check('getMe → 通る（本人1件）', got.indexOf('"ok":true') !== -1 && got.indexOf('架空四郎') !== -1,
      got.slice(0, 90));
    check('★他人（架空太郎）は返らない', got.indexOf('架空太郎') === -1);
  }
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'getTT', idToken: 'TOK-STUDENT' }));
    check('getTT → 通る', got.indexOf('forbidden') === -1 && got.indexOf('unauthorized') === -1, got.slice(0, 60));
  }
  {
    const api = loadGas(file);
    const got = String(post(api, {
      action: 'dxCheckIn', idToken: 'TOK-STUDENT',
      dxUrl: 'https://you-net-dx.jp/x?type=0&studio_id=3',
    }));
    check('dxCheckIn → 通る', got.indexOf('"ok":true') !== -1, got.slice(0, 60));
  }
  {
    const api = loadGas(file);
    const got = String(post(api, {
      action: 'checkIn', idToken: 'TOK-STUDENT',
      date: '2026-09-10', name: '架空四郎', grade: '3', time: '09:00',
    }));
    check('checkIn → 通る', got.indexOf('"ok":true') !== -1, got.slice(0, 60));
  }
  {
    const api = loadGas(file);
    const got = String(post(api, {
      action: 'savePeriod2', idToken: 'TOK-STUDENT', week: 'W37', name: '架空四郎', selections: {},
    }));
    check('savePeriod2 → 通る', got.indexOf('"ok":true') !== -1, got.slice(0, 60));
  }

  // === 試験6: getAttendance / getPeriod2 は生徒には本人の行だけ ===
  say('\n--- getAttendance / getPeriod2（生徒には本人の行だけ）---');
  {
    const api = loadGas(file);
    const sent = { action: 'getAttendance', idToken: 'TOK-STUDENT', date: '2026-09-09' };
    const got = String(post(api, sent));
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    check('★他人（架空太郎）の登校が返らない', got.indexOf('架空太郎') === -1, got.slice(0, 120));
    check('本人（架空四郎）の登校は返る', got.indexOf('架空四郎') !== -1, got.slice(0, 120));
  }
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'getPeriod2', idToken: 'TOK-STUDENT', week: 'W37' }));
    say('  getPeriod2 の返り: ' + got);
    check('★他人（架空太郎）の2限選択が返らない', got.indexOf('架空太郎') === -1, got.slice(0, 120));
    check('本人（架空四郎）の2限選択は返る', got.indexOf('架空四郎') !== -1, got.slice(0, 120));
  }
  {
    const api = loadGas(file);
    const got = String(post(api, { action: 'getAttendance', idToken: 'TOK-STAFF', date: '2026-09-09' }));
    check('職員には全員分が返る', got.indexOf('架空太郎') !== -1 && got.indexOf('架空四郎') !== -1,
      got.slice(0, 120));
  }

  // === 試験7: 判定できない形は全部拒否 ===
  say('\n--- ★生徒とも職員とも判定できない形（kawata@…）---');
  for (const act of ['getStudents', 'getMe', 'getTT', 'dxCheckIn']) {
    const api = loadGas(file);
    const got = String(post(api, { action: act, idToken: 'TOK-WEIRD', dxUrl: 'https://x/y?type=0' }));
    check(`${act.padEnd(12)} → 拒否（unknownAccount）`,
      got.indexOf('"reason":"unknownAccount"') !== -1, got.slice(0, 70));
  }

  // === 試験8: 「ログインし直せ」と「権限が無い」が区別できる ===
  say('\n--- 拒否の区別（画面が違う文言を出せるか）---');
  {
    const a = String(post(loadGas(file), { action: 'getStudents' }));                        // トークン無し
    const b = String(post(loadGas(file), { action: 'getStudents', idToken: 'TOK-STUDENT' })); // 生徒
    say('  トークン無し: ' + a);
    say('  生徒:         ' + b);
    check('★「ログインし直せ」は unauthorized/signin', a.indexOf('"error":"unauthorized"') !== -1
      && a.indexOf('"reason":"signin"') !== -1, a.slice(0, 70));
    check('★「権限が無い」は forbidden/staffOnly', b.indexOf('"error":"forbidden"') !== -1
      && b.indexOf('"reason":"staffOnly"') !== -1, b.slice(0, 70));
    check('★2つは別物として見分けられる', a !== b);
  }

  // === 試験9: GET の入口も塞がっているか（doGet を直接）===
  say('\n--- GET の入口を生徒が直接叩く ---');
  {
    const api = loadGas(file);
    const got = String(api.doGet({ parameter: { action: 'getStudents', idToken: 'TOK-STUDENT' } }));
    check('GET getStudents → 生徒は拒否', got.indexOf('"reason":"staffOnly"') !== -1, got.slice(0, 80));
    check('GET getStudents → 氏名が返らない', got.indexOf('架空') === -1);
  }

  // === 試験10: audit に職員/生徒が残る（★メール・氏名は note に書かない）===
  say('\n--- 操作の記録（audit に職員/生徒が残るか）---');
  {
    const api = loadGas(file);
    post(api, { action: 'getStudents', idToken: 'TOK-STUDENT' });   // 拒否された生徒
    post(api, { action: 'saveTT', idToken: 'TOK-STAFF', data: {} }); // 通った職員
    const rows = api.sheets['audit'] ? api.sheets['audit']._rows().slice(1) : [];
    say('  audit の中身: ' + (rows.length ? rows.map(r => r.join('|')).join('  /  ') : '(なし)'));
    check('拒否も通過も記録される', rows.length === 2, rows.length + '行');
    const notes = rows.map(r => String(r[4] || '')).join(' ');
    check('★[student] と [staff] が残る',
      notes.indexOf('[student]') !== -1 && notes.indexOf('[staff]') !== -1, notes);
    check('★拒否の理由が残る', notes.indexOf('denied:staffOnly') !== -1, notes);
    check('★note にメールアドレスが入っていない', notes.indexOf('@') === -1, notes);
    check('★note に生徒の氏名が入っていない', notes.indexOf('架空') === -1, notes);
  }
}

say('============================================================');
say(' A4-41 職員/生徒の判定 実測  ' + new Date().toISOString());
say('============================================================');

failures = 0;
runSuite(FIXED, '本命：判定を入れた版');
const fixedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：判定を入れる前の版で同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(CONTROL, '負の対照：判定なし（@yushi-kokusai.jp なら誰でも通る版）');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（判定あり）      : FAIL ${fixedFailures} 件  → 0 でなければならない`);
say(` 負の対照（判定なし）  : FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = fixedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_role_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
