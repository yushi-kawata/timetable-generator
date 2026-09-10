// ============================================================================
// A4-41 dxUrl の行き先を you-net-dx.jp に限定した件 ローカル実測（2026-09-09）
// ============================================================================
// 何が問題だったか:
//   dxCheckIn は younetDX にログインし、そのログイン済み cookie を付けて
//   dxUrl へ通信していた。dxUrl は QRの窓口（別プロジェクト・認証なし）から
//   降りてくる値なので、差し替えられると
//   【生徒のログイン済み cookie が他所へ送られる】。
//   番人はこれを止められない（叩いているのは本物の生徒だから）。
//
// 測ること
//   1. 正しいURLは通る（今までどおり登校できる）
//   2. ★通ってはいけないURLを全部拒否し、そのとき younetDX への通信が0回
//      ＝cookie がどこにも出ていない
//   3. ★転送（リダイレクト）を辿る途中で他所へ飛ばされても、そこで止まる
//   4. 転送が you-net-dx.jp の中なら今までどおり辿る（正常系を壊さない）
//   5. audit に攻撃者のURLをそのまま残さない
//   6. ★負の対照＝行き先の確認を入れる前の版では 2・3 が FAIL すること
//
// ★本番URLは叩かない。生徒の実データは一切使わない（すべて架空）。
// 使い方: node tmp_verify/test_a441_dxurl.cjs
// ============================================================================
const fs = require('fs');
const path = require('path');

const FIXED   = 'gas-script.本番_A4-41_番人入り_20260908.js';
const CONTROL = 'tmp_verify/control_a441_nohostcheck_20260909.js';  // 行き先の確認を入れる直前

const GOOD_URL = 'https://you-net-dx.jp/yushi/student/pages/attend.php?type=0&studio_id=3';

const HEADERS = ['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password'];
const ROSTER = [HEADERS,
  ['架空四郎', '3', '通常', '', '', '', '○', '', 's26100004@yushi-kokusai.jp', 'pw-SHIRO'],
];
const TOKENS = {
  'TOK-STUDENT': { code: 200, body: { users: [{ email: 's26100004@yushi-kokusai.jp', emailVerified: true }] } },
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
 * opts.routes: { '<url>': { code, location, body } } で応答を作り込む
 */
function loadGas(file, opts) {
  opts = opts || {};
  const routes = opts.routes || {};
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

  // ★すべての外向き通信を記録する。これが本試験の目盛り
  const calls = [];

  // 偽サーバ側でも Location を絶対URLに直す（本物と同じ扱いにするため）
  function resolveLoc(base, loc) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(loc)) return loc;
    const m = /^([a-z]+:\/\/[^/?#]+)/i.exec(base);
    const origin = m ? m[1] : '';
    if (loc.charAt(0) === '/') return origin + loc;
    const p = base.replace(/[?#].*$/, '');
    return p.slice(0, p.lastIndexOf('/') + 1) + loc;
  }

  function respond(r) {
    if (!r) {
      // 既定＝200で student_id を含むページ
      return {
        getResponseCode: () => 200,
        getContentText: () => '<input name="student_id" value="777" />',
        getAllHeaders: () => ({ 'Set-Cookie': 'PHPSESSID=SECRET-SESSION; path=/' }),
      };
    }
    return {
      getResponseCode: () => r.code,
      getContentText: () => (r.body === undefined ? '' : r.body),
      getAllHeaders: () => {
        const h = { 'Set-Cookie': 'PHPSESSID=SECRET-SESSION; path=/' };
        if (r.location) h['Location'] = r.location;
        return h;
      },
    };
  }

  function doFetch(u, params, depth) {
    const cookie = (params.headers && params.headers.Cookie) ? String(params.headers.Cookie) : '';
    calls.push({ url: u, cookie: cookie, method: params.method || 'get', payload: params.payload || null });
    const r = routes[u];
    // ★UrlFetchApp の followRedirects: true を真似る。
    //   本物は【同じヘッダ（Cookie を含む）を持ったまま】転送先へ行く。
    //   これを真似ないと、負の対照で漏れが再現できず、試験が甘くなる。
    const isRedirect = r && r.location && r.code >= 300 && r.code < 400;
    if (isRedirect && params.followRedirects !== false && depth < 5) {
      return doFetch(resolveLoc(u, r.location), params, depth + 1);
    }
    return respond(r);
  }

  global.UrlFetchApp = {
    fetch: (url, params) => {
      params = params || {};
      const u = String(url);
      if (u.indexOf('identitytoolkit.googleapis.com') !== -1) {
        const tok = JSON.parse(params.payload).idToken;
        const hit = TOKENS[tok] || { code: 400, body: { error: { message: 'INVALID_ID_TOKEN' } } };
        return { getResponseCode: () => hit.code, getContentText: () => JSON.stringify(hit.body) };
      }
      return doFetch(u, params, 0);
    },
  };

  // eval を使う理由: Apps Script のコードは module の仕組みを持たず require では読めない。
  // 読むのは同じリポジトリ内の自分たちのファイルだけ（既存 test_a441_guard.cjs と同じ方式）。
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const api = eval(code + '\n;({ doGet: doGet, doPost: doPost });');
  return { doPost: api.doPost, sheets, calls };
}

function post(api, body) { return api.doPost({ postData: { contents: JSON.stringify(body) } }); }
// younetDX 以外へ出た通信（＝漏れ）
// ★スキームとホストだけ小文字にそろえて判定する（HTTPS://YOU-NET-DX.JP/ は漏れではない）。
//   http:// は m が一致しないので漏れ扱い＝cookie を平文で流すのは漏れ、で正しい。
function leaks(calls) {
  return calls.filter(c => {
    const m = /^https:\/\/([^\/?#]*)/i.exec(c.url);
    return !m || m[1].toLowerCase() !== 'you-net-dx.jp';
  });
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
const BAD_URLS = [
  ['https://evil.example/',                        'まったく別のサイト'],
  ['https://you-net-dx.jp.evil.example/',          '★前方一致で騙す形'],
  ['https://evil.example/?x=you-net-dx.jp',        '★文字列に含めて騙す形'],
  ['https://you-net-dx.jp@evil.example/',          '★user@host で騙す形'],
  ['https://sub.you-net-dx.jp/x',                  'サブドメイン（完全一致でない）'],
  ['http://you-net-dx.jp/x',                       '★https でない（cookieが平文）'],
  ['HTTP://YOU-NET-DX.JP/x',                       '★https でない（大文字でも拒否）'],
  ['//you-net-dx.jp/x',                            'スキームなし'],
  ['javascript:alert(1)',                          'javascript:'],
  ['',                                             '空'],
];

// ★2026-09-09 に緩めた分。スキームとホストの大文字は通す
//   （比べるときだけ小文字にそろえる。抜け道は増えない）
const GOOD_URLS = [
  [GOOD_URL,                                                       'いつもの形'],
  ['HTTPS://YOU-NET-DX.JP/yushi/student/pages/attend.php?type=0',  '全部大文字のスキームとホスト'],
  ['Https://You-Net-Dx.JP/yushi/student/pages/attend.php?type=0',  '混じり'],
];

function runSuite(file, label) {
  say(`\n############ ${label} （${file}） ############`);

  // === 試験1: 正しいURLは通る ===
  say('\n--- 1. 正しいURL（いつもの登校QR）は通る ---');
  {
    const api = loadGas(file);
    const sent = { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: GOOD_URL };
    const got = String(post(api, sent));
    say('  送ったもの: ' + JSON.stringify(sent));
    say('  返ったもの: ' + got);
    say('  出ていった通信: ' + api.calls.map(c => c.method + ' ' + c.url).join('  /  '));
    check('★登校できる（今までどおり）', got.indexOf('"ok":true') !== -1, got.slice(0, 80));
    check('★younetDX 以外へは1回も出ていない', leaks(api.calls).length === 0,
      leaks(api.calls).map(c => c.url).join(', '));
  }

  // === 試験1b: ★スキームとホストの大文字は通る（2026-09-09 に緩めた分）===
  say('\n--- 1b. ★スキームとホストが大文字でも通る ---');
  for (const [url, why] of GOOD_URLS) {
    const api = loadGas(file);
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: url }));
    const passed = got.indexOf('"ok":true') !== -1;
    const noLeak = leaks(api.calls).length === 0;
    if (!passed || !noLeak) failures++;
    say(`  ${passed && noLeak ? 'PASS' : '**FAIL**'}  ${url.padEnd(62)} ${why}`);
    say(`         返り: ${got.slice(0, 60)}   younetDX以外への通信: ${leaks(api.calls).length}回`);
  }

  // === 試験1c: ★パスとクエリが原形のまま送られること（小文字化の漏れが無いか）===
  say('\n--- 1c. ★パスとクエリを小文字にしていないこと（原形のまま送る）---');
  {
    // 大文字を含むパスとクエリ。★これが小文字になったら younetDX 側で壊れる
    const mixed = 'https://you-net-dx.jp/yushi/Student/Pages/Attend.php?Type=1&Studio_ID=3&Token=AbCdEf';
    const api = loadGas(file);
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: mixed }));
    const sentUrls = api.calls.filter(c => c.url.indexOf('Attend.php') !== -1).map(c => c.url);
    say('  送ったもの: ' + mixed);
    say('  younetDX へ実際に出たURL:');
    sentUrls.forEach(u => say('    ' + u));
    check('通る', got.indexOf('"ok":true') !== -1, got.slice(0, 60));
    check('★パスとクエリが原形のまま（1文字も小文字にしていない）',
      sentUrls.length > 0 && sentUrls.every(u => u === mixed),
      sentUrls.join(' / '));
  }
  {
    // ★大文字の TYPE=1（下校）を読み違えないこと
    const upper = 'HTTPS://YOU-NET-DX.JP/yushi/student/pages/attend.php?TYPE=1&STUDIO_ID=3';
    const api = loadGas(file);
    post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: upper });
    const submit = api.calls.filter(c => c.method === 'post' && c.url.indexOf('attend.php') !== -1)[0];
    say('  送ったもの: ' + upper + '（TYPE=1 ＝下校）');
    say('  younetDX へ送った中身: ' + (submit ? JSON.stringify(submit.payload) : '(POSTなし)'));
    check('★大文字の TYPE=1 を「下校」として読めている（既定の 0＝登校 に落ちない）',
      !!submit && submit.payload && String(submit.payload.type) === '1',
      submit && submit.payload ? 'type=' + submit.payload.type : '(POSTなし)');
    check('★大文字の STUDIO_ID=3 も読めている',
      !!submit && submit.payload && String(submit.payload.studio_id) === '3',
      submit && submit.payload ? 'studio_id=' + submit.payload.studio_id : '(POSTなし)');
  }

  // === 試験2: ★通ってはいけないURL ===
  say('\n--- 2. ★通ってはいけないURL（cookie がどこにも出ないこと）---');
  for (const [url, why] of BAD_URLS) {
    const api = loadGas(file);
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: url }));
    const outbound = api.calls.length;
    const leaked = leaks(api.calls);
    const denied = got.indexOf('"ok":false') !== -1;
    const ok = denied && outbound === 0;
    if (!ok) failures++;
    say(`  ${ok ? 'PASS' : '**FAIL**'}  ${String(url || '(空)').padEnd(40)} ${why}`);
    say(`         返り: ${got.slice(0, 70)}   younetDXへの通信: ${outbound}回`
        + (leaked.length ? `   ★漏れ: ${leaked.map(c => c.url).join(', ')}` : ''));
  }

  // === 試験3: ★転送で他所へ飛ばされる（オープンリダイレクト）===
  say('\n--- 3. ★許可ホストが他所へ転送してくる場合 ---');
  {
    const trap = 'https://you-net-dx.jp/redirect.php?to=evil';
    const api = loadGas(file, {
      routes: {
        [trap]: { code: 302, location: 'https://evil.example/steal' },
      },
    });
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: trap }));
    const leaked = leaks(api.calls);
    say('  送ったもの: dxUrl=' + trap + '（先方が evil.example へ転送してくる）');
    say('  返ったもの: ' + got);
    say('  出ていった通信: ' + api.calls.map(c => c.method + ' ' + c.url).join('  /  '));
    check('★転送先へ cookie を送っていない', leaked.length === 0,
      leaked.map(c => c.url + ' (cookie=' + c.cookie + ')').join(', '));
    check('★止まって失敗を返す', got.indexOf('"ok":false') !== -1, got.slice(0, 80));
  }

  // === 試験4: 転送が younetDX の中なら今までどおり辿る（正常系）===
  say('\n--- 4. 転送が younetDX の中なら辿る（正常系を壊していないこと）---');
  {
    const first = 'https://you-net-dx.jp/yushi/student/pages/attend.php?type=0&studio_id=3';
    const api = loadGas(file, {
      routes: {
        [first]: { code: 302, location: '/yushi/student/pages/attend2.php' },
        // 転送先は既定の応答（student_id を含む200）
      },
    });
    const got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: first }));
    say('  返ったもの: ' + got);
    say('  出ていった通信: ' + api.calls.map(c => c.method + ' ' + c.url).join('  /  '));
    const followed = api.calls.some(c => c.url === 'https://you-net-dx.jp/yushi/student/pages/attend2.php');
    check('★ルート相対の転送を辿れている', followed,
      api.calls.map(c => c.url).join(', '));
    check('★登校できる', got.indexOf('"ok":true') !== -1, got.slice(0, 80));
    check('younetDX 以外へは出ていない', leaks(api.calls).length === 0);
  }

  // === 試験5: 転送のループ ===
  say('\n--- 5. 転送がぐるぐる回る場合（止まること）---');
  {
    const a = 'https://you-net-dx.jp/a';
    const b = 'https://you-net-dx.jp/b';
    const api = loadGas(file, {
      routes: { [a]: { code: 302, location: b }, [b]: { code: 302, location: a } },
    });
    let threw = false;
    let got = '';
    const t0 = Date.now();
    try { got = String(post(api, { action: 'dxCheckIn', idToken: 'TOK-STUDENT', dxUrl: a })); }
    catch (e) { threw = true; got = '(例外) ' + e.message; }
    say('  返ったもの: ' + got + '   通信回数: ' + api.calls.length + '回');
    check('★無限に回らずに止まる', !threw && Date.now() - t0 < 5000, got.slice(0, 70));
    check('★通信回数が上限で打ち切られる', api.calls.length <= 12, api.calls.length + '回');
  }

  // === 試験6: audit に攻撃者のURLを残さない ===
  say('\n--- 6. 記録（audit）に攻撃者のURLをそのまま残さないこと ---');
  {
    const api = loadGas(file);
    post(api, {
      action: 'dxCheckIn', idToken: 'TOK-STUDENT',
      dxUrl: 'https://evil.example/steal?cookie=1&token=SECRET',
    });
    const rows = api.sheets['audit'] ? api.sheets['audit']._rows().slice(1) : [];
    const notes = rows.map(r => String(r[4] || '')).join(' ');
    say('  audit の中身: ' + (rows.length ? rows.map(r => r.join('|')).join(' / ') : '(なし)'));
    check('拒否が記録される', rows.length >= 1, rows.length + '行');
    check('★URL全体（クエリつき）が残っていない', notes.indexOf('steal?cookie=1') === -1, notes);
    check('★SECRET のような中身が残っていない', notes.indexOf('SECRET') === -1, notes);
    check('★どこへ行こうとしたかは分かる（ホスト名）', notes.indexOf('evil.example') !== -1, notes);
  }
}

say('============================================================');
say(' A4-41 dxUrl の行き先の限定 実測  ' + new Date().toISOString());
say('============================================================');

failures = 0;
runSuite(FIXED, '本命：行き先を確認する版');
const fixedFailures = failures;

say('\n\n============================================================');
say(' ★負の対照：行き先の確認を入れる前の版で同じ試験が FAIL すること');
say(' （ここが全部 PASS になるなら、試験は何も検査していない）');
say('============================================================');
failures = 0;
runSuite(CONTROL, '負の対照：行き先を確認しない版（dxUrl 素通し）');
const controlFailures = failures;

say('\n============================================================');
say(` 本命（確認あり）      : FAIL ${fixedFailures} 件  → 0 でなければならない`);
say(` 負の対照（確認なし）  : FAIL ${controlFailures} 件  → 0 なら試験が壊れている`);
say('============================================================');

const ok = fixedFailures === 0 && controlFailures > 0;
say(ok ? '\n=== 総合: PASS ===' : '\n=== 総合: FAIL ===');

// ★コンソールが cp932 で化けるので、結果は UTF-8 のファイルにも残す
fs.writeFileSync(path.join(__dirname, 'result_dxurl_20260909.txt'), lines.join('\n'), 'utf8');
process.exit(ok ? 0 : 1);
