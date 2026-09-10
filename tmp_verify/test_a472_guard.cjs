// ============================================================================
// A4-72 保健（健康観察）の窓口 番人のローカル実測（2026-09-10）
// ============================================================================
// Apps Script の道具を最小限だけ偽物で用意して、貼る予定の本物のコードを
// そのまま読み込み、関数（doGet / doPost / HC_番人_自己診断）を直接呼ぶ。
//
// 測ること
//   1. 無認証／偽トークン／期限切れ／別ドメイン／メール未確認 が全部弾かれること
//   2. ★生徒メールは全アクション拒否（この窓口は職員だけ）
//   3. 職員メールなら5アクションが通ること
//   4. ★GET で届いた書き込み（submit / updateRoster）を拒否すること（CSRF対策）
//   5. ★0件での名簿上書きを拒否すること（refuseWipe）
//   6. 弾いたときに【シートを1行も書き換えていない】こと（fail close の実体）
//   7. 弾いたときに【氏名・健康記録が1文字も返らない】こと（★中身ではなく形を見る）
//   8. 例外の中身（シート名など）を外に返さないこと
//   9. audit に「誰が・何を」が残り、★氏名は残らないこと
//  10. 自己診断がシートを1行も書き換えないこと／貼る場所の間違いを検出すること
//  11. ★負の対照＝番人を外した版（control_a472_before_20260910.js）で
//      1・2・4・5・7 が FAIL すること
//
// ★生徒の実データは一切使わない。すべて架空の値。
// ★本番の窓口は叩かない（通信はすべて偽物に差し替えてある）。
// 使い方: node tmp_verify/test_a472_guard.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const GUARDED   = 'gas-health-check.js';
const UNGUARDED = 'tmp_verify/control_a472_before_20260910.js';   // 負の対照（番人が無い版）

const SHEET_ID = '16AtoTfJxu5SYFGjKcBjXNz_ohB9DHX_2m37Je371PDk';

// ---------------------------------------------------------------------------
// 架空の名簿・記録（★実在の氏名・メールは使わない）
// ---------------------------------------------------------------------------
const ROSTER_ROWS = [
  ['名前', '月', '火', '水', '木', '金'],
  ['架空太郎', '○', '', '', '', ''],
  ['架空花子', '', '○', '', '', ''],
];
const RECORD_ROWS = [
  ['日付', '名前', '体調', '出欠', '登校時間', '備考', '記録者', '記録時刻'],
  ['2026-09-10', '架空太郎', '良好', '出席', '09:00', '', '保健委員', '2026-09-10 09:05'],
  [new Date(Date.UTC(2026, 8, 10, 0, 0)), '架空花子', '不良', '遅刻', '10:00', '架空の理由', '保健委員', '2026-09-10 10:05'],
  ['2026-09-09', '架空太郎', '良好', '出席', '09:00', '', '保健委員', '2026-09-09 09:05'],
];

// トークンの台帳（偽の identitytoolkit がこれを見て答える）
const TOKENS = {
  'TOK-STAFF':      { code: 200, body: { users: [{ email: 's-hisho09@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-STAFF2':     { code: 200, body: { users: [{ email: 'sa-sakai@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-STUDENT':    { code: 200, body: { users: [{ email: 's26100012@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-OTHERDOMAIN':{ code: 200, body: { users: [{ email: 's-kawata@gmail.com', emailVerified: true }] } },
  'TOK-UNVERIFIED': { code: 200, body: { users: [{ email: 's-hisho09@yushi-kokusai.jp', emailVerified: false }] } },
  'TOK-WEIRD':      { code: 200, body: { users: [{ email: 'kawata@yushi-kokusai.jp', emailVerified: true }] } },
  // ★期限切れ・改ざんは identitytoolkit が 400 を返す
  'TOK-EXPIRED':    { code: 400, body: { error: { message: 'TOKEN_EXPIRED' } } },
};

// ---------------------------------------------------------------------------
// 偽物の Apps Script 環境
// ---------------------------------------------------------------------------
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
    clearContents: () => { touch.write++; data = []; },
    appendRow: (r) => { touch.write++; data.push(r.slice()); },
    deleteRow: (i) => { touch.write++; data.splice(i - 1, 1); },
    deleteRows: (i, n) => { touch.write++; data.splice(i - 1, n); },
    getRange: (row, col, nRows, nCols) => ({
      setValue: () => { touch.write++; },
      getValues: () => {
        touch.read++;
        const h = nRows || 1, w = nCols || 1;
        const out = [];
        for (let r = 0; r < h; r++) {
          const src = data[(row - 1) + r] || [];
          const line = [];
          for (let c = 0; c < w; c++) line.push(src[(col - 1) + c]);
          out.push(line);
        }
        return out;
      },
      setValues: (vals) => {
        touch.write++;
        vals.forEach((line, r) => {
          const target = (row - 1) + r;
          if (!data[target]) data[target] = [];
          line.forEach((v, c) => { data[target][(col - 1) + c] = v; });
        });
      },
    }),
    setFrozenRows: () => {},
  };
}

function fmtDate_(d, _tz, pattern) {
  const t = new Date(d.getTime() + 9 * 3600 * 1000);   // Asia/Tokyo
  const p = (n, w) => String(n).padStart(w, '0');
  const ymd = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1, 2)}-${p(t.getUTCDate(), 2)}`;
  if (pattern === 'yyyy-MM-dd') return ymd;
  return `${ymd} ${p(t.getUTCHours(), 2)}:${p(t.getUTCMinutes(), 2)}`;
}

/**
 * opts.activeId      : getActiveSpreadsheet が返すID（貼る場所の間違いを作るため）
 * opts.noApiKey      : FIREBASE_API_KEY 未設定
 * opts.rosterName    : 名簿シートの名前をずらす（例外の扱いを見るため）
 * opts.noFetch       : UrlFetchApp を呼んだら失敗させる（自己診断が外に出ないことの確認）
 */
function loadGas(file, opts) {
  opts = opts || {};
  const sheets = {};
  sheets[opts.rosterName || '名簿'] = makeSheet(opts.rosterName || '名簿', ROSTER_ROWS);
  sheets['記録'] = makeSheet('記録', RECORD_ROWS);
  const created = [];
  const spreadsheet = {
    getId: () => (opts.activeId || SHEET_ID),
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { created.push(n); sheets[n] = makeSheet(n, []); return sheets[n]; },
  };
  const openedIds = [];
  global.SpreadsheetApp = {
    openById: (id) => { openedIds.push(id); return spreadsheet; },
    getActiveSpreadsheet: () => spreadsheet,
    flush: () => {},
  };
  global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => t }) };
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k === 'FIREBASE_API_KEY' ? (opts.noApiKey ? null : 'FAKE-API-KEY') : null),
    }),
  };
  const cache = {};
  global.CacheService = {
    getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }),
  };
  global.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_a, s) => require('crypto').createHash('sha256').update(String(s)).digest(),
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    formatDate: fmtDate_,
  };
  const logged = [];
  global.Logger = { log: (s) => logged.push(String(s)) };
  const lookups = [];
  global.UrlFetchApp = {
    fetch: (url, params) => {
      if (opts.noFetch) throw new Error('★外部に問い合わせようとしました: ' + url);
      params = params || {};
      const tok = JSON.parse(params.payload).idToken;
      lookups.push(tok);
      const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
      return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
    },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost, ' +
    'selfcheck: (typeof HC_番人_自己診断 === "function" ? HC_番人_自己診断 : null) });');
  return {
    doGet: api.doGet, doPost: api.doPost, selfcheck: api.selfcheck,
    sheets, created, lookups, logged, openedIds,
  };
}

// ★負の対照（貼る前の版）は例外で落ちることがある（本文が壊れているときなど）。
//   落ちた場合も「その形の返り」として扱い、試験全体は続ける。
//   例外がそのまま出るのは Apps Script では HTTP 500 ＋ 内部メッセージの露出にあたる。
function post(api, body) {
  try {
    return String(api.doPost({ postData: { contents: JSON.stringify(body) } }));
  } catch (err) {
    return '(例外) ' + err.message;
  }
}
function get(api, params) {
  try {
    return String(api.doGet({ parameter: params }));
  } catch (err) {
    return '(例外) ' + err.message;
  }
}
function postRaw(api, raw) {
  try {
    return String(api.doPost({ postData: { contents: raw } }));
  } catch (err) {
    return '(例外) ' + err.message;
  }
}
function writesOf(api) {
  return Object.keys(api.sheets).reduce((n, k) => n + api.sheets[k]._touch.write, 0);
}
function snapshot(api) {
  return JSON.stringify(Object.keys(api.sheets).map(k => api.sheets[k]._rows()));
}
// ★データのシート（名簿 / 記録）だけを見る版。
//   ログイン済みの人を拒否したときは audit に1行残るのが【正しい振る舞い】なので、
//   audit まで「1行も変わっていないこと」に含めると、正しいコードを FAIL と誤報する。
//   （最初この誤報を出した。自作の検査を先に疑う）
function snapshotData(api) {
  return JSON.stringify(Object.keys(api.sheets)
    .filter(k => k !== 'audit')
    .map(k => api.sheets[k]._rows()));
}
function auditRowCount(api) {
  const sheet = api.sheets['audit'];
  return sheet ? Math.max(0, sheet._rows().length - 1) : 0;
}
// ★中身ではなく形を見る。いまは架空でも本番の1件目から実データになる
const LEAKS = ['架空太郎', '架空花子', '良好', '不良', '遅刻', '架空の理由'];
function leaked(txt) {
  return LEAKS.filter(w => txt.indexOf(w) !== -1);
}
// ★2026-09-10 追加。保健委員（生徒）は roster で【クラスの氏名】は見てよいが、
//   【健康記録の中身】（体調・出欠・欠席理由）は見てはいけない。
//   氏名まで禁止にすると「名簿を見て入力する」作業そのものが成立しないので、
//   生徒に通すアクションでは この2つを分けて検査する。
const HEALTH_WORDS = ['良好', '不良', '遅刻', '早退', '架空の理由'];
function leakedHealth(txt) {
  return HEALTH_WORDS.filter(w => txt.indexOf(w) !== -1);
}

let failures = 0;
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function check(label, cond, detail) {
  if (!cond) failures++;
  say(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
  return cond;
}

const ALL_ACTIONS   = ['roster', 'records', 'allRoster', 'submit', 'updateRoster'];
const WRITE_ACTIONS = ['submit', 'updateRoster'];
// ★2026-09-10 設計変更（社長決裁A案）＝人ではなく操作で分ける
const STAFF_ONLY    = ['allRoster', 'records', 'updateRoster'];   // 職員だけ
const STUDENT_OK    = ['roster', 'submit'];                        // 保健委員の作業

// アクションごとの、まともな引数（拒否されるべき場面で「引数不足で落ちた」と
// 取り違えないように、いつも本物と同じ形を送る）
function argsFor(action) {
  if (action === 'roster') return { day: '月' };
  if (action === 'records') return { date: '2026-09-10' };
  if (action === 'allRoster') return {};
  if (action === 'submit') {
    return {
      date: '2026-09-10', recorder: '保健委員',
      records: [{ name: '架空次郎', condition: '良好', attendance: '出席', arrivalTime: '09:00', remarks: '' }],
    };
  }
  if (action === 'updateRoster') {
    return { roster: [{ name: '架空次郎', days: { 月: true, 火: false, 水: false, 木: false, 金: false } }] };
  }
  return {};
}

// ---------------------------------------------------------------------------
function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  // === 試験1: 弾かれるべき6パターン ===
  say('\n--- 弾かれるべき6パターン（5アクション全部・POST）---');
  const BAD = [
    ['トークン無し',        {}],
    ['デタラメなトークン',  { idToken: 'DEADBEEF.NOT.AREALTOKEN' }],
    ['期限切れ',            { idToken: 'TOK-EXPIRED' }],
    ['別ドメイン(gmail)',   { idToken: 'TOK-OTHERDOMAIN' }],
    ['メール未確認',        { idToken: 'TOK-UNVERIFIED' }],
    ['トークンが文字列でない', { idToken: { evil: 1 } }],
  ];
  for (const [name, extra] of BAD) {
    let allDenied = true, allIntact = true, leaks = [];
    for (const action of ALL_ACTIONS) {
      const api = loadGas(file);
      const before = snapshot(api);
      const txt = post(api, Object.assign({ action }, argsFor(action), extra));
      if (txt.indexOf('"error":"unauthorized"') === -1 || txt.indexOf('"reason":"signin"') === -1) allDenied = false;
      if (writesOf(api) !== 0 || snapshot(api) !== before) allIntact = false;
      leaks = leaks.concat(leaked(txt));
    }
    check(`${name.padEnd(22)} → 5アクション全部が unauthorized/signin`, allDenied);
    check(`${name.padEnd(22)} → シートを1行も書き換えていない`, allIntact);
    check(`${name.padEnd(22)} → ★氏名・健康記録が1文字も返らない`, leaks.length === 0, leaks.join(','));
  }

  // 実際の返り（1件だけそのまま見せる）
  {
    const api = loadGas(file);
    const sent = { action: 'allRoster' };
    say('\n  送ったもの（無認証・allRoster）: ' + JSON.stringify(sent));
    say('  返ったもの: ' + post(api, sent));
  }

  // === 試験2: ★人ではなく操作で分ける（2026-09-10 設計変更・社長決裁A案）===
  //   生徒（ログイン済み）: roster / submit は通る、それ以外の3つは拒否
  say('\n--- ★生徒のトークン（s26100012…）で【職員だけの3つ】を叩く ---');
  for (const action of STAFF_ONLY) {
    const api = loadGas(file);
    const before = snapshotData(api);
    const txt = post(api, Object.assign({ action, idToken: 'TOK-STUDENT' }, argsFor(action)));
    const denied = txt.indexOf('"error":"forbidden"') !== -1 && txt.indexOf('"reason":"staffOnly"') !== -1;
    const intact = snapshotData(api) === before;
    const lk = leaked(txt);
    check(`${action.padEnd(13)} → forbidden/staffOnly・名簿と記録は無傷・氏名なし`,
      denied && intact && lk.length === 0,
      denied ? (intact ? lk.join(',') : '★名簿か記録が変わった') : txt.slice(0, 70));
    check(`${action.padEnd(13)} → 拒否が audit に1行残る`, auditRowCount(api) === 1,
      auditRowCount(api) + '行');
  }

  say('\n--- ★生徒（保健委員）が roster で名簿を見る＝通ること ---');
  {
    const api = loadGas(file);
    const before = snapshotData(api);
    const sent = { action: 'roster', idToken: 'TOK-STUDENT', day: '月' };
    const txt = post(api, sent);
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + txt.replace(/架空[^"]*/g, '【氏名】'));
    let r = null; try { r = JSON.parse(txt); } catch (e) {}
    check('★通る（拒否されない）', txt.indexOf('"error"') === -1, txt.slice(0, 70));
    check('★その曜日の名簿が返る（1件）', !!r && Array.isArray(r.students) && r.students.length === 1,
      r && r.students ? r.students.length + '件' : txt.slice(0, 60));
    // ★ここが反転後の「意味のある検査」。氏名は渡すが、健康記録は渡さない
    check('★健康記録の中身（体調・出欠・欠席理由）は1つも返らない',
      leakedHealth(txt).length === 0, leakedHealth(txt).join(','));
    check('★読むだけ＝名簿・記録を1行も書き換えない', snapshotData(api) === before);
  }

  say('\n--- ★生徒（保健委員）が submit で記録を入力する＝通ること ---');
  {
    const api = loadGas(file);
    const rowsBefore = api.sheets['記録']._rows().length;
    const txt = post(api, Object.assign({ action: 'submit', idToken: 'TOK-STUDENT' }, argsFor('submit')));
    const rowsAfter = api.sheets['記録']._rows().length;
    check('★通る（拒否されない）', txt.indexOf('"error"') === -1, txt.slice(0, 70));
    check('★記録が1行増える', rowsAfter === rowsBefore + 1 && txt.indexOf('"count":1') !== -1,
      rowsBefore + '行 → ' + rowsAfter + '行');
    check('★名簿は1行も変わらない',
      JSON.stringify(api.sheets['名簿']._rows()) === JSON.stringify(ROSTER_ROWS));
    // ★誰が入力したかが残る（生徒の入力を職員が後から追える）
    const auditRows = api.sheets['audit'] ? api.sheets['audit']._rows().slice(1) : [];
    check('★入力が audit に残る（role=student）',
      auditRows.length === 1 && auditRows[0][5] === 'student' && auditRows[0][3] === 'ok',
      auditRows.length ? String(auditRows[0][5]) + '/' + String(auditRows[0][3]) : '0行');
    check('★audit に健康記録の中身が入っていない',
      leakedHealth(auditRows.map(r => String(r[4] || '')).join(' ')).length === 0);
  }

  say('\n--- ★生徒が records（その日の一覧）を叩くと拒否＝他人の体調は見えない ---');
  {
    const api = loadGas(file);
    const txt = post(api, { action: 'records', idToken: 'TOK-STUDENT', date: '2026-09-10' });
    check('forbidden/staffOnly で拒否', txt.indexOf('"reason":"staffOnly"') !== -1, txt.slice(0, 70));
    check('★他人の体調・欠席理由が1つも返らない', leakedHealth(txt).length === 0,
      leakedHealth(txt).join(','));
  }

  say('\n--- ★生徒とも職員とも判定できない形（kawata@…）---');
  for (const action of ALL_ACTIONS) {
    const api = loadGas(file);
    const txt = post(api, Object.assign({ action, idToken: 'TOK-WEIRD' }, argsFor(action)));
    check(`${action.padEnd(13)} → forbidden/unknownAccount`,
      txt.indexOf('"reason":"unknownAccount"') !== -1, txt.slice(0, 70));
  }

  // === 試験3: 職員なら通る ===
  say('\n--- 職員のトークンなら5アクションが通る（★件数だけ見る）---');
  for (const tk of ['TOK-STAFF', 'TOK-STAFF2']) {
    const api = loadGas(file);
    const r1 = JSON.parse(post(api, { action: 'roster', idToken: tk, day: '月' }));
    check(`${tk} roster（月）→ 1件`, Array.isArray(r1.students) && r1.students.length === 1,
      JSON.stringify(r1).slice(0, 60));
    const r2 = JSON.parse(post(api, { action: 'records', idToken: tk, date: '2026-09-10' }));
    check(`${tk} records（2026-09-10）→ 2件`, Array.isArray(r2.records) && r2.records.length === 2,
      r2.records ? r2.records.length + '件' : '');
    const r3 = JSON.parse(post(api, { action: 'allRoster', idToken: tk }));
    check(`${tk} allRoster → 2件`, Array.isArray(r3.roster) && r3.roster.length === 2,
      r3.roster ? r3.roster.length + '件' : '');
  }
  {
    const api = loadGas(file);
    const txt = post(api, Object.assign({ action: 'submit', idToken: 'TOK-STAFF' }, argsFor('submit')));
    const rows = api.sheets['記録']._rows();
    check('submit → 記録が1行増える', txt.indexOf('"count":1') !== -1 && rows.length === RECORD_ROWS.length + 1,
      txt.slice(0, 60) + ' / ' + rows.length + '行');
  }
  {
    const api = loadGas(file);
    const txt = post(api, Object.assign({ action: 'updateRoster', idToken: 'TOK-STAFF' }, argsFor('updateRoster')));
    const rows = api.sheets['名簿']._rows();
    check('updateRoster → 名簿が見出し＋1件になる',
      txt.indexOf('"ok":true') !== -1 && rows.length === 2 && rows[0][0] === '名前',
      txt.slice(0, 60) + ' / ' + rows.length + '行');
  }

  // === 試験4: ★GET で届いた書き込みを拒否（CSRF対策）===
  say('\n--- ★GET で書き込みを叩く（正しい職員トークン付き＝CSRFの形）---');
  for (const action of WRITE_ACTIONS) {
    const api = loadGas(file);
    const before = snapshotData(api);
    const params = Object.assign({ action, idToken: 'TOK-STAFF' }, argsFor(action));
    const txt = get(api, params);
    const denied = txt.indexOf('"error":"forbidden"') !== -1 && txt.indexOf('"reason":"postOnly"') !== -1;
    const intact = snapshotData(api) === before;
    check(`GET ${action.padEnd(13)} → forbidden/postOnly`, denied, txt.slice(0, 70));
    check(`GET ${action.padEnd(13)} → ★名簿・記録を1行も書き換えていない`, intact);
  }
  say('\n--- GET の読み取りも番人の後ろにあること（無認証）---');
  for (const action of ['roster', 'records', 'allRoster']) {
    const api = loadGas(file);
    const txt = get(api, Object.assign({ action }, argsFor(action)));
    const lk = leaked(txt);
    check(`GET ${action.padEnd(13)} → unauthorized・氏名なし`,
      txt.indexOf('"error":"unauthorized"') !== -1 && lk.length === 0, txt.slice(0, 70) + ' ' + lk.join(','));
  }

  // === 試験5: ★0件での名簿上書きを拒否（refuseWipe）===
  say('\n--- ★0件で名簿を上書きしようとする（職員トークン）---');
  {
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets['名簿']._rows());
    const sent = { action: 'updateRoster', idToken: 'TOK-STAFF', roster: [] };
    const txt = post(api, sent);
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + txt);
    check('★refuseWipe で拒否', txt.indexOf('"reason":"refuseWipe"') !== -1, txt.slice(0, 80));
    check('★既存の件数(prev:2)を返す', txt.indexOf('"prev":2') !== -1, txt.slice(0, 80));
    check('★名簿が1行も変わっていない', JSON.stringify(api.sheets['名簿']._rows()) === before,
      api.sheets['名簿']._rows().length + '行');
  }
  {
    // 氏名の無い行だけを送っても「0件」として扱う
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets['名簿']._rows());
    const txt = post(api, { action: 'updateRoster', idToken: 'TOK-STAFF', roster: [{ name: '  ', days: {} }, {}] });
    check('★氏名の無い行だけ→ refuseWipe・名簿無傷',
      txt.indexOf('"reason":"refuseWipe"') !== -1 && JSON.stringify(api.sheets['名簿']._rows()) === before,
      txt.slice(0, 70));
  }
  {
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets['名簿']._rows());
    const txt = post(api, { action: 'updateRoster', idToken: 'TOK-STAFF', roster: 'ぜんぶ消す' });
    check('★配列でない→ badPayload・名簿無傷',
      txt.indexOf('"reason":"badPayload"') !== -1 && JSON.stringify(api.sheets['名簿']._rows()) === before,
      txt.slice(0, 70));
  }
  {
    // 本当に全員消したいときは confirmEmpty で通る（＝戻せる道は残す）
    const api = loadGas(file);
    const txt = post(api, { action: 'updateRoster', idToken: 'TOK-STAFF', roster: [], confirmEmpty: true });
    check('confirmEmpty: true なら通る（見出しだけ残る）',
      txt.indexOf('"ok":true') !== -1 && api.sheets['名簿']._rows().length === 1, txt.slice(0, 70));
  }
  {
    const api = loadGas(file);
    const before = JSON.stringify(api.sheets['記録']._rows());
    const txt = post(api, { action: 'submit', idToken: 'TOK-STAFF', date: 'きょう', records: [] });
    check('submit の日付が壊れている→ badPayload・記録無傷',
      txt.indexOf('"reason":"badPayload"') !== -1 && JSON.stringify(api.sheets['記録']._rows()) === before,
      txt.slice(0, 70));
  }

  // === 試験6: 例外の中身を返さない ===
  say('\n--- 例外の中身（シート名など）を外に返さない ---');
  {
    const api = loadGas(file, { rosterName: '名簿2' });   // 名簿が見つからない状態
    const txt = post(api, { action: 'allRoster', idToken: 'TOK-STAFF' });
    check('内部の事情が返らない', txt.indexOf('sheet missing') === -1 && txt.indexOf('名簿') === -1,
      txt.slice(0, 80));
    check('bad request として返る', txt.indexOf('bad request') !== -1, txt.slice(0, 80));
  }
  {
    const api = loadGas(file);
    const txt = postRaw(api, 'これはJSONではない');
    check('本文が壊れていても落ちない', txt.indexOf('bad request') !== -1, txt.slice(0, 80));
  }

  // === 試験7: audit（★氏名は残らない） ===
  say('\n--- 操作の記録（audit）---');
  {
    const api = loadGas(file);
    post(api, { action: 'allRoster' });                                   // 無認証（記録しない）
    post(api, { action: 'allRoster', idToken: 'TOK-STUDENT' });           // 生徒（記録する）
    get(api, { action: 'updateRoster', idToken: 'TOK-STAFF', roster: [] });// GETでの書き込み（記録する）
    post(api, Object.assign({ action: 'submit', idToken: 'TOK-STAFF' }, argsFor('submit')));  // 成功
    const sheet = api.sheets['audit'];
    const rows = sheet ? sheet._rows().slice(1) : [];
    say('  audit の行数: ' + rows.length);
    check('audit シートができる', !!sheet);
    check('★無認証は記録しない（外から行を増やせないように）', rows.length === 3, rows.length + '行');
    const notes = rows.map(r => String(r[4] || '')).join(' ');
    check('拒否の理由が残る（staffOnly / postOnly）',
      notes.indexOf('denied:staffOnly') !== -1 && notes.indexOf('denied:postOnly') !== -1, notes.slice(0, 120));
    check('★note に氏名・健康記録が入っていない', leaked(notes).length === 0, leaked(notes).join(','));
    check('role 列がある（staff / student）',
      rows.some(r => r[5] === 'staff') && rows.some(r => r[5] === 'student'));
  }

  // === 試験8: 自己診断 ===
  say('\n--- 自己診断 HC_番人_自己診断 ---');
  {
    const api = loadGas(file, { noFetch: false });
    if (!api.selfcheck) {
      check('自己診断がある', false, '★この版には入っていません');
    } else {
      const out = String(api.selfcheck());
      say(out.split('\n').map(l => '  | ' + l).join('\n'));
      check('★シートを1行も書き換えない', writesOf(api) === 0, 'write=' + writesOf(api));
      check('★audit シートを作らない', api.created.length === 0, api.created.join(','));
      check('★氏名・健康記録を出さない', leaked(out).length === 0, leaked(out).join(','));
      check('貼る場所: OK と出る', out.indexOf('貼る場所: OK') !== -1);
      // ★2026-09-10 設計変更で4行に分かれた（職員／生徒が使えるもの／職員だけ／判定できない）
      check('職員: OK と出る', out.indexOf('職員: OK') !== -1);
      check('★生徒（保健委員）が使えるもの: OK と出る',
        out.indexOf('生徒（保健委員）が使えるもの: OK') !== -1);
      check('★職員だけのもの: OK と出る', out.indexOf('職員だけのもの: OK') !== -1);
      check('判定できないアカウント: OK と出る', out.indexOf('判定できないアカウント: OK') !== -1);
      check('★自己診断が roster / submit を生徒に通すと言っている',
        out.indexOf('roster, submit が通ります') !== -1,
        (out.split('\n').filter(l => l.indexOf('生徒（保健委員）') === 0)[0] || '(行が無い)'));
      check('GETでの書き込み拒否: OK と出る', out.indexOf('GETでの書き込み拒否: OK') !== -1);
      check('0件上書きの拒否(refuseWipe): OK と出る', out.indexOf('0件上書きの拒否(refuseWipe): OK') !== -1);
      check('職員/生徒の判定（16通り）: OK と出る', out.indexOf('職員/生徒の判定（16通り）: OK') !== -1);
      // ★2026-09-10 追加。ここを見ていなかったので、自己診断が自分の注意書きを読んで
      //   「例外の中身を外に出さない: NG」と誤報しているのを試験が見逃した。
      check('例外の中身を外に出さない: OK と出る', out.indexOf('例外の中身を外に出さない: OK') !== -1,
        (out.split('\n').filter(l => l.indexOf('例外の中身') === 0)[0] || '(行が無い)'));
      // ★NG も ★ 付きの行も1つも無いこと（社長が読む画面の合否そのもの）
      const ngLines = out.split('\n').filter(l => l.indexOf('NG') !== -1 || l.indexOf('★') === 0);
      check('★NG と ★ 付きの行が1つも無い', ngLines.length === 0, ngLines.join(' / ').slice(0, 160));
    }
  }
  if (loadGas(file).selfcheck) {
    // ★貼る場所を間違えたときに気づけるか（時間割ツール本体に貼った状態を作る）
    const api = loadGas(file, { activeId: 'OTHER-SPREADSHEET-ID' });
    const out = String(api.selfcheck());
    check('★貼る場所の間違いを検出する', out.indexOf('貼る場所: ★★NG') !== -1,
      out.split('\n')[0].slice(0, 80));
    // ★鍵が無いときは「通す」ではなく「全部拒否」と出る
    const api2 = loadGas(file, { noApiKey: true });
    const out2 = String(api2.selfcheck());
    check('FIREBASE_API_KEY 未設定を NG と言う', out2.indexOf('FIREBASE_API_KEY: NG') !== -1);
  }
}

// ---------------------------------------------------------------------------
say('============================================================');
say(' A4-72 保健の窓口 番人のローカル実測 v2  ' + new Date().toISOString());
say('============================================================');
say(' ★2026-09-10 設計変更（社長決裁A案）＝人ではなく【操作】で分ける。');
say(' 「保健委員の生徒も入力している」ことが確認されたため、');
say(' 「5アクション全部を職員のみ」から次に改めた。');
say('');
say('   生徒（ログイン済み）に通す : roster / submit   ＝保健委員の作業');
say('   職員だけ                   : allRoster / records / updateRoster');
say('   無認証                     : 5アクション全部拒否（★ここは変えない＝穴の本体）');
say('   判定できないメール         : 5アクション全部拒否');
say('');
say(' ★v1 から反転させた試験ケース（期待値だけ書き換えず、検査の中身を作り直した）:');
say('   1) 生徒×roster : 「拒否される」→「通る。ただし★健康記録の中身は返らない」');
say('      ＝氏名まで禁止にすると「名簿を見て入力する」作業が成立しないため、');
say('      「氏名は渡す／健康記録（体調・出欠・欠席理由）は渡さない」に検査を作り直した');
say('   2) 生徒×submit : 「拒否される・シート無傷」→「通る。★記録が1行増える。');
say('      名簿は変わらない。★audit に role=student で残る（誰が入力したか追える）」');
say('');
say(' ★反転させなかったもの（穴の本体なので対照版で必ずFAILが出るべき）:');
say('   ・無認証で5アクション全部が拒否されること');
say('   ・無認証で氏名が返らないこと');
say('   ・無認証で submit が書けないこと');
say('   ・0件での名簿上書きが拒否されること（refuseWipe）');
say('============================================================');

failures = 0;
runSuite(GUARDED, '本命：番人を入れた版');
const guardedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：番人が無い版で、同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(UNGUARDED, '負の対照：番人なし（貼る前の版）');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（番人あり）    : FAIL ${guardedFailures} 件  → 0 でなければならない`);
say(` 負の対照（番人なし）: FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = guardedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
// ★v1 の結果（result_a472_20260910.txt）は上書きせずに残す（設計変更の前後を比べるため）
fs.writeFileSync(path.join(__dirname, 'result_a472_20260910_v2.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
