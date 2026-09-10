// ============================================================================
// 健康観察（保健）の裏側プログラム ─ 番人入り（2026-09-10）／台帳 A4-72
// ============================================================================
//
// ★★ 気をつけること（先に読んでください）★★
//
//  1. ★貼るのは【保健（健康観察）のプロジェクト】です。
//     時間割ツール本体のGAS（records / students / audit のあるプロジェクト）ではありません。
//     間違えて本体に貼ると、本体の番人ごと消えて生徒名簿が無認証で出ます。
//     ★貼ったあと HC_番人_自己診断 を実行すると「貼る場所の間違い」を検出します。
//
//  2. ★これを貼った瞬間、いまの健康観察の画面は全部弾かれます。
//     新しい画面（Googleログインでトークンを送る版）が配り終わるまで使えません。
//     ＝順番は ①シートの共有を「制限付き」に（A4-79）→ ②このGASを貼る → ③画面を配る。
//
//  3. ★デプロイの「アクセスできるユーザー」は【全員】のままにしてください。
//     「自分のみ」にするとブラウザからの呼び出しが通らず、画面が完全に死にます。
//     このプログラムは「全員が叩ける入口で、中身で弾く」作りです（社長決裁＝A案・A4-41と同じ）。
//
//  4. ★「新しいデプロイ」を押さないでください。既存のデプロイを【編集】して
//     「新バージョン」にしてください。新規にするとURLが変わり、
//     古いURL（＝無認証のまま）が生き残ります。
//
//  5. ★スクリプト プロパティに FIREBASE_API_KEY を入れないと、
//     すべての操作が拒否されます（＝安全側に倒れます。データは漏れません）。
//
//  6. ★既存のシート（名簿 / 記録）の列は一切触っていません。
//     増えるのは新しい1枚 audit（操作の記録）だけです。
//
//  7. ★このプログラムだけではシート本体は守れません。
//     スプレッドシートの共有設定が「リンクを知っている全員」のままなら、
//     窓口を塞いでも中身は直接開けます（A4-79）。共有設定を「制限付き」にするのが先です。
//
// ----------------------------------------------------------------------------
// この版で入れたこと
// ----------------------------------------------------------------------------
//  A. 入口の番人（Firebase の IDトークン検証）── A4-41 と同じ作り
//     ・Firebase プロジェクト = yushi-meta
//     ・通すのは @yushi-kokusai.jp のアカウントで、かつメール確認済みのものだけ
//     ・トークンが無い／壊れている／期限切れ／ドメインが違う → 全部拒否（fail close）
//     ・5アクション全部（読み取り3＋書き込み2）が番人の後ろにあります
//     ・★トークンはURLに載せません。POSTの本文で受けます
//       （URLに載せると Apps Script の実行ログ・ブラウザ履歴・Referer に
//         1時間有効の資格情報が残るため）
//  B. ★人ではなく【操作】で分ける（2026-09-10 設計変更・社長決裁A案）
//     ・メールの @ より前の形で判定（A4-41 と同じ規則）。ハイフンを含む＝職員、
//       アルファベット1文字＋数字8桁＝生徒、それ以外＝拒否
//     ・**生徒（ログイン済み）に通す** ＝ roster（クラスの名簿を見る）／
//       submit（記録を入力する）★これが保健委員の作業そのもの
//     ・**職員だけ** ＝ allRoster／records／updateRoster
//       ★特に updateRoster は名簿を全消しできるので生徒には開けない
//     ・判定できないメールは従来どおり全アクション拒否（fail close）
//
//     ★なぜ「職員のみ」から変えたのか（同じ設計に戻さないための記録）:
//       当初は5アクション全部を職員のみにしていた。しかしこの窓口の穴の本体は
//       「★【無認証で誰でも】氏名25件・健康記録14件が取れる」ことであって、
//       閉じるのに必要なのは【ログイン必須】まで。「職員のみ」はそこから先の
//       追加制限で、それが【保健委員の生徒の入力を止めていた】（実運用あり）。
//       要る権限はアクションごとに違う＝submit・roster は保健委員の作業、
//       updateRoster は生徒に開ける理由がない。だから人ではなく操作で切る。
//  C. GET で届いた書き込み（submit / updateRoster）は拒否（CSRF対策）
//     ・書き込みは POST の本文でしか受けません（forbidden / postOnly）
//     ・旧版は doGet が無認証で、URLを踏ませるだけで名簿を消せました
//  D. 名簿の全消し止め
//     ・updateRoster は clearContents() で名簿を作り直す作りです。
//       中身が配列でなければ何もしない／既存があるのに0件で来たら拒否（refuseWipe）
//  E. 操作の記録（シート audit）
//     ・いつ・誰が（確かめ済みのメール）・何を。★生徒の氏名は書きません（件数だけ）
//  F. 例外のメッセージ（構成が読める）を外に返さない
//
// ----------------------------------------------------------------------------
// 貼る前にやること（スクリプト プロパティ）
// ----------------------------------------------------------------------------
//   Apps Script の左下「プロジェクトの設定」→「スクリプト プロパティ」
//     FIREBASE_API_KEY = （手順書「手順_保健窓口_番人移植_20260910_v1.md」の準備2）
//   （生徒ポータル・職員ポータル・時間割ツールと同じ yushi-meta のものです。
//     このキーは公開されても差し支えないもので、鍵ではありません。
//     本人の証明はトークンの署名で行っています）
// ============================================================================

// ★このIDは公開リポジトリに載っています（A4-79 の論点。ここでは触りません）。
//   窓口を塞いでも、シート本体の共有設定が開いていれば中身は見えます＝共有設定が先。
const SHEET_ID = '16AtoTfJxu5SYFGjKcBjXNz_ohB9DHX_2m37Je371PDk';

const SHEET_ROSTER  = '名簿';
const SHEET_RECORDS = '記録';
const SHEET_AUDIT   = 'audit';
const DAYS_ = ['月', '火', '水', '木', '金'];
const AUDIT_HEADERS_ = ['timestamp', 'email', 'action', 'ok', 'note', 'role'];

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

// 既存のシート（名簿 / 記録）。無ければ null。
// ★作りません。名前違い・ID違いを黙って隠すと、空のシートに書いて「保存できた」ことになるため。
function getSheet(name) {
  return ss_().getSheetByName(name);
}

// audit だけは無ければ作る（増えるのはこの1枚だけ）
function getOrCreateAuditSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(SHEET_AUDIT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_AUDIT);
    sheet.appendRow(AUDIT_HEADERS_);
  }
  return sheet;
}

// ============================================================================
// 入口
// ============================================================================
// 読み取り系（GET でも POST でも受ける。★画面は POST を使うこと）
var READ_ACTIONS_  = ['roster', 'records', 'allRoster'];
// 書き込み系（★POST の本文でしか受けない。GET で届いたら拒否＝CSRF対策）
var WRITE_ACTIONS_ = ['submit', 'updateRoster'];

// ----------------------------------------------------------------------------
// 職員だけが叩けるアクション（★2026-09-10 設計変更・社長決裁A案）
// ----------------------------------------------------------------------------
// ここに載っていないもの（roster / submit）は【ログイン済みの生徒も叩ける】。
// ＝保健委員の生徒が、クラスの名簿を見て健康観察を入力する作業。
// ★載せる基準は「生徒に開ける理由があるか」:
//   ・allRoster    … 全曜日の名簿の編集用データ。入力作業には要らない
//   ・records      … その日の記録の一覧（他人の体調・欠席理由が並ぶ）
//   ・updateRoster … 名簿の作り直し。★全消しができる。生徒に開ける理由がない
// ★ここに roster や submit を足さないこと（＝保健委員が入力できなくなる。
//   2026-09-10 に一度その設計にして手戻りになった）。
var STAFF_ONLY_ACTIONS_ = ['allRoster', 'records', 'updateRoster'];

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  return handle_('GET', params.action, params, params.idToken);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    // ★中身（スタックトレース等）は返さない。返すと構成が外から見える
    return json_({ ok: false, error: 'bad request' });
  }
  if (!body || typeof body !== 'object') return json_({ ok: false, error: 'bad request' });
  return handle_('POST', body.action, body, body.idToken);
}

/**
 * GET / POST 共通の本体。順番が要（★前から順に、通らなければそこで止まる）:
 *   1. 番人（IDトークン）        … 通らなければ1行も読まない
 *   2. 職員か（メールの形）      … 生徒・判定不能は全アクション拒否
 *   3. GET で書き込みは拒否      … URLを踏ませるだけの全消し（CSRF）を止める
 *   4. 本体
 */
function handle_(method, action, args, idToken) {
  // 1. ★番人。ここを通らないと1行もデータを読み書きしません
  const email = verifyIdToken_(idToken);
  if (!email) return denied_('signin');

  // 2. ★職員だけ。生徒はこの窓口を使わない
  const deny = accessDenyReason_(email, action);
  if (deny) {
    audit_(email, action, false, 'denied:' + deny + ' via ' + method);
    return forbidden_(deny);
  }

  // 3. ★GET で届いた書き込みは受けない（CSRF対策）
  if (method !== 'POST' && WRITE_ACTIONS_.indexOf(action) !== -1) {
    audit_(email, action, false, 'denied:postOnly（GETでは書き込みません）');
    return forbidden_('postOnly');
  }

  // 4. 本体
  try {
    if (action === 'roster')       return json_(getRoster(str_(args.day)));
    if (action === 'records')      return json_(getRecords(str_(args.date)));
    if (action === 'allRoster')    return json_(getAllRoster());
    if (action === 'submit')       return json_(submitRecords(args, email));
    if (action === 'updateRoster') return json_(updateRoster(args, email));
    return json_({ ok: false, error: 'invalid action' });
  } catch (err) {
    // ★err.message は返さない（旧版は返していた＝シート名などが外から読めた）
    audit_(email, action, false, 'error');
    return json_({ ok: false, error: 'bad request' });
  }
}

// ============================================================================
// 読み取り
// ============================================================================

// 指定曜日の生徒一覧を取得
function getRoster(day) {
  if (DAYS_.indexOf(day) === -1) return { students: [] };
  const sheet = getSheet(SHEET_ROSTER);
  if (!sheet) throw new Error('sheet missing: ' + SHEET_ROSTER);
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { students: [] };
  const dayIndex = data[0].indexOf(day);
  if (dayIndex === -1) return { students: [] };

  const students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][dayIndex] === '○') {
      students.push(data[i][0]);
    }
  }
  return { students: students };
}

// 全名簿データを取得（編集用）
function getAllRoster() {
  const sheet = getSheet(SHEET_ROSTER);
  if (!sheet) throw new Error('sheet missing: ' + SHEET_ROSTER);
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return { roster: [] };

  const roster = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const entry = { name: data[i][0], days: {} };
    DAYS_.forEach(function (d) {
      const idx = data[0].indexOf(d);
      entry.days[d] = idx !== -1 && data[i][idx] === '○';
    });
    roster.push(entry);
  }
  return { roster: roster };
}

// 指定日の健康観察記録を取得
function getRecords(dateStr) {
  if (!isDateKey_(dateStr)) return { records: [] };
  const sheet = getSheet(SHEET_RECORDS);
  if (!sheet) throw new Error('sheet missing: ' + SHEET_RECORDS);
  const data = sheet.getDataRange().getValues();
  const records = [];

  for (let i = 1; i < data.length; i++) {
    if (toDateKey_(data[i][0]) !== dateStr) continue;
    records.push({
      date: dateStr,
      name: data[i][1],
      condition: data[i][2],
      attendance: data[i][3],
      arrivalTime: data[i][4],
      remarks: data[i][5] || '',
      recorder: data[i][6],
      recordedAt: data[i][7],
    });
  }
  return { records: records };
}

// ============================================================================
// 書き込み（★POST の本文でしか届かない。handle_ が止めている）
// ============================================================================

// 健康観察記録を保存（同日・同名は置き換え）
function submitRecords(body, authEmail) {
  const sheet = getSheet(SHEET_RECORDS);
  if (!sheet) throw new Error('sheet missing: ' + SHEET_RECORDS);

  const date = str_(body.date);
  if (!Array.isArray(body.records) || !isDateKey_(date)) {
    audit_(authEmail, 'submit', false, 'badPayload（何もしていません）');
    return { ok: false, reason: 'badPayload' };
  }

  // 氏名の無い行は捨てる。値は文字列にそろえ、長さを抑える
  const records = body.records
    .filter(function (r) { return r && typeof r === 'object' && str_(r.name); })
    .map(function (r) {
      return {
        name: str_(r.name).slice(0, 100),
        condition: str_(r.condition).slice(0, 50),
        attendance: str_(r.attendance).slice(0, 50),
        arrivalTime: str_(r.arrivalTime).slice(0, 20),
        remarks: str_(r.remarks).slice(0, 500),
      };
    });

  // 記録者。画面が送ってこなければ、番人が確かめたメールを入れる
  const recorder = str_(body.recorder).slice(0, 100) || authEmail;
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');

  // 同日・同名の既存レコードを削除（上書き）
  const data = sheet.getDataRange().getValues();
  const namesToUpdate = records.map(function (r) { return r.name; });
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (toDateKey_(data[i][0]) === date && namesToUpdate.indexOf(str_(data[i][1])) !== -1) {
      rowsToDelete.push(i + 1);
    }
  }
  rowsToDelete.forEach(function (row) { sheet.deleteRow(row); });

  // 新しいレコードを追加
  records.forEach(function (r) {
    sheet.appendRow([date, r.name, r.condition, r.attendance, r.arrivalTime, r.remarks, recorder, now]);
  });

  // ★氏名は書かない。日付と件数だけ
  audit_(authEmail, 'submit', true, date + ' ' + rowsToDelete.length + '件を置き換え → ' + records.length + '件');
  return { ok: true, success: true, count: records.length };
}

// 名簿を更新（★全消し止め入り）
function updateRoster(body, authEmail) {
  const sheet = getSheet(SHEET_ROSTER);
  if (!sheet) throw new Error('sheet missing: ' + SHEET_ROSTER);

  // ------------------------------------------------------------------
  // ★名簿の全消し止め（A4-41 の refuseWipe と同じ形）
  // ------------------------------------------------------------------
  // この下で clearContents() を呼ぶ＝名簿を毎回作り直す作りになっている。
  // そのため body.roster が壊れている／空だと、それだけで名簿が消える。
  // 「配列で来ていない」なら何もしない。
  // 「既存があるのに0件で来た」なら、明示（confirmEmpty: true）が無ければ拒否。
  const incoming = body.roster;
  if (!Array.isArray(incoming)) {
    audit_(authEmail, 'updateRoster', false, 'badPayload（何もしていません）');
    return { ok: false, reason: 'badPayload' };
  }
  // 氏名の無い行は数えない（空行だけ送られても「0件」として扱う）
  const entries = incoming
    .filter(function (e) { return e && typeof e === 'object' && str_(e.name); })
    .map(function (e) {
      const days = (e.days && typeof e.days === 'object') ? e.days : {};
      return { name: str_(e.name).slice(0, 100), days: days };
    });

  const prev = sheet.getDataRange().getValues();
  let prevCount = 0;
  for (let i = 1; i < prev.length; i++) { if (prev[i][0]) prevCount++; }

  if (entries.length === 0 && prevCount > 0 && body.confirmEmpty !== true) {
    audit_(authEmail, 'updateRoster', false, '0件での上書きを拒否（既存' + prevCount + '件）');
    return { ok: false, reason: 'refuseWipe', prev: prevCount };
  }

  sheet.clearContents();
  const rows = [['名前'].concat(DAYS_)];
  entries.forEach(function (e) {
    rows.push([e.name].concat(DAYS_.map(function (d) { return e.days[d] ? '○' : ''; })));
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  // ★氏名は書かない。件数だけ
  audit_(authEmail, 'updateRoster', true, prevCount + '件 → ' + entries.length + '件');
  return { ok: true, success: true, count: entries.length };
}

// ============================================================================
// 小さな道具
// ============================================================================
function str_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

function isDateKey_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

// セルの値（Date か文字列か空）を yyyy-MM-dd にそろえる。読めなければ ''
function toDateKey_(v) {
  if (v === null || v === undefined || v === '') return '';
  try {
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch (err) {
    return '';
  }
}

// ============================================================================
// 番人（Firebase IDトークンの検証）── A4-41 と同じ作り
// ============================================================================
// 経緯: 2026-09-09／09-10 の実測で、この窓口が完全に無認証であることを確認した。
//   ・無認証の GET に HTTP 200 / application/json を返していた
//   ・allRoster が保健の名簿（氏名）を、records が健康記録を無認証で返していた
//   ・updateRoster が無認証かつ GET でも動き、clearContents() で名簿を丸ごと消せた
// この画面は静的サイト（GitHub Pages・PUBLICリポジトリ）から呼ばれるため、
// 「合言葉」をプログラムに埋めても一緒に公開される＝秘密にならない（teacher1234 がそれ）。
// そこで Firebase の IDトークン（署名付き・1時間で失効）を GAS 側で検証する。

var ALLOWED_DOMAIN_ = 'yushi-kokusai.jp';

/**
 * IDトークンを検証し、確かめられたメールアドレスを返す。だめなら null。
 * ★null が返ったら1行も読み書きしないこと（fail close）。
 */
function verifyIdToken_(idToken) {
  if (!idToken) return null;
  if (typeof idToken !== 'string') return null;

  // 毎リクエストで外部に問い合わせると遅く、GASの割当も食う。5分だけ覚えておく。
  // ★覚えるのは「通った」ときだけ。失敗は覚えない
  var cache = CacheService.getScriptCache();
  var key = 'hc_idt_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return hit;

  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!apiKey) return null;  // 未設定なら「通す」ではなく「通さない」

  var res;
  try {
    res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true,
      });
  } catch (err) {
    return null;  // 問い合わせ自体が失敗したら通さない
  }
  // 期限切れ・改ざん・別プロジェクトのトークンは、ここが 400 で返る
  if (res.getResponseCode() !== 200) return null;

  var users;
  try {
    users = JSON.parse(res.getContentText()).users;
  } catch (err) {
    return null;
  }
  if (!users || !users.length) return null;

  var email = normEmail_(users[0].email);
  // ★メール確認済みでないアカウントは通さない
  if (users[0].emailVerified !== true) return null;
  if (!isAllowedDomain_(email)) return null;

  cache.put(key, email, 300);
  return email;
}

/**
 * 学校のドメインかどうか。
 * ★「@ が2つ以上ある」「末尾が完全一致しない」を弾く。
 *   例: a@yushi-kokusai.jp.example.com → 拒否
 *       a@yushi-kokusai.jp.evil@x.com  → 拒否
 */
function isAllowedDomain_(email) {
  var at = email.indexOf('@');
  if (at <= 0) return false;                          // @が無い／先頭が@
  if (email.indexOf('@', at + 1) !== -1) return false; // @が2つ以上
  return email.slice(at + 1) === ALLOWED_DOMAIN_;
}

// ============================================================================
// 職員か生徒かの判定（A4-41 の 2026-09-09 版と同じ規則）
// ============================================================================
// ★社長決裁の規則（これがすべて）。メールの @ より前の形で決める:
//   ・アルファベット1文字 ＋ 数字8桁          → 生徒   例) s26100012
//   ・ハイフンを含む（前は1文字とは限らない）  → 職員   例) s-kawata / sa-sakai / s-ohno
//   ・どちらにも当てはまらない                 → ★拒否（第3の分類。職員扱いにしない）
//
// ★★最大の落とし穴: 生徒も職員も「s」で始まる。
//   「s で始まったら生徒」と書くと【職員が全員生徒扱い】になる。
//   分かれ目は「1文字目の次が数字か、ハイフンか」。
// ★想定外の形は職員側に倒さない。
//   職員が誤って弾かれたらすぐ直せるが、生徒が職員になると誰も気づけない。
// ★meta@ のような共有・役割アカウントはハイフンを持たない＝拒否される（A4-41 の実測どおり）。

var STUDENT_LOCAL_RE_ = /^[a-z][0-9]{8}$/;                 // s26100012
var STAFF_LOCAL_RE_   = /^[a-z0-9._]+-[a-z0-9._-]+$/;      // s-kawata / sa-sakai
// ★ハイフンの前後に1文字以上を求める。「-kawata」「kawata-」は拒否側に倒す

/**
 * 'staff' / 'student' / null（＝どちらでもない＝拒否）を返す。
 * ★大文字小文字・前後の空白は吸収する。@が2つ・別ドメインはここで null。
 */
function classifyRole_(email) {
  var e = normEmail_(email);
  if (!isAllowedDomain_(e)) return null;        // @無し・@が2つ・別ドメインを落とす
  var local = e.slice(0, e.indexOf('@'));
  if (STUDENT_LOCAL_RE_.test(local)) return 'student';   // ★生徒を先に見る
  if (STAFF_LOCAL_RE_.test(local)) return 'staff';
  return null;                                   // 第3の分類＝拒否
}

/**
 * 通してよいか。null なら通す。文字列なら拒否の理由。
 *
 * ★2026-09-10 設計変更（社長決裁A案）＝人ではなく【操作】で分ける。
 *   ・職員                 … 全部通す
 *   ・生徒（ログイン済み） … roster / submit は通す。
 *                            STAFF_ONLY_ACTIONS_ の3つは 'staffOnly' で拒否
 *   ・判定できない形       … 'unknownAccount' で全部拒否
 * ★fail close。role が null なら1行も読み書きしない。
 * ★無認証はここより手前（handle_ の番人）で止まる。そこは変えていない
 *   ＝A4-72 の穴の本体は「無認証で誰でも取れる」ことなので、そこだけは絶対に開けない。
 */
function accessDenyReason_(email, action) {
  var role = classifyRole_(email);
  if (role === 'staff') return null;
  if (role === 'student') {
    return STAFF_ONLY_ACTIONS_.indexOf(action) !== -1 ? 'staffOnly' : null;
  }
  return 'unknownAccount';
}

function denied_(reason) {
  return json_({ error: 'unauthorized', reason: reason });
}

/**
 * 「ログインはできているが、あなたには権限が無い」。
 * ★denied_（＝ログインし直せ）と分けてある。画面は別の文言を出すこと。
 *   reason: 'staffOnly'      … 生徒が【職員だけのアクション】を叩いた
 *                              （allRoster / records / updateRoster の3つ）
 *                              ★画面はログイン画面に飛ばさないこと。ログインは
 *                                済んでいるので飛ばすと無限ループになる
 *   reason: 'unknownAccount' … メールの形が生徒とも職員とも判定できない
 *   reason: 'postOnly'       … 書き込みを GET で叩いた（画面は POST を使うこと）
 */
function forbidden_(reason) {
  return json_({ error: 'forbidden', reason: reason });
}

// メールアドレスの正規化。前後の空白を落とし、小文字にそろえる
function normEmail_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// 操作の記録（シート audit）── A4-41 と同じ6列
// ============================================================================
// いつ・誰が・何を したかを1行ずつ書き残す。
// ★書かないもの: 生徒の氏名・健康記録の中身（件数や日付だけにする）
// ★弾いたアクセス（未ログイン）は書かない。誰でも叩ける入口なので、
//   書くと外から好きなだけ行を増やせてしまう（シートが膨らむ）。
//   ログイン済みの人の拒否（生徒・GETでの書き込み）は書く＝後から追える。
function audit_(email, action, ok, note) {
  try {
    var sheet = getOrCreateAuditSheet_();
    if (sheet.getLastRow() === 0) sheet.appendRow(AUDIT_HEADERS_);
    var role = classifyRole_(email) || 'unknown';
    sheet.appendRow([
      new Date().toISOString(),
      email || '',
      action || '',
      ok ? 'ok' : 'ng',
      '[' + role + '] ' + String(note || '').slice(0, 200),
      role
    ]);
  } catch (err) {
    // 記録に失敗しても本体の処理は止めない（記録のために操作が失敗する方が困る）
  }
}

// ============================================================================
// 貼り付けたあとの自己診断（A4-72）
// ============================================================================
/**
 * 関数の中身を文字列として見るとき、コメント行を外す。
 * ★これが無いと、注意書き（「★err.message は返さない」など）を読んで
 *   「まだ残っています」と誤報する。2026-09-10 に実際に誤報した。
 *   自作の検査は、成果物より先に検査装置を疑う。
 */
function codeOnly_(fn) {
  var src = '';
  try { src = String(fn); } catch (e) { return ''; }
  return src.split('\n').filter(function (l) {
    return l.replace(/^\s+/, '').indexOf('//') !== 0;
  }).join('\n');
}

// Apps Script のエディタで、関数の一覧から「HC_番人_自己診断」を選んで実行する。
// ★シートは書き換えません（読むだけ／audit にも書きません／audit を作りもしません）。
// ★生徒の氏名・健康記録はログに出しません（件数だけ）。
function HC_番人_自己診断() {
  var out = [];

  // --------------------------------------------------------------------
  // ★貼る場所の確認（気をつけること #1）
  // --------------------------------------------------------------------
  // 時間割ツール本体のGASはスプレッドシートに紐づいたプロジェクト（getActiveSpreadsheet が
  // 本体のシートを返す）。ここに貼ってしまうと、その紐づき先が SHEET_ID と食い違う。
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active && typeof active.getId === 'function' && active.getId() !== SHEET_ID) {
    out.push('貼る場所: ★★NG 貼る場所を間違えています。このプロジェクトは別のスプレッドシート'
             + '（時間割ツール本体？）に紐づいています。すぐに元のコードを貼り戻してください');
  } else {
    out.push('貼る場所: OK（健康観察のプロジェクトです）');
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  out.push(apiKey
    ? 'FIREBASE_API_KEY: OK（設定されています）'
    : 'FIREBASE_API_KEY: NG ★未設定です。このままだと全部拒否されます（プロジェクトの設定→スクリプト プロパティ）');

  out.push(typeof verifyIdToken_ === 'function'
    ? '番人(verifyIdToken_): OK'
    : '番人(verifyIdToken_): NG ★貼り付けが済んでいません');

  // トークン無し・デタラメ を実際に通してみる（どちらも null になるはず）
  var noToken = verifyIdToken_('');
  var junk    = verifyIdToken_('DEADBEEF.NOT.AREALTOKEN');
  out.push(noToken === null ? 'トークン無し: 拒否 OK' : 'トークン無し: ★通ってしまいました（' + noToken + '）');
  out.push(junk === null    ? 'デタラメなトークン: 拒否 OK' : 'デタラメなトークン: ★通ってしまいました（' + junk + '）');

  // ドメインの判定
  var domainCases = [
    ['tanaka@yushi-kokusai.jp', true],
    ['s26100012@yushi-kokusai.jp', true],
    ['tanaka@gmail.com', false],
    ['tanaka@yushi-kokusai.jp.example.com', false],
    ['tanaka@yushi-kokusai.jp.evil@example.com', false],
    ['@yushi-kokusai.jp', false],
    ['yushi-kokusai.jp', false]
  ];
  var domainOk = true;
  for (var i = 0; i < domainCases.length; i++) {
    if (isAllowedDomain_(domainCases[i][0]) !== domainCases[i][1]) {
      domainOk = false;
      out.push('ドメイン判定 ★NG: ' + domainCases[i][0]);
    }
  }
  if (domainOk) out.push('ドメイン判定（7通り）: OK');

  // 職員か生徒か（★s で始まる職員が生徒扱いにならないこと）
  var roleCases = [
    ['s26100012@yushi-kokusai.jp',  'student'],
    ['a00000001@yushi-kokusai.jp',  'student'],
    ['s-hisho09@yushi-kokusai.jp',   'staff'],    // ★s で始まるが職員
    ['sa-sakai@yushi-kokusai.jp',   'staff'],
    ['s-hisho10@yushi-kokusai.jp',     'staff'],
    ['S-Kawata@Yushi-Kokusai.JP',   'staff'],
    ['  s26100012@yushi-kokusai.jp  ', 'student'],
    ['s2610001@yushi-kokusai.jp',   null],
    ['s261000123@yushi-kokusai.jp', null],
    ['26100012@yushi-kokusai.jp',   null],
    ['kawata@yushi-kokusai.jp',     null],       // ハイフン無し＝職員に倒さない
    ['-kawata@yushi-kokusai.jp',    null],
    ['kawata-@yushi-kokusai.jp',    null],
    ['s-kawata@gmail.com',          null],
    ['s-hisho09@yushi-kokusai.jp.evil@x.com', null],
    ['s26100012',                   null]
  ];
  var roleOk = true;
  for (var k = 0; k < roleCases.length; k++) {
    if (classifyRole_(roleCases[k][0]) !== roleCases[k][1]) {
      roleOk = false;
      out.push('職員/生徒の判定 ★NG: ' + roleCases[k][0] + ' → ' + classifyRole_(roleCases[k][0])
               + '（' + roleCases[k][1] + ' のはず）');
    }
  }
  if (roleOk) out.push('職員/生徒の判定（' + roleCases.length + '通り）: OK');

  // ★2026-09-10: 人ではなく操作で分ける。3通りのアカウントで5アクションを判定器に通す
  var all = READ_ACTIONS_.concat(WRITE_ACTIONS_);
  var stu = 's26100012@yushi-kokusai.jp';
  var stf = 's-hisho09@yushi-kokusai.jp';
  var odd = 'kawata@yushi-kokusai.jp';
  var studentActions = [];
  for (var m = 0; m < all.length; m++) {
    if (STAFF_ONLY_ACTIONS_.indexOf(all[m]) === -1) studentActions.push(all[m]);
  }

  // 職員は5つ全部通る
  var staffOk = true;
  for (var s1 = 0; s1 < all.length; s1++) {
    if (accessDenyReason_(stf, all[s1]) !== null) staffOk = false;
  }
  out.push(staffOk
    ? '職員: OK（5アクション全部通ります）'
    : '職員: ★NG 職員が弾かれています。名簿も記録も誰も扱えません');

  // ★生徒（保健委員）は roster / submit が通る＝ここが通らないと入力できない
  var stuAllowOk = true;
  for (var s2 = 0; s2 < studentActions.length; s2++) {
    if (accessDenyReason_(stu, studentActions[s2]) !== null) stuAllowOk = false;
  }
  out.push(stuAllowOk
    ? '生徒（保健委員）が使えるもの: OK（' + studentActions.join(', ') + ' が通ります）'
    : '生徒（保健委員）が使えるもの: ★NG 保健委員が健康観察を入力できません');

  // ★生徒は職員だけの3つが拒否される
  var stuDenyOk = true;
  for (var s3 = 0; s3 < STAFF_ONLY_ACTIONS_.length; s3++) {
    if (accessDenyReason_(stu, STAFF_ONLY_ACTIONS_[s3]) !== 'staffOnly') stuDenyOk = false;
  }
  out.push(stuDenyOk
    ? '職員だけのもの: OK（' + STAFF_ONLY_ACTIONS_.join(', ') + ' は生徒には渡しません）'
    : '職員だけのもの: ★NG 危険です。生徒が名簿の編集・全消しや他人の記録に手が届きます');

  // 判定できないアカウントは5つ全部拒否
  var oddOk = true;
  for (var s4 = 0; s4 < all.length; s4++) {
    if (accessDenyReason_(odd, all[s4]) !== 'unknownAccount') oddOk = false;
  }
  out.push(oddOk
    ? '判定できないアカウント: OK（5アクション全部拒否します）'
    : '判定できないアカウント: ★NG 素性の分からないアカウントが通ります');

  // GET で書き込みが止まるか／全消し止めが入っているか
  // （★コードを文字列として見る。通信しない。★コメントは外す＝codeOnly_）
  var handleSrc = codeOnly_(handle_);
  var rosterSrc = codeOnly_(updateRoster);
  out.push(handleSrc.indexOf("'postOnly'") !== -1 && WRITE_ACTIONS_.length === 2
    ? 'GETでの書き込み拒否: OK（' + WRITE_ACTIONS_.join(', ') + ' は POST でしか受けません）'
    : 'GETでの書き込み拒否: NG ★URLを踏ませるだけで名簿を消せます。貼り付けが古い版です');
  out.push(rosterSrc.indexOf("'refuseWipe'") !== -1
    ? '0件上書きの拒否(refuseWipe): OK'
    : '0件上書きの拒否(refuseWipe): NG ★空の保存1回で名簿が消えます。貼り付けが古い版です');
  out.push(handleSrc.indexOf('err.message') === -1
    ? '例外の中身を外に出さない: OK'
    : '例外の中身を外に出さない: NG ★シート名などが外から読めます');

  // シートの状態（件数だけ・作らない・書かない）
  var ss = null;
  try { ss = ss_(); } catch (e) { ss = null; }
  if (!ss) {
    out.push('スプレッドシート: ★NG 開けません。SHEET_ID が違うか、このアカウントに権限がありません');
  } else {
    var names = [SHEET_ROSTER, SHEET_RECORDS];
    for (var s = 0; s < names.length; s++) {
      var sh = ss.getSheetByName(names[s]);
      out.push(sh
        ? 'シート「' + names[s] + '」: OK（' + Math.max(0, sh.getLastRow() - 1) + '件）'
        : 'シート「' + names[s] + '」: ★NG 見つかりません。SHEET_ID か、貼る場所が違います');
    }
    var au = ss.getSheetByName(SHEET_AUDIT);
    out.push(au
      ? 'audit シート: あります（' + Math.max(0, au.getLastRow() - 1) + '行の記録）'
      : 'audit シート: まだありません（最初の記録のときに6列で作られます）');
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}
