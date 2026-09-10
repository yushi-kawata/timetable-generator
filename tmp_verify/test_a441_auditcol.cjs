// ============================================================================
// A4-41 audit シートへの role 列追加 ローカル実測（2026-09-09）
// ============================================================================
// ★前提: このGASは 2026-09-09 12:42 に本番へ貼られて【すでに動いている】。
//   audit シートは【5列の見出しで実データが入っている】。
//   そこへ後から6列目 role を足すので、いちばん危ないのは
//   「見出しが5列のまま、6列目にだけ値が入る」状態。
//
// 測ること（3つのシート状態）
//   A. シートが存在しない（初回）        → 6列の見出しで作られる
//   B. ★見出しが5列で実データが入っている → role の見出しが追記され、以降の行に値が入る
//   C. 見出しがすでに6列                  → 二重に足さない
//   さらに
//   D. ★既存の行が1マスも書き換わらない
//   E. ★audit 以外のシートに触らない
//   F. ★記録に失敗しても本体の処理が止まらない（try が生きている）
//   G. ★負の対照＝role 列を足す前のファイルでは A・B・C が FAIL すること
//
// ★本番URLは叩かない。生徒の実データは一切使わない（すべて架空）。
// 使い方: node tmp_verify/test_a441_auditcol.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const FIXED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const CONTROL = 'tmp_verify/control_a441_norolecol_20260909.js';  // role 列を足す直前の版

// ---------------------------------------------------------------------------
// 偽の Sheet。★この試験では getRange を本物に近づける
//   （行・列を指定して1マスだけ書ける。でないと見出しの追記を測れない）
// ---------------------------------------------------------------------------
function makeSheet(name, rows) {
  let data = rows.map(r => r.slice());
  const touch = { read: 0, write: 0 };

  function ensure(r, c) {                       // r,c は1始まり
    while (data.length < r) data.push([]);
    const row = data[r - 1];
    while (row.length < c) row.push('');
  }

  const sheet = {
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
    // ★本物に近い getRange(row, col) / getRange(row, col, numRows, numCols)
    getRange: (row, col, numRows, numCols) => {
      const nr = numRows || 1;
      const nc = numCols || 1;
      return {
        setValue: (v) => {
          touch.write++;
          ensure(row, col);
          data[row - 1][col - 1] = v;
        },
        getValues: () => {
          touch.read++;
          const out = [];
          for (let r = row; r < row + nr; r++) {
            const src = data[r - 1] || [];
            const line = [];
            for (let c = col; c < col + nc; c++) line.push(src[c - 1] === undefined ? '' : src[c - 1]);
            out.push(line);
          }
          return out;
        },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
      };
    },
  };
  return sheet;
}

const HEADERS5 = ['timestamp', 'email', 'action', 'ok', 'note'];
const HEADERS6 = ['timestamp', 'email', 'action', 'ok', 'note', 'role'];
// ★本番に入っている「今日の分」に相当する既存データ（架空）
const EXISTING5 = [
  HEADERS5.slice(),
  ['2026-09-09T03:42:01.000Z', 's-hisho09@yushi-kokusai.jp',   'saveStudents', 'ok', '[staff] 12件 → 12件'],
  ['2026-09-09T03:55:10.000Z', 's26100004@yushi-kokusai.jp',  'dxCheckIn',    'ok', '[student] code=200'],
  ['2026-09-09T04:01:33.000Z', 's26100004@yushi-kokusai.jp',  'getStudents',  'ng', '[student] denied:staffOnly'],
];

const ROSTER = [
  ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'],
  ['架空四郎', '3', '通常', '', '', '', '○', '', 's26100004@yushi-kokusai.jp', 'pw-SHIRO'],
];

const TOKENS = {
  'TOK-STUDENT': { code: 200, body: { users: [{ email: 's26100004@yushi-kokusai.jp', emailVerified: true }] } },
  'TOK-STAFF':   { code: 200, body: { users: [{ email: 's-hisho09@yushi-kokusai.jp', emailVerified: true }] } },
};

/**
 * auditState: 'none'（シート無し） / 'five'（5列で実データあり） / 'six'（すでに6列）
 */
function loadGas(file, auditState, opts) {
  opts = opts || {};
  const sheets = {
    records: makeSheet('records', [['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp']]),
    timetable: makeSheet('timetable', [['data']]),
    students: makeSheet('students', ROSTER),
    attendance: makeSheet('attendance', [['date', 'name', 'grade', 'checkinTime', 'checkoutTime']]),
    period2: makeSheet('period2', [['week', 'name', '月', '火', '水', '木', '金']]),
  };
  if (auditState === 'five') sheets.audit = makeSheet('audit', EXISTING5);
  if (auditState === 'six') {
    sheets.audit = makeSheet('audit', [HEADERS6.slice(),
      ['2026-09-09T05:00:00.000Z', 's-hisho09@yushi-kokusai.jp', 'saveTT', 'ok', '[staff] ', 'staff']]);
  }
  const created = [];

  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => { created.push(n); sheets[n] = makeSheet(n, []); return sheets[n]; },
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
  global.UrlFetchApp = {
    fetch: (url, params) => {
      params = params || {};
      if (String(url).indexOf('identitytoolkit.googleapis.com') !== -1) {
        const tok = JSON.parse(params.payload).idToken;
        const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
        return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => '<input name="student_id" value="777" />',
        getAllHeaders: () => ({ 'Set-Cookie': 'PHPSESSID=x; path=/' }),
      };
    },
  };

  // ★F の試験用: audit シートだけ壊して、本体が止まらないことを見る
  if (opts.breakAudit && sheets.audit) {
    sheets.audit.appendRow = () => { throw new Error('audit が書けない状況'); };
    sheets.audit.getRange = () => { throw new Error('audit が書けない状況'); };
  }

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost });');
  return { doPost: api.doPost, sheets, created };
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
function showSheet(sheet) {
  const rows = sheet ? sheet._rows() : [];
  rows.forEach((r, i) => say(`    ${i === 0 ? '見出し' : '  ' + i + '行目'} | ${r.join(' | ')}`));
  if (!rows.length) say('    (空)');
}

// ---------------------------------------------------------------------------
function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  // === A. シートが存在しない（初回）===
  say('\n--- A. audit シートが存在しない（初回）---');
  {
    const api = loadGas(file, 'none');
    post(api, { action: 'saveTT', idToken: 'TOK-STAFF', data: { x: 1 } });
    const a = api.sheets.audit;
    showSheet(a);
    const rows = a ? a._rows() : [];
    check('audit が作られる', !!a);
    check('★見出しが6列（role 入り）',
      rows[0] && rows[0].length === 6 && rows[0][5] === 'role',
      rows[0] ? rows[0].join(',') : '(なし)');
    check('記録が1行入る', rows.length === 2, (rows.length - 1) + '行');
    check('role 列に staff が入る', rows[1] && rows[1][5] === 'staff', rows[1] ? String(rows[1][5]) : '(なし)');
    check('note の頭の [staff] は残っている',
      rows[1] && String(rows[1][4]).indexOf('[staff]') === 0, rows[1] ? String(rows[1][4]) : '(なし)');
  }

  // === B. ★見出しが5列で、すでに実データが入っている（＝いまの本番）===
  say('\n--- B. ★見出しが5列・実データあり（いまの本番の状態）---');
  {
    const api = loadGas(file, 'five');
    const before = JSON.stringify(api.sheets.audit._rows());
    say('  【貼る前】');
    showSheet(api.sheets.audit);

    post(api, { action: 'saveTT', idToken: 'TOK-STAFF', data: { x: 1 } });
    post(api, { action: 'getStudents', idToken: 'TOK-STUDENT' });   // 生徒→拒否も記録される

    say('  【1回動かしたあと】');
    showSheet(api.sheets.audit);
    const rows = api.sheets.audit._rows();

    check('★見出しの6列目に role が足された',
      rows[0] && rows[0][5] === 'role', rows[0] ? rows[0].join(',') : '(なし)');
    check('★見出しの1〜5列目は元のまま',
      rows[0] && HEADERS5.every((h, i) => rows[0][i] === h), rows[0] ? rows[0].slice(0, 5).join(',') : '');

    // ★既存の行が1マスも変わっていないこと
    const beforeRows = JSON.parse(before);
    let sameAll = true;
    for (let i = 1; i < beforeRows.length; i++) {
      if (JSON.stringify(rows[i]) !== JSON.stringify(beforeRows[i])) sameAll = false;
    }
    check('★既存の3行が1マスも書き換わっていない', sameAll,
      sameAll ? '' : JSON.stringify(rows.slice(1, beforeRows.length)));
    check('★既存の行の role 欄は空のまま（過去は [student] で読める）',
      rows[1] && rows[1].length === 5, rows[1] ? rows[1].length + '列' : '');

    // 新しい行
    const added = rows.slice(beforeRows.length);
    check('新しい行が2行足された', added.length === 2, added.length + '行');
    check('★新しい行の role 列に staff / student が入る',
      added.length === 2 && added[0][5] === 'staff' && added[1][5] === 'student',
      added.map(r => String(r[5])).join(','));
    check('★note の頭の [staff] / [student] は残っている',
      added.length === 2 && String(added[0][4]).indexOf('[staff]') === 0
        && String(added[1][4]).indexOf('[student]') === 0,
      added.map(r => String(r[4])).join(' / '));
    check('★role 列に括弧は付かない',
      added.every(r => String(r[5]).indexOf('[') === -1), added.map(r => String(r[5])).join(','));
    check('★note にメールアドレスが入っていない',
      added.every(r => String(r[4]).indexOf('@') === -1), added.map(r => String(r[4])).join(' / '));
    check('★note に生徒の氏名が入っていない',
      added.every(r => String(r[4]).indexOf('架空') === -1));

    // ★audit 以外のシートに触っていないこと（saveTT は timetable を書くので除く）
    const others = ['students', 'attendance', 'period2', 'records'];
    const touched = others.filter(n => api.sheets[n]._touch.write > 0);
    check('★audit 以外の台帳を書き換えていない', touched.length === 0, '書いたシート: ' + touched.join(', '));
  }

  // === C. すでに6列 → 二重に足さない ===
  say('\n--- C. 見出しがすでに6列（2回目以降）---');
  {
    const api = loadGas(file, 'six');
    const headerWritesBefore = api.sheets.audit._touch.write;
    post(api, { action: 'saveTT', idToken: 'TOK-STAFF', data: { x: 1 } });
    post(api, { action: 'saveTT', idToken: 'TOK-STAFF', data: { x: 2 } });
    const rows = api.sheets.audit._rows();
    showSheet(api.sheets.audit);
    check('★見出しは6列のまま（7列目に増えていない）',
      rows[0].length === 6, rows[0].length + '列');
    check('★role の見出しが二重に入っていない',
      rows[0].filter(h => String(h) === 'role').length === 1,
      rows[0].join(','));
    check('書き込み回数は追記2回だけ（見出しを書き直していない）',
      api.sheets.audit._touch.write - headerWritesBefore === 2,
      (api.sheets.audit._touch.write - headerWritesBefore) + '回');
  }

  // === D. 生徒の打刻が、記録の失敗で落ちないこと ===
  say('\n--- F. ★audit が書けない状況でも本体が止まらないこと ---');
  {
    const api = loadGas(file, 'five', { breakAudit: true });
    let got = '(例外で落ちた)';
    let threw = false;
    try {
      got = String(post(api, {
        action: 'dxCheckIn', idToken: 'TOK-STUDENT',
        dxUrl: 'https://you-net-dx.jp/x?type=0&studio_id=3',
      }));
    } catch (e) { threw = true; got = '(例外) ' + e.message; }
    say('  返ったもの: ' + got);
    check('★例外で落ちない', !threw);
    check('★生徒の打刻はちゃんと成功する', got.indexOf('"ok":true') !== -1, got.slice(0, 80));
  }
}

say('============================================================');
say(' A4-41 audit への role 列追加 実測  ' + new Date().toISOString());
say('============================================================');

failures = 0;
runSuite(FIXED, '本命：role 列あり');
const fixedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：role 列を足す前の版で同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(CONTROL, '負の対照：role 列なし（note の [student] だけの版）');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（role 列あり）    : FAIL ${fixedFailures} 件  → 0 でなければならない`);
say(` 負の対照（role 列なし）: FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = fixedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_auditcol_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
