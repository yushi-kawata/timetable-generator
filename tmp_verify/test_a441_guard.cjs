// ============================================================================
// A4-41 番人（Firebase IDトークン検証）のローカル実測
// ============================================================================
// Apps Script の道具を最小限だけ偽物で用意して、貼る予定の本物のコードを
// そのまま読み込み、関数（doGet / doPost）を直接呼ぶ。
//
// 測ること
//   1. 6パターン（トークンなし／デタラメ／期限切れ／別ドメイン／メール未確認／
//      bodyにemailだけ）が全部弾かれること
//   2. 正しいトークンなら通ること
//   3. 弾いたときに【シートを1回も触っていない】こと（fail close の実体）
//   4. 15アクション全部が番人の後ろにあること
//   5. 2026-09-02 の修正2点（平文を返さない／パスワードを消さない）が生きていること
//   6. ★負の対照＝番人を外したコード（修正版_20260902）では 1・3・4 が FAIL すること
//
// ★生徒の実データは一切使わない。すべて架空の値。
// 使い方: node tmp_verify/test_a441_guard.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const GUARDED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const UNGUARDED = 'gas-script.本番_修正版_20260902.js';   // 負の対照（番人が無い版）

// ---------------------------------------------------------------------------
// 偽物の Apps Script 環境
// ---------------------------------------------------------------------------
const HEADERS = ['name','grade','course','月','火','水','木','金','dx_email','dx_password'];
const SEED_STUDENTS = [
  HEADERS,
  ['架空太郎','1','通常','○','','','','','taro@dx.example','pw-AAA'],
  ['架空花子','2','Growth','','○','','','','hanako@dx.example','pw-BBB'],
  ['架空次郎','1','通常','','','○','','','',''],            // 元から未設定
];

function makeSheet(name, rows) {
  let data = rows.map(r => r.slice());
  const touch = { read: 0, write: 0 };
  const sheet = {
    _name: name,
    _rows: () => data,
    _touch: touch,
    getName: () => name,
    getDataRange: () => { touch.read++; return { getValues: () => data.map(r => r.slice()) }; },
    getLastRow: () => data.length,
    clear: () => { touch.write++; data = []; },
    appendRow: (r) => { touch.write++; data.push(r.slice()); },
    deleteRow: (i) => { touch.write++; data.splice(i - 1, 1); },
    deleteRows: (i, n) => { touch.write++; data.splice(i - 1, n); },
    getRange: () => ({
      setValue: () => { touch.write++; },
      setFontWeight(){ return this; }, setBackground(){ return this; }, setFontColor(){ return this; },
      getValues: () => data.map(r => r.slice()),
    }),
    setFrozenRows: () => {},
  };
  return sheet;
}

// トークンの台帳（偽の identitytoolkit がこれを見て答える）
const TOKENS = {
  'VALID-STAFF':   { code: 200, body: { users: [{ email: 'kawata@yushi-kokusai.jp', emailVerified: true }] } },
  'VALID-STUDENT': { code: 200, body: { users: [{ email: 's26100012@yushi-kokusai.jp', emailVerified: true }] } },
  'JUNK':          { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } },
  'EXPIRED':       { code: 400, body: { error: { message: 'TOKEN_EXPIRED' } } },
  'OTHER-DOMAIN':  { code: 200, body: { users: [{ email: 'someone@gmail.com', emailVerified: true }] } },
  'UNVERIFIED':    { code: 200, body: { users: [{ email: 'kari@yushi-kokusai.jp', emailVerified: false }] } },
};

function loadGas(file, opts) {
  opts = opts || {};
  const sheets = {
    records:    makeSheet('records', [['id','week','name','grade','days','sel','timestamp']]),
    timetable:  makeSheet('timetable', [['data']]),
    students:   makeSheet('students', SEED_STUDENTS),
    attendance: makeSheet('attendance', [['date','name','grade','checkinTime','checkoutTime']]),
    period2:    makeSheet('period2', [['week','name','月','火','水','木','金']]),
  };
  const created = [];
  const cache = {};
  const lookups = [];

  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => { created.push(n); sheets[n] = makeSheet(n, []); return sheets[n]; },
    }),
    flush: () => {},
  };
  // createTextOutput は「文字列そのもの」を返す（テストから中身を読めるように）
  global.ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ setMimeType: () => t }),
  };
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k === 'FIREBASE_API_KEY'
        ? (opts.noApiKey ? null : 'FAKE-API-KEY')
        : null),
    }),
  };
  global.CacheService = {
    getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      put: (k, v) => { cache[k] = v; },
    }),
  };
  global.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_a, s) => require('crypto').createHash('sha256').update(String(s)).digest(),
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
  };
  global.Logger = { log: () => {} };
  global.UrlFetchApp = {
    fetch: (url, params) => {
      if (String(url).indexOf('identitytoolkit.googleapis.com') !== -1) {
        const tok = JSON.parse(params.payload).idToken;
        lookups.push(tok);
        const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
        return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
      }
      // younetDX 側は今回の試験では踏まない
      return {
        getResponseCode: () => 200,
        getContentText: () => '<input name="student_id" value="1" />',
        getAllHeaders: () => ({ 'Set-Cookie': 'PHPSESSID=x; path=/' }),
      };
    },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず、
  // require では読めない。読むのは同じリポジトリ内の自分たちのファイルだけで、
  // 外部入力は一切通していない（既存の tmp_verify/test_baseline.cjs と同じ方式）。
  // 最後の式の値が返るので、そこで doGet / doPost を受け取る。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost });');
  return { doGet: api.doGet, doPost: api.doPost, sheets, created, lookups };
}

// ---------------------------------------------------------------------------
// 判定の道具
// ---------------------------------------------------------------------------
let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
  return cond;
}
function touchTotal(sheets) {
  return Object.keys(sheets).reduce((n, k) => n + sheets[k]._touch.read + sheets[k]._touch.write, 0);
}

const READ_ACTIONS  = ['getRecs','getStudents','getAttendance','getPeriod2','getTT'];
const WRITE_ACTIONS = ['saveRec','deleteRec','clearRecs','saveTT','saveStudents',
                       'checkIn','checkOut','savePeriod2','authStudent','dxCheckIn'];
const ALL_ACTIONS = READ_ACTIONS.concat(WRITE_ACTIONS);

// 各アクションを「本物の画面と同じ形」で1回叩くための本体
function bodyFor(action, extra) {
  const base = { action: action };
  if (action === 'saveRec')      base.data = { id: 1, week: 'W1', name: '架空太郎', grade: '1', days: {}, sel: {}, timestamp: 't' };
  if (action === 'deleteRec')    base.id = 1;
  if (action === 'saveTT')       base.data = { dummy: true };
  if (action === 'saveStudents') base.data = [{ name: '架空太郎', grade: '1', course: '通常', dx_email: 'taro@dx.example', dx_password: '', days: {} }];
  if (action === 'checkIn')      { base.date = '2026-09-08'; base.name = '架空太郎'; base.grade = '1'; base.time = '09:00'; }
  if (action === 'checkOut')     { base.date = '2026-09-08'; base.name = '架空太郎'; base.time = '15:00'; }
  if (action === 'savePeriod2')  { base.week = 'W1'; base.name = '架空太郎'; base.selections = {}; }
  if (action === 'authStudent')  { base.email = 'taro@dx.example'; base.password = 'pw-AAA'; }
  if (action === 'dxCheckIn')    { base.email = 'taro@dx.example'; base.dxUrl = 'https://you-net-dx.jp/x?type=0&studio_id=3'; }
  return Object.assign(base, extra || {});
}

function post(api, body) {
  return api.doPost({ postData: { contents: JSON.stringify(body) } });
}

// ---------------------------------------------------------------------------
// 本体：ある版に対して同じ試験を流す
// ---------------------------------------------------------------------------
function runSuite(file, label) {
  console.log(`\n############ ${label} （${file}） ############`);

  // === 試験1〜6: 弾かれるべき6パターン ===
  const badCases = [
    ['① トークンなし',                     {}],
    ['② デタラメなトークン',               { idToken: 'JUNK' }],
    ['③ 期限切れのトークン',               { idToken: 'EXPIRED' }],
    ['④ @yushi-kokusai.jp 以外のドメイン', { idToken: 'OTHER-DOMAIN' }],
    ['⑤ メール未確認のアカウント',         { idToken: 'UNVERIFIED' }],
    ['⑥ bodyにemailを書くだけ',            { email: 'kawata@yushi-kokusai.jp', authEmail: 'kawata@yushi-kokusai.jp' }],
  ];

  console.log('\n--- 弾かれるべき6パターン（読み取り getStudents）---');
  for (const [name, extra] of badCases) {
    const api = loadGas(file);
    const raw = post(api, bodyFor('getStudents', extra));
    const txt = String(raw);
    const denied = txt.indexOf('"error":"unauthorized"') !== -1;
    const noData = txt.indexOf('架空') === -1 && txt.indexOf('dx.example') === -1;
    const untouched = touchTotal(api.sheets) === 0;
    check(`${name} → 拒否`, denied, txt.slice(0, 90));
    check(`${name} → 生徒データが1件も返らない`, noData);
    check(`${name} → シートを1回も触っていない`, untouched, 'touch=' + touchTotal(api.sheets));
  }

  console.log('\n--- 弾かれるべき6パターン（書き込み saveStudents ＝名簿の全消しに直結）---');
  for (const [name, extra] of badCases) {
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets.students._rows());
    const raw = post(api, bodyFor('saveStudents', extra));
    const txt = String(raw);
    const denied = txt.indexOf('"error":"unauthorized"') !== -1;
    const after = JSON.stringify(api.sheets.students._rows());
    check(`${name} → 拒否`, denied, txt.slice(0, 90));
    check(`${name} → 名簿が変わっていない`, before === after,
          before === after ? '' : `行数 ${api.sheets.students._rows().length}`);
  }

  // === 試験7: 15アクション全部が番人の後ろにあるか（トークンなしで総当たり）===
  console.log('\n--- 15アクション総当たり（トークンなし）---');
  const unguarded = [];
  for (const action of ALL_ACTIONS) {
    const api = loadGas(file);
    const txt = String(post(api, bodyFor(action)));
    const denied = txt.indexOf('"error":"unauthorized"') !== -1;
    const untouched = touchTotal(api.sheets) === 0;
    if (!denied || !untouched) unguarded.push(action + (denied ? '(触った)' : '(素通り)'));
    console.log(`  ${denied && untouched ? 'PASS' : '**FAIL**'}  ${action.padEnd(14)} 拒否=${denied} シート無傷=${untouched}  ${txt.slice(0, 60)}`);
  }
  check(`15アクション全部が番人の後ろにある`, unguarded.length === 0,
        unguarded.length ? '素通り: ' + unguarded.join(', ') : '15/15');

  // === 試験8: GET の入口も塞がっているか ===
  console.log('\n--- GET の入口（doGet を直接・トークンなし）---');
  for (const action of READ_ACTIONS) {
    const api = loadGas(file);
    const txt = String(api.doGet({ parameter: { action: action } }));
    const denied = txt.indexOf('"error":"unauthorized"') !== -1;
    check(`GET ${action} → 拒否`, denied, txt.slice(0, 60));
  }

  // === 試験9: 正しいトークンなら通る ===
  console.log('\n--- 正しいトークン（@yushi-kokusai.jp・確認済み）なら通る ---');
  {
    const api = loadGas(file);
    const txt = String(post(api, bodyFor('getStudents', { idToken: 'VALID-STAFF' })));
    let arr = null;
    try { arr = JSON.parse(txt); } catch (e) {}
    check('職員トークン → getStudents が通る', Array.isArray(arr) && arr.length === 3,
          Array.isArray(arr) ? arr.length + '件' : txt.slice(0, 60));
    check('★通っても平文パスワードは返らない', txt.indexOf('pw-') === -1);
    check('★has_password が入っている', txt.indexOf('has_password') !== -1);
    if (Array.isArray(arr) && arr[0]) {
      console.log(`      返ってきた項目: ${Object.keys(arr[0]).join(', ')}`);
    }
  }
  {
    const api = loadGas(file);
    const txt = String(post(api, bodyFor('getTT', { idToken: 'VALID-STUDENT' })));
    check('生徒トークン（s26100012@yushi-kokusai.jp）→ getTT が通る',
          txt.indexOf('unauthorized') === -1, txt.slice(0, 60));
  }

  // === 試験10: FIREBASE_API_KEY 未設定なら「通す」ではなく「通さない」 ===
  console.log('\n--- FIREBASE_API_KEY 未設定のとき ---');
  {
    const api = loadGas(file, { noApiKey: true });
    const txt = String(post(api, bodyFor('getStudents', { idToken: 'VALID-STAFF' })));
    check('キー未設定 → 正しいトークンでも拒否（安全側）',
          txt.indexOf('"error":"unauthorized"') !== -1, txt.slice(0, 60));
  }

  // === 試験11: 2026-09-02 の修正2点が生きているか（正しいトークンで）===
  console.log('\n--- 2026-09-02 の修正2点（★両方そろっていること）---');
  {
    const api = loadGas(file);
    // 画面から届く形：getStudents が dx_password を返さないので全員空で来る
    const payload = [
      { name:'架空太郎', grade:'1', course:'通常',  dx_email:'taro@dx.example',   dx_password:'', days:{月:true} },
      { name:'架空花子', grade:'2', course:'Growth', dx_email:'hanako@dx.example', dx_password:'', days:{火:true} },
      { name:'架空次郎', grade:'1', course:'通常',  dx_email:'',                  dx_password:'', days:{水:true} },
    ];
    post(api, { action: 'saveStudents', idToken: 'VALID-STAFF', data: payload });
    const rows = api.sheets.students._rows();
    const iPw = HEADERS.indexOf('dx_password');
    const got = { 架空太郎: rows[1] && rows[1][iPw], 架空花子: rows[2] && rows[2][iPw], 架空次郎: rows[3] && rows[3][iPw] };
    check('空で届いた既存パスワードが据え置かれる（太郎）', got.架空太郎 === 'pw-AAA', `実際「${got.架空太郎}」`);
    check('空で届いた既存パスワードが据え置かれる（花子）', got.架空花子 === 'pw-BBB', `実際「${got.架空花子}」`);
    check('元から未設定の人は空のまま（次郎）',            got.架空次郎 === '',       `実際「${got.架空次郎}」`);

    // 変更したいときは通る
    post(api, { action: 'saveStudents', idToken: 'VALID-STAFF',
      data: [{ name:'架空太郎', grade:'1', course:'通常', dx_email:'taro@dx.example', dx_password:'pw-NEW', days:{月:true} }] });
    check('変更したいときは通る', api.sheets.students._rows()[1][iPw] === 'pw-NEW');
  }

  // === 試験12: 名簿の全消し止め ===
  console.log('\n--- 名簿の全消し止め（2026-09-08 追加）---');
  {
    const api = loadGas(file);
    const before = api.sheets.students._rows().length;
    const txt = String(post(api, { action: 'saveStudents', idToken: 'VALID-STAFF', data: [] }));
    const after = api.sheets.students._rows().length;
    check('0件での上書きを拒否する', txt.indexOf('refuseWipe') !== -1, txt.slice(0, 70));
    check('拒否したとき名簿が残っている', before === after, `${before}行 → ${after}行`);
  }
  {
    const api = loadGas(file);
    const before = api.sheets.students._rows().length;
    const txt = String(post(api, { action: 'saveStudents', idToken: 'VALID-STAFF' }));  // data が無い
    const after = api.sheets.students._rows().length;
    check('data が無い要求で名簿を消さない', before === after, `${before}行 → ${after}行 / ${txt.slice(0, 50)}`);
  }

  // === 試験13: 操作の記録が残るか ===
  console.log('\n--- 操作の記録（シート audit）---');
  {
    const api = loadGas(file);
    post(api, { action: 'saveStudents', idToken: 'VALID-STAFF',
      data: [{ name:'架空太郎', grade:'1', course:'通常', dx_email:'taro@dx.example', dx_password:'', days:{月:true} }] });
    const audit = api.sheets['audit'];
    const rows = audit ? audit._rows() : [];
    const line = rows.length ? rows[rows.length - 1] : null;
    check('audit シートが作られて1行記録される', !!line, line ? line.join(' | ') : '記録なし');
    if (line) {
      check('★誰が（確かめ済みのメール）が入っている', line.indexOf('kawata@yushi-kokusai.jp') !== -1);
      check('★何を（アクション名）が入っている',       line.indexOf('saveStudents') !== -1);
      check('★生徒の氏名が記録に入っていない',         line.join('').indexOf('架空') === -1, line.join(' | '));
      check('★生徒のパスワードが記録に入っていない',   line.join('').indexOf('pw-') === -1);
    }
    check('既存シートは1枚も増減していない（増えたのは audit だけ）',
          api.created.length === 1 && api.created[0] === 'audit', '増えたシート: ' + api.created.join(', '));
  }

  return failures;
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
console.log('============================================================');
console.log(' A4-41 番人のローカル実測  ' + new Date().toISOString());
console.log('============================================================');

failures = 0;
runSuite(GUARDED, '本命：番人入りの版');
const guardedFailures = failures;

console.log('\n\n============================================================');
console.log(' ★負の対照：番人を外した版で同じ試験が FAIL すること');
console.log(' （ここが全部 PASS になるなら、試験は何も検査していない）');
console.log('============================================================');
failures = 0;
runSuite(UNGUARDED, '負の対照：番人なしの版');
const controlFailures = failures;

console.log('\n============================================================');
console.log(` 本命（番人入り）      : FAIL ${guardedFailures} 件  → 0 でなければならない`);
console.log(` 負の対照（番人なし）  : FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
console.log('============================================================');

const ok = guardedFailures === 0 && controlFailures > 0;
console.log(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');
process.exit(ok ? 0 : 1);
