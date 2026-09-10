// ============================================================================
// A4-41 自己診断 TTG_番人_自己診断 のローカル実測（2026-09-09）
// ============================================================================
// 社長が Apps Script のエディタで実行するのはこの関数。
// だから「何が表示されるか」を貼る前に実物で見ておく。
//
// 測ること
//   1. getMe が入っていることを検出できるか
//   2. authStudent のパスワード比較が残っていないことを検出できるか
//   3. dxCheckIn が残っていることを検出できるか
//   4. ★シートを1回も書き換えていないこと（読むだけ）
//   5. ★名簿の dx_email が学校ドメインでないときに「締め出される人数」を出せるか
//   6. ★負の対照＝古い版（パスワード比較が残っている版）では 2 が NG と出ること
//
// ★生徒の実データは一切使わない。すべて架空の値。
// 使い方: node tmp_verify/test_a441_selfcheck.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const TARGET = 'gas-script.本番_A4-41_番人入り_20260908.js';
const OLD    = 'gas-script.本番_修正版_20260902.js';   // 負の対照（getMe が無い版）

const HEADERS = ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'];

// 名簿の3パターン
const ROSTER_GOOD = [HEADERS,
  ['架空太郎', '1', '通常', '○', '', '', '', '', 's26100001@yushi-kokusai.jp', 'pw-AAA'],
  ['架空花子', '2', '通常', '', '○', '', '', '', 's26100002@yushi-kokusai.jp', 'pw-BBB'],
];
// ★いまの本番はこちらの可能性が高い（dx_email が younetDX 用の別アドレス）
const ROSTER_BAD = [HEADERS,
  ['架空太郎', '1', '通常', '○', '', '', '', '', 'taro@dx.example', 'pw-AAA'],
  ['架空花子', '2', '通常', '', '○', '', '', '', 'hanako@dx.example', 'pw-BBB'],
  ['架空次郎', '1', '通常', '', '', '○', '', '', '', ''],
];
const ROSTER_MIXED = [HEADERS,
  ['架空太郎', '1', '通常', '○', '', '', '', '', 's26100001@yushi-kokusai.jp', 'pw-AAA'],
  ['架空花子', '2', '通常', '', '○', '', '', '', 'hanako@dx.example', 'pw-BBB'],
  ['架空次郎', '1', '通常', '', '', '○', '', '', '', ''],
  ['架空四郎', '3', '通常', '', '', '', '○', '', 'S26100001@Yushi-Kokusai.JP', 'pw-DDD'],  // 重複
];

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

function runDiag(file, roster, opts) {
  opts = opts || {};
  const sheets = {
    records: makeSheet('records', [['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp']]),
    timetable: makeSheet('timetable', [['data']]),
    students: makeSheet('students', roster),
    attendance: makeSheet('attendance', [['date', 'name', 'grade', 'checkinTime', 'checkoutTime']]),
    period2: makeSheet('period2', [['week', 'name', '月', '火', '水', '木', '金']]),
  };
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
  };
  const logged = [];
  global.Logger = { log: (s) => logged.push(String(s)) };
  global.UrlFetchApp = {
    // ★診断は外に出ない。出ようとしたら失敗させて気づけるようにする
    fetch: () => { throw new Error('診断が外部に問い合わせようとしました'); },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  // opts.source があればそれを使う（＝検査装置そのものを試すため）
  const code = opts.source || fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  let out = '';
  let err = null;
  try {
    const fn = eval(code + '\n;(typeof TTG_番人_自己診断 === "function" ? TTG_番人_自己診断 : null);');
    out = fn ? String(fn()) : '(自己診断の関数がありません)';
  } catch (e) {
    err = e;
    out = '(例外) ' + e.message;
  }
  const writes = Object.keys(sheets).reduce((n, k) => n + sheets[k]._touch.write, 0);
  return { out: out, writes: writes, created: created, err: err, logged: logged };
}

let failures = 0;
const lines = [];
function say(s) { lines.push(s); console.log(s); }
function check(label, cond, detail) {
  if (!cond) failures++;
  say(`  ${cond ? 'PASS' : '**FAIL**'}  ${label}${detail ? '  … ' + detail : ''}`);
}

say('============================================================');
say(' A4-41 自己診断のローカル実測  ' + new Date().toISOString());
say('============================================================');

// --- 1. 名簿が正しい（dx_email が学校ドメイン）とき ---
say('\n########## 本命：名簿の dx_email が学校ドメインのとき ##########');
{
  const r = runDiag(TARGET, ROSTER_GOOD);
  say('\n--- 実際に表示される文面（そのまま） ---');
  say(r.out.split('\n').map(l => '  | ' + l).join('\n'));
  say('');
  check('例外なく最後まで走る', r.err === null, r.err ? r.err.message : '');
  check('★シートを1回も書き換えていない', r.writes === 0, 'write=' + r.writes);
  check('★audit シートも作らない', r.created.length === 0, '作られたシート: ' + r.created.join(', '));
  check('getMe: OK と出る', r.out.indexOf('getMe: OK') !== -1);
  check('authStudent のパスワード比較: OK と出る', r.out.indexOf('authStudent のパスワード比較: OK') !== -1);
  check('dxCheckIn: OK と出る', r.out.indexOf('dxCheckIn: OK') !== -1);
  check('★本文のメールを読んでいない: OK と出る（2026-09-09 追加）',
    r.out.indexOf('本文のメールを読んでいない: OK') !== -1);
  check('学校ドメイン2件と数える', r.out.indexOf('学校ドメイン(@yushi-kokusai.jp): 2件') !== -1);
  check('★全員締め出しの警告は出ない', r.out.indexOf('生徒全員') === -1);
  check('★生徒の氏名が出ていない', r.out.indexOf('架空') === -1);
  check('★メールアドレスが出ていない', r.out.indexOf('@dx.example') === -1 && r.out.indexOf('s26100001') === -1);
  check('★平文パスワードが出ていない', r.out.indexOf('pw-') === -1);
}

// --- 2. ★名簿の dx_email が younetDX 用の別アドレスのまま（全員締め出し）---
say('\n########## ★危険：名簿の dx_email が学校ドメインでないとき ##########');
{
  const r = runDiag(TARGET, ROSTER_BAD);
  say('\n--- 実際に表示される文面（そのまま） ---');
  say(r.out.split('\n').map(l => '  | ' + l).join('\n'));
  say('');
  check('★「生徒全員」が締め出される警告が出る', r.out.indexOf('【生徒全員】') !== -1);
  check('別ドメイン2件・空1件と数える',
    r.out.indexOf('dx_email が別ドメイン: 2件') !== -1 && r.out.indexOf('dx_email が空: 1件') !== -1);
  check('★シートを1回も書き換えていない', r.writes === 0, 'write=' + r.writes);
  check('★生徒の氏名・メールが出ていない',
    r.out.indexOf('架空') === -1 && r.out.indexOf('dx.example') === -1);
}

// --- 3. 混ざっているとき（重複も見つかるか）---
say('\n########## 混在（一部だけ学校ドメイン・重複あり）##########');
{
  const r = runDiag(TARGET, ROSTER_MIXED);
  say('\n--- 実際に表示される文面（そのまま） ---');
  say(r.out.split('\n').map(l => '  | ' + l).join('\n'));
  say('');
  check('学校ドメイン2件（大文字混じりも数える）', r.out.indexOf('学校ドメイン(@yushi-kokusai.jp): 2件') !== -1);
  check('★同じ dx_email の重複を見つける', r.out.indexOf('重複: 1件') !== -1);
  check('一部でも通るなら全員締め出しの警告は出ない', r.out.indexOf('【生徒全員】') === -1);
}

// --- 4. FIREBASE_API_KEY 未設定 ---
say('\n########## FIREBASE_API_KEY 未設定のとき ##########');
{
  const r = runDiag(TARGET, ROSTER_GOOD, { noApiKey: true });
  check('★未設定だと NG と出る', r.out.indexOf('FIREBASE_API_KEY: NG') !== -1,
    r.out.split('\n')[0]);
}

// --- 5. 負の対照：getMe が無い古い版 ---
say('\n########## ★負の対照：getMe が無い古い版（' + OLD + '）##########');
say(' （ここが全部 PASS になるなら、診断は何も検査していない）');
{
  const r = runDiag(OLD, ROSTER_GOOD);
  const detected =
    r.out.indexOf('(自己診断の関数がありません)') !== -1 ||
    r.out.indexOf('getMe: NG') !== -1;
  check('★古い版だと「入っていない」と分かる', detected, r.out.split('\n').slice(0, 3).join(' / '));
}

// --- 6. ★検査装置そのものの検査 ---
//   新しい自己診断を【今日の修正前のコード】に向けたら、ちゃんと NG と言うか。
//   （自作の検査が「OK」しか言えない飾りになっていないかを見る）
//   作り方: 修正前ファイルの本体 ＋ normEmail_ ＋ 新しい自己診断 をつないだ物。
say('\n########## ★検査装置そのものの検査：新しい診断を「修正前のコード」に向ける ##########');
{
  const CONTROL_FILE = 'tmp_verify/control_a441_before_20260909.js';
  const oldSrc = fs.readFileSync(path.join(__dirname, '..', CONTROL_FILE), 'utf8');
  const newSrc = fs.readFileSync(path.join(__dirname, '..', TARGET), 'utf8');
  const MARK = 'function TTG_番人_自己診断()';
  // 新しい自己診断が寄りかかっている道具（normEmail_ / classifyRole_ /
  // accessDenyReason_ / forbidden_ など）も一緒に持ってくる。
  // ★doPost は持ってこない。検査される側は【修正前の doPost】のままにする。
  const HELPER_MARK = '// 職員か生徒かの判定（2026-09-09 追加・A4-41）';
  if (oldSrc.indexOf(MARK) < 0 || newSrc.indexOf(HELPER_MARK) < 0) {
    throw new Error('目印が見つからない＝この試験自体が壊れている');
  }
  const oldBody = oldSrc.slice(0, oldSrc.indexOf(MARK));      // 修正前の doPost など
  const newTail = newSrc.slice(newSrc.indexOf(HELPER_MARK));  // 新しい道具＋新しい自己診断
  const hybrid = oldBody + '\n' + newTail;
  if (hybrid.indexOf('body.email') < 0) {
    throw new Error('修正前の doPost が入っていない＝この試験自体が壊れている');
  }

  const r = runDiag(null, ROSTER_GOOD, { source: hybrid });
  say('\n--- 新しい診断が「修正前のコード」に対して出す文面 ---');
  say(r.out.split('\n').map(l => '  | ' + l).join('\n'));
  say('');
  check('★修正前だと getMe: NG と言う', r.out.indexOf('getMe: NG') !== -1);
  check('★修正前だと パスワード比較: NG と言う',
    r.out.indexOf('authStudent のパスワード比較: NG') !== -1);
  check('★修正前だと「本文のメールを読んでいる: NG」と言う',
    r.out.indexOf('本文のメールを読んでいる: NG') !== -1);
  check('★このときもシートを書き換えない', r.writes === 0, 'write=' + r.writes);
}

say('\n============================================================');
say(` FAIL ${failures} 件  → 0 でなければならない`);
say('============================================================');
say(failures === 0 ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_selfcheck_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(failures === 0 ? 0 : 1);
