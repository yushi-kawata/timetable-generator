// ============================================================================
// 時間割ツール 裏側プログラム ─ 番人入り（2026-09-08）
//                              ＋二重ログインの廃止（2026-09-09）／台帳 A4-41
// ============================================================================
//
// ----------------------------------------------------------------------------
// ★このファイルの来歴（2026-09-10・台帳 A4-83）★ 必ず読んでください
// ----------------------------------------------------------------------------
// 2026-09-09 の夕方、このファイルが【9月8日の状態（715行）に戻っていた】。
// 9月9日に入れた次の3つが、まるごと消えていた:
//   ・職員か生徒かの判定（classifyRole_ / accessDenyReason_ / limitToSelf_）
//   ・二重ログインの廃止（getMe）
//   ・QRの行き先の確認（dxUrlDenyReason_ / dxHostOf_ / dxFetchWithin_）
// 原因は特定できていない（9/9 19:20 に同時刻で上書きされた形跡がある）。
// ★9月9日版は git に1バイトも入っていなかった（コミット漏れ）。
//   残っていたのは試験用の対照ファイル tmp_verify/control_a441_nopwcheck_20260909.js
//   だけで、これが実質の最新版だった。
//
// 2026-09-10、社長決裁（A案）により【その1353行版をこのファイルの正本に戻した】。
//   ・中身は control_a441_nopwcheck_20260909.js とバイト単位で同一
//   ・旧715行版は git の履歴（コミット ad0b9ee）と
//     _正本候補_退避_20260910/ に残してある
//
// ★ファイル名の「20260908」は実態と合っていないが、名前は変えていない。
//   手順書・決裁台帳・試験7本など14か所以上から参照されており、
//   改名するとそちらが宛先を失うため。日付ではなく【この来歴】を見ること。
//
// ★入っていないもの（2026-09-10 実測・混同しないこと）:
//   ・noPassword（dx_password が空のときに嘘の成功を返さない件）
//   ・dxLoginFailed（younetDX のログイン失敗を見分ける件）
//   この2つは【どのファイルにも入っていない】。台帳 A4-41 に
//   「本番反映済み」と書かれていたのは誤りで、2026-09-10 に訂正済み。
//   社長決裁はC案＝未選択。★勝手に実装しないこと。
// ----------------------------------------------------------------------------
//
// ★★ 気をつけること（先に読んでください）★★
//
//  0. ★貼る前に、いまエディタに入っている中身を全部コピーして
//     手元のテキストファイルに保存してください（戻せるようにするため）。
//
//  0-b. ★貼ったら、関数の一覧から【TTG_番人_自己診断】を1回実行してください。
//     「dx_email が別ドメイン: ○件」が出ます。ここが名簿の件数と同じだと
//     【生徒全員が自分の時間割を出せません】。その場合は名簿を直すのが先です。
//     （自己診断はシートを書き換えません。読むだけです）
//
//  1. ★これを貼った瞬間、いまの画面（GitHub Pages に配ってある古い画面）は
//     すべて弾かれます。ツールは「新しい画面が配り終わるまで」使えません。
//     ＝GASを貼る → 画面を配る の順で、その間の数分は誰も使えません。
//     使う時間を避けて作業してください（手順書に書いてあります）。
//
//  2. ★デプロイの「アクセスできるユーザー」は【全員】のままにしてください。
//     「自分のみ」にするとブラウザからの呼び出しが通らず、ツールが完全に死にます。
//     このプログラムは「全員が叩ける入口で、中身で弾く」作りです（社長決裁＝A案）。
//
//  3. ★「新しいデプロイ」を押さないでください。既存のデプロイを【編集】して
//     「新バージョン」にしてください。新規にするとURLが変わり、
//     古いURL（＝無認証のまま）が生き残ります。
//
//  4. ★スクリプト プロパティに FIREBASE_API_KEY を入れないと、
//     すべての操作が拒否されます（＝安全側に倒れます。データは漏れません）。
//     ツールが「ログインし直してください」しか言わないときは、まずここを疑います。
//
//  5. ★既存のシート（records / timetable / students / attendance / period2）の
//     列は一切触っていません。増えるのは新しい1枚 audit（操作の記録）だけです。
//
// ----------------------------------------------------------------------------
// この版で入れたこと
// ----------------------------------------------------------------------------
//  A. 入口の番人（Firebase の IDトークン検証）
//     ・Firebase プロジェクト = yushi-meta
//     ・通すのは @yushi-kokusai.jp のアカウントで、かつメール確認済みのものだけ
//     ・トークンが無い／壊れている／期限切れ／ドメインが違う → 全部拒否（fail close）
//     ・15アクション全部（読み取りも書き込みも）が番人の後ろにあります
//     ・★トークンはURLに載せません。POSTの本文で受けます
//       （URLに載せると Apps Script の実行ログ・ブラウザ履歴・Referer に
//         1時間有効の資格情報が残るため）
//     ・作りは生徒ポータルの gas/coin.gs と同じです（実績のある形をそのまま使う）
//
//  B. 2026-09-02 の修正2点（★必ず両方まとめて。片方だけだと事故になります）
//     1. getStudents が dx_password（younetDXの平文パスワード）を返さない。
//        代わりに has_password（設定されているか、の真偽）だけを返す
//     2. saveStudents が「空で届いたパスワードで既存を消す」のを止めた
//        （keepPassword_ で既存を据え置く）
//
//  C. 名簿の全消し止め（新規）
//     saveStudents は sheet.clear() で名簿を作り直します。
//     壊れた要求や空の要求が来ると、それだけで名簿が消えていました。
//     → 中身が配列でなければ何もしない／既存があるのに0件で来たら拒否。
//
//  D. 操作の記録（新規・シート audit）
//     いつ・誰が（確かめ済みのメール）・何を したかを書き残します。
//     ★生徒の氏名・メール・パスワードは書きません（件数だけ）。
//
//  E. 二重ログインの廃止（2026-09-09・社長決裁）
//     これまで生徒は ①Googleログイン → ②younetDXのメール＋パスワード入力
//     の2回ログインしていました。②をやめます。
//     ・新しい窓口 getMe … Googleログインで確かめたメールを名簿の dx_email と
//       突き合わせて本人を出します。画面はメールもパスワードも送りません。
//     ・authStudent … 廃止。呼ばれても { ok:false, reason:'deprecated' } だけ返し、
//       生徒データは1件も返しません。パスワードを突き合わせる処理は削除しました。
//     ★注意1: これで無くなるのは「生徒が画面でパスワードを打つ」ことだけです。
//       登校・下校QR（dxCheckIn）は今までどおり、シートの dx_password を
//       サーバー側で読んで younetDX にログインします。
//       ＝【シートの平文パスワードは残ります】。消すとQRが動かなくなります。
//
//  F. なりすましの穴を塞いだ（2026-09-09・社長決裁）
//     登校・下校QR（dxCheckIn）が「本文に書かれたメール」を信じていたため、
//     ログイン済みの生徒が本文に他人のメールを書くだけで
//     【他人の登校・下校を younetDX に登録】できていました。
//     → 誰の登校かは、番人が確かめたメール（Googleログインの本人）だけで決めます。
//     ★社長決裁＝「職員が生徒の代理でQRを叩く運用は無い」。
//       もし将来その運用が必要になったら、ここは作り直しになります（黙って戻さないこと）。
//
//  G. 職員か生徒かの判定（2026-09-09・社長決裁）
//     これまでは @yushi-kokusai.jp なら誰でも全部通っていました。
//     ＝【生徒のアカウントでも全生徒の名簿が読めて、名簿を全消しできました】。
//     メールの @ より前の形で判定します:
//       ・1文字＋数字8桁（s26100012）→ 生徒
//       ・ハイフンを含む（s-kawata）  → 職員
//       ・どちらでもない              → 拒否
//     ★★生徒も職員も「s」で始まります。分かれ目は「次が数字かハイフンか」です。
//     ・職員だけ: getStudents / saveStudents / getRecs / saveRec /
//                 deleteRec / clearRecs / saveTT
//     ・生徒も可: getMe / getTT / checkIn / checkOut / savePeriod2 / dxCheckIn /
//                 getAttendance / getPeriod2
//       ★ただし getAttendance と getPeriod2 は、生徒には【本人の行だけ】返します。
//     ★貼ったあと自己診断で「職員/生徒の判定（16通り）: OK」を必ず確認してください。
//       ここが崩れると、職員が全員生徒扱いになって誰も名簿を編集できなくなります。
//
//  H. QRの行き先を確かめる（2026-09-09）
//     登校・下校QRから読んだURL（dxUrl）へ、younetDX のログイン済み cookie を
//     付けて通信しています。この行き先を誰も確かめていませんでした。
//     ＝QRの窓口（別プロジェクト・認証なし）を差し替えられると、
//     【生徒のログイン済み cookie が他所へ送られる】状態でした。
//     → 行き先を you-net-dx.jp に限定します（ホストの完全一致・https のみ）。
//     ★転送（リダイレクト）も自分で辿り、1手ごとに行き先を確かめます。
//     ★別プロジェクトの「QRの窓口」自体に認証が無いことは、まだ直っていません
//       （台帳に別件として上げてあります）。
//     ★注意2: 名簿の dx_email が学校の Google アカウントと違っていると、
//       その生徒は在籍していても「名簿にありません」になります。
//       貼る前に TTG_番人_自己診断 で人数を確認してください（上の 0-b）。
//
// ----------------------------------------------------------------------------
// 貼る前にやること（スクリプト プロパティ）
// ----------------------------------------------------------------------------
//   Apps Script の左下「プロジェクトの設定」→「スクリプト プロパティ」
//     FIREBASE_API_KEY = （値は手順書「手順_時間割ツール_A4-41_20260908_v2.md」の
//                          「準備2」に書いてあります）
//   （生徒ポータル・職員ポータルと同じ yushi-meta のものです。
//     このキーは公開されても差し支えないもので、鍵ではありません。
//     本人の証明はトークンの署名で行っています）
// ============================================================================

const SHEET_RECORDS = 'records';
const SHEET_TT = 'timetable';
const SHEET_STUDENTS = 'students';
const SHEET_ATTENDANCE = 'attendance';
const SHEET_PERIOD2 = 'period2';
const SHEET_AUDIT = 'audit';

// ★audit シートの見出し（2026-09-09 に role を6列目へ追加）
//   本番の audit シートは【すでに5列で動いています】（2026-09-09 12:42 の貼り付け以降）。
//   そこへ後から role を足すので、見出しの面倒を見る処理が要ります
//   （ensureAuditHeader_ を見ること）。★既存の行は1行も書き換えません。
const AUDIT_HEADERS_ = ['timestamp', 'email', 'action', 'ok', 'note', 'role'];

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_RECORDS) {
      sheet.appendRow(['id', 'week', 'name', 'grade', 'days', 'sel', 'timestamp']);
    }
    if (name === SHEET_AUDIT) {
      sheet.appendRow(AUDIT_HEADERS_);   // ★初回は最初から6列で作る
    }
  }
  return sheet;
}

// ============================================================================
// 入口（GET）
// ============================================================================
// ★読み取りも画面からは POST で来ます（トークンをURLに載せないため）。
//   この doGet は doPost から呼び直される内部の受け皿でもあります。
//   生徒ポータルの coin.gs と同じ作りです。
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action;

  // ★番人。ここを通らないと1行もデータを読みません
  const email = verifyIdToken_(params.idToken);
  if (!email) return denied_('signin');

  // ★2026-09-09: 職員か生徒か。生徒に職員用のアクションは通しません
  const denyGet = accessDenyReason_(email, action);
  if (denyGet) {
    audit_(email, action, false, 'denied:' + denyGet);
    return forbidden_(denyGet);
  }

  if (action === 'getRecs') {
    const sheet = getOrCreateSheet(SHEET_RECORDS);
    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return json_([]);
    const headers = data[0];
    const recs = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      try { obj.days = JSON.parse(obj.days); } catch(err) { obj.days = []; }
      try { obj.sel = JSON.parse(obj.sel); } catch(err) { obj.sel = {}; }
      return obj;
    });
    return json_(recs);
  }

  if (action === 'getStudents') {
    const sheet = getOrCreateSheet(SHEET_STUDENTS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return json_([]);
    const headers = data[0];
    const students = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      // 曜日フラグをbooleanに
      ['月','火','水','木','金'].forEach(d => { obj[d] = obj[d] === true || obj[d] === '○' || obj[d] === 'TRUE'; });
      return {
        name: obj.name || '',
        grade: obj.grade || '',
        course: obj.course || '通常',
        dx_email: obj.dx_email || '',
        // ★2026-09-02: dx_password は返さない（A4-41）。
        //   代わりに「設定されているか」だけを返す。画面はこれで○/未設定を出せる。
        has_password: !!(obj.dx_password || '').toString().trim(),
        days: { 月: obj['月'], 火: obj['火'], 水: obj['水'], 木: obj['木'], 金: obj['金'] }
      };
    });
    return json_(students);
  }

  if (action === 'getAttendance') {
    const date = params.date || '';
    const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return json_([]);
    const headers = data[0];
    const records = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    }).filter(r => !date || r.date === date);
    // ★2026-09-09: 生徒には本人の行だけ。職員はそのまま全員分
    //   （その日に登校した全員の氏名・学年が生徒の端末に降りていた）
    return json_(limitToSelf_(email, records));
  }

  if (action === 'getPeriod2') {
    const week = params.week || '';
    const sheet = getOrCreateSheet(SHEET_PERIOD2);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return json_([]);
    const headers = data[0];
    const records = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      var sel = {};
      ['月','火','水','木','金'].forEach(function(d) {
        var v = obj[d] || '';
        if (typeof v === 'string' && v.indexOf('{') === 0) {
          try { sel[d] = JSON.parse(v); } catch(ex) { sel[d] = {}; }
        } else if (v) {
          sel[d] = { 2: v };
        } else {
          sel[d] = {};
        }
      });
      return {
        week: obj.week || '',
        name: obj.name || '',
        selections: sel
      };
    }).filter(r => !week || r.week === week);
    // ★2026-09-09: 生徒には本人の行だけ。職員はそのまま全員分
    return json_(limitToSelf_(email, records));
  }

  if (action === 'getTT') {
    const sheet = getOrCreateSheet(SHEET_TT);
    const data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      try {
        const tt = JSON.parse(data[1][0]);
        return json_(tt);
      } catch(err) {}
    }
    return json_(null);
  }

  return json_({ error: 'invalid action' });
}

// ============================================================================
// 入口（POST）
// ============================================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // ★番人。ここを通らないと1行も読み書きしません
    const authEmail = verifyIdToken_(body.idToken);
    if (!authEmail) return denied_('signin');

    // ★2026-09-09: 職員か生徒か。生徒に職員用のアクションは通しません
    //   （読み取り系を doGet に渡す前に、ここで先に止める）
    const denyPost = accessDenyReason_(authEmail, body.action);
    if (denyPost) {
      audit_(authEmail, body.action, false, 'denied:' + denyPost);
      return forbidden_(denyPost);
    }

    // 読み取り系も POST の本文でトークンを受け、処理は doGet に委譲する。
    // URL のクエリにトークンを載せない（＝ログに残さない）ための形。
    // 生徒ポータルの coin.gs と同じやり方。
    if (READ_ACTIONS_.indexOf(body.action) !== -1) {
      return doGet({ parameter: {
        action: body.action,
        idToken: body.idToken,
        date: body.date || '',
        week: body.week || ''
      }});
    }

    if (body.action === 'saveRec') {
      const d = body.data;
      if (!d) return json_({ ok: false, reason: 'badPayload' });
      const sheet = getOrCreateSheet(SHEET_RECORDS);
      sheet.appendRow([
        d.id, d.week, d.name, d.grade,
        JSON.stringify(d.days), JSON.stringify(d.sel), d.timestamp
      ]);
      audit_(authEmail, 'saveRec', true, 'id=' + d.id);
      return json_({ ok: true });
    }

    if (body.action === 'deleteRec') {
      const sheet = getOrCreateSheet(SHEET_RECORDS);
      const data = sheet.getDataRange().getValues();
      let hit = false;
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][0]) === String(body.id)) {
          sheet.deleteRow(i + 1);
          hit = true;
          break;
        }
      }
      audit_(authEmail, 'deleteRec', hit, 'id=' + body.id);
      return json_({ ok: true });
    }

    if (body.action === 'clearRecs') {
      const sheet = getOrCreateSheet(SHEET_RECORDS);
      const removed = Math.max(0, sheet.getLastRow() - 1);
      if (removed > 0) {
        sheet.deleteRows(2, removed);
      }
      audit_(authEmail, 'clearRecs', true, removed + '行を削除');
      return json_({ ok: true });
    }

    if (body.action === 'saveTT') {
      const sheet = getOrCreateSheet(SHEET_TT);
      if (!body.data) return json_({ ok: false, reason: 'badPayload' });
      sheet.clear();
      sheet.appendRow(['data']);
      sheet.appendRow([JSON.stringify(body.data)]);
      audit_(authEmail, 'saveTT', true, '');
      return json_({ ok: true });
    }

    if (body.action === 'saveStudents') {
      const sheet = getOrCreateSheet(SHEET_STUDENTS);

      // ------------------------------------------------------------------
      // ★名簿の全消し止め（2026-09-08 追加）
      // ------------------------------------------------------------------
      // この下で sheet.clear() を呼ぶ＝名簿を毎回作り直す作りになっている。
      // そのため body.data が壊れている／空だと、それだけで名簿が消える。
      // 「配列で来ていない」なら何もしない。
      // 「既存があるのに0件で来た」なら、明示（confirmEmpty: true）が無ければ拒否。
      const incoming = body.data;
      if (!Array.isArray(incoming)) {
        audit_(authEmail, 'saveStudents', false, 'badPayload（何もしていません）');
        return json_({ ok: false, reason: 'badPayload' });
      }
      const prevRows = sheet.getDataRange().getValues();
      const prevCount = Math.max(0, prevRows.length - 1);
      if (incoming.length === 0 && prevCount > 0 && body.confirmEmpty !== true) {
        audit_(authEmail, 'saveStudents', false, '0件での上書きを拒否（既存' + prevCount + '件）');
        return json_({ ok: false, reason: 'refuseWipe', prev: prevCount });
      }

      // ------------------------------------------------------------------
      // ★2026-09-02（A4-41）: getStudents が dx_password を返さなくなったので、
      //   画面から届く dx_password は基本的に空になる。
      //   ここで素直に上書きすると【全生徒のパスワードが消える】。
      //   → 消す前に既存を読み、空で届いた人は既存を据え置く。
      //   ★この2つは必ず同時に入れること。片方だけだと事故になる。
      // ------------------------------------------------------------------
      const prevPw = {};
      if (prevRows.length > 1) {
        const ph = prevRows[0];
        const iEmail = ph.indexOf('dx_email');
        const iName  = ph.indexOf('name');
        const iPw    = ph.indexOf('dx_password');
        if (iPw >= 0) {
          for (let i = 1; i < prevRows.length; i++) {
            const pw = (prevRows[i][iPw] || '').toString();
            if (!pw) continue;
            const key = iEmail >= 0 && prevRows[i][iEmail]
              ? 'e:' + prevRows[i][iEmail].toString().trim().toLowerCase()
              : (iName >= 0 ? 'n:' + (prevRows[i][iName] || '').toString().trim() : '');
            if (key) prevPw[key] = pw;
          }
        }
      }

      sheet.clear();
      sheet.appendRow(['name', 'grade', 'course', '月', '火', '水', '木', '金', 'dx_email', 'dx_password']);
      incoming.forEach(s => {
        const days = s.days || {};
        sheet.appendRow([
          s.name, s.grade, s.course || '通常',
          days['月'] ? '○' : '', days['火'] ? '○' : '',
          days['水'] ? '○' : '', days['木'] ? '○' : '', days['金'] ? '○' : '',
          s.dx_email || '', keepPassword_(s, prevPw)
        ]);
      });
      // ★氏名は書かない。件数だけ
      audit_(authEmail, 'saveStudents', true, prevCount + '件 → ' + incoming.length + '件');
      return json_({ ok: true });
    }

    if (body.action === 'checkIn') {
      const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['date', 'name', 'grade', 'checkinTime', 'checkoutTime']);
      }
      // 同日同名の既存レコードを探す
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === body.date && data[i][1] === body.name) {
          // 既に登校済み → 更新しない
          return json_({ ok: true, message: 'already checked in' });
        }
      }
      sheet.appendRow([body.date, body.name, body.grade || '', body.time || '', '']);
      audit_(authEmail, 'checkIn', true, String(body.date || ''));
      return json_({ ok: true });
    }

    if (body.action === 'checkOut') {
      const sheet = getOrCreateSheet(SHEET_ATTENDANCE);
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === body.date && data[i][1] === body.name) {
          sheet.getRange(i + 1, 5).setValue(body.time || '');
          audit_(authEmail, 'checkOut', true, String(body.date || ''));
          return json_({ ok: true });
        }
      }
      return json_({ ok: false, message: 'no checkin record' });
    }

    if (body.action === 'savePeriod2') {
      const sheet = getOrCreateSheet(SHEET_PERIOD2);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['week', 'name', '月', '火', '水', '木', '金']);
      }
      // 同週同名の既存レコードを削除
      const data = sheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][0] === body.week && data[i][1] === body.name) {
          sheet.deleteRow(i + 1);
        }
      }
      const sel = body.selections || {};
      sheet.appendRow([
        body.week, body.name,
        JSON.stringify(sel['月'] || {}),
        JSON.stringify(sel['火'] || {}),
        JSON.stringify(sel['水'] || {}),
        JSON.stringify(sel['木'] || {}),
        JSON.stringify(sel['金'] || {})
      ]);
      audit_(authEmail, 'savePeriod2', true, String(body.week || ''));
      return json_({ ok: true });
    }

    // ------------------------------------------------------------------
    // getMe ─ 本人の割り出し（2026-09-09 追加・A4-41／二重ログインの廃止）
    // ------------------------------------------------------------------
    // 生徒は【Googleログインだけ】。younetDX のメールとパスワードは画面で打たせない。
    // 誰なのかは「番人が確かめた Google のメール」を名簿の dx_email と
    // 突き合わせて決める。
    //
    // ★body.email は読まない。読んだ瞬間「他人のメールを名乗れる窓口」になる。
    //   使うのは authEmail（＝verifyIdToken_ が Firebase に問い合わせて確かめた値）だけ。
    // ★返す形は旧 authStudent と同じ（画面の描画処理をそのまま使うため）。
    if (body.action === 'getMe') {
      const me = normEmail_(authEmail);
      const sheet = getOrCreateSheet(SHEET_STUDENTS);
      const data = sheet.getDataRange().getValues();
      const roster = Math.max(0, data.length - 1);
      if (roster === 0) {
        audit_(authEmail, 'getMe', false, 'notEnrolled（名簿が0件）');
        return json_({ ok: false, reason: 'notEnrolled' });
      }
      const headers = data[0];
      for (let i = 1; i < data.length; i++) {
        const obj = {};
        headers.forEach((h, j) => obj[h] = data[i][j]);
        // 突き合わせは前後の空白を落とし、大文字小文字を無視（旧 authStudent と同じ正規化）
        if (normEmail_(obj.dx_email) !== me) continue;
        ['月','火','水','木','金'].forEach(d => { obj[d] = obj[d] === true || obj[d] === '○' || obj[d] === 'TRUE'; });
        audit_(authEmail, 'getMe', true, '');
        return json_({
          ok: true,
          student: {
            name: obj.name || '',
            grade: obj.grade || '',
            course: obj.course || '通常',
            dx_email: normEmail_(obj.dx_email),
            days: { '月': obj['月'], '火': obj['火'], '水': obj['水'], '木': obj['木'], '金': obj['金'] }
          }
        });
      }
      // ------------------------------------------------------------------
      // ★ここに落ちる＝名簿の dx_email が、その人の学校Googleアカウントと違う。
      //   本人は在籍しているのに「名簿にありません」と言われる。
      //   名簿の dx_email が younetDX 用の別アドレスのままだと【全員がここに落ちる】。
      //   → 貼る前に TTG_番人_自己診断 で「何人が落ちるか」を数えること。
      // ★どのメールで落ちたかは note に書かない（監査シートに生徒のメールを溜めない）。
      //   誰が落ちたかは email 列（＝番人が確かめた本人）に残るので追跡はできる。
      // ------------------------------------------------------------------
      audit_(authEmail, 'getMe', false, 'notEnrolled（dx_email に一致なし／名簿' + roster + '件）');
      return json_({ ok: false, reason: 'notEnrolled' });
    }

    // ------------------------------------------------------------------
    // authStudent ─ 廃止（2026-09-09・A4-41）
    // ------------------------------------------------------------------
    // 生徒に younetDX のメールとパスワードを画面で打たせていた経路。社長決裁で廃止。
    // ★パスワードを突き合わせる処理はこのファイルから消してある。
    //   古い画面が残っていても、ここからは生徒データが1件も出ない。
    // ★本人の割り出しは上の getMe に移った。
    if (body.action === 'authStudent') {
      audit_(authEmail, 'authStudent', false, 'deprecated（getMe に移行済み）');
      return json_({ ok: false, reason: 'deprecated' });
    }

    if (body.action === 'dxCheckIn') {
      // ------------------------------------------------------------------
      // ★2026-09-09（A4-41）: 誰の登校かは body.email ではなく authEmail で決める
      // ------------------------------------------------------------------
      // 【前はこうだった】ここは本文の email をそのまま信じていた。
      //   番人を通ったログイン済みの人なら、本文に他人のメールを書くだけで
      //   【他人の登校・下校を younetDX に登録】できた（本人は気づけない）。
      // 【社長決裁 2026-09-09】「職員が生徒の代理でQRを叩く運用は無い」。
      //   よって本人は authEmail（番人が Firebase に問い合わせて確かめた値）に固定する。
      //
      // ★body.email は読まない。画面がまだ送ってきても【黙って無視する】。
      //   読む設計を残すと、将来「送れば効く」と誤解した実装が入り込む。
      // ★突き合わせは getMe と同じ normEmail_（前後の空白を落とし、大文字小文字を無視）。
      const me = normEmail_(authEmail);
      const dxUrl = String(body.dxUrl === null || body.dxUrl === undefined ? '' : body.dxUrl).trim();

      // ------------------------------------------------------------------
      // ★2026-09-09: 行き先の確認（A4-41）
      // ------------------------------------------------------------------
      // この下で younetDX にログインし、その cookie を付けて dxUrl へ通信する。
      // dxUrl は QRの窓口（別プロジェクト・認証なし）から降りてくる値なので、
      // 差し替えられると【生徒のログイン済み cookie が他所へ送られる】。
      // ここで you-net-dx.jp 以外は通さない。
      // ★ログインより手前で止める（拒否のときは younetDX にも1回も触らない）。
      const urlDeny = dxUrlDenyReason_(dxUrl);
      if (urlDeny) {
        // ★攻撃者のURLをそのまま note に残さない。理由の一語＋ホスト名だけ
        audit_(authEmail, 'dxCheckIn', false,
          urlDeny === 'badHost'
            ? 'badHost:' + String(dxHostOf_(dxUrl) || '?').slice(0, 60)
            : urlDeny);
        return urlDeny === 'noDxUrl'
          ? json_({ ok: false, reason: 'noDxUrl', msg: 'no dxUrl' })
          : json_({ ok: false, reason: 'badDxUrl', msg: 'bad dxUrl' });
      }
      // studentsシートから認証情報を取得
      // ★この経路（シートの平文 dx_password を読んで younetDX にログインする）は
      //   今までどおり残す。消すと登校・下校QRが動かなくなる。
      const sheet = getOrCreateSheet(SHEET_STUDENTS);
      const data = sheet.getDataRange().getValues();
      const roster = Math.max(0, data.length - 1);
      const headers = data[0] || [];
      let creds = null;
      for (let i = 1; i < data.length; i++) {
        const obj = {};
        headers.forEach((h, j) => obj[h] = data[i][j]);
        if (normEmail_(obj.dx_email) !== me) continue;
        creds = {
          // ★younetDX に送るログインIDは、シートの値の大文字小文字をそのまま使う
          //   （向こうが大文字小文字を区別する可能性があるため。落とすのは前後の空白だけ）
          email: String(obj.dx_email === null || obj.dx_email === undefined ? '' : obj.dx_email).trim(),
          password: (obj.dx_password || '').toString()
        };
        break;
      }
      if (!creds) {
        // ------------------------------------------------------------------
        // ★getMe と同じ reason:'notEnrolled' にそろえる。
        //   原因も直し方も getMe と同一（名簿の dx_email が、その人の
        //   学校Googleアカウントと違う）。別の名前にすると画面が同じ事象に
        //   2通りの文言を持つことになり、片方が必ず的外れになる。
        // ★生徒はQRの前で困っている場面なので、画面には
        //   「あなたは生徒ではありません」ではなく
        //   「名簿の登録アドレスが違う可能性があります。先生にご連絡ください」を出すこと。
        // ★どのメールで落ちたかは note に書かない。誰が落ちたかは email 列に残る。
        // ------------------------------------------------------------------
        audit_(authEmail, 'dxCheckIn', false, 'notEnrolled（dx_email に一致なし／名簿' + roster + '件）');
        return json_({ ok: false, reason: 'notEnrolled', msg: 'student not found' });
      }
      try {
        // ステップ1: ログインページにGET（セッションcookie取得）
        var getResp = UrlFetchApp.fetch('https://you-net-dx.jp/yushi/student/index.php', {
          followRedirects: true,
          muteHttpExceptions: true
        });
        var getCookies = getResp.getAllHeaders()['Set-Cookie'];
        var sessionCookie = '';
        if (getCookies) {
          if (typeof getCookies === 'string') {
            sessionCookie = getCookies.split(';')[0];
          } else {
            sessionCookie = getCookies.map(function(c) { return c.split(';')[0]; }).join('; ');
          }
        }

        // ステップ2: login.phpにPOST（login_flag含む）
        var loginResp = UrlFetchApp.fetch('https://you-net-dx.jp/yushi/student/pages/login.php', {
          method: 'post',
          payload: {
            login_id: creds.email,
            password: creds.password,
            login_flag: ''
          },
          headers: { 'Cookie': sessionCookie },
          followRedirects: false,
          muteHttpExceptions: true
        });
        // ログイン後の新しいセッションcookieを取得
        var loginCookies = loginResp.getAllHeaders()['Set-Cookie'];
        if (loginCookies) {
          if (typeof loginCookies === 'string') {
            sessionCookie = loginCookies.split(';')[0];
          } else {
            sessionCookie = loginCookies.map(function(c) { return c.split(';')[0]; }).join('; ');
          }
        }

        // ステップ3: 出席ページにGET（student_idを取得）
        // ★2026-09-09: followRedirects: true をやめ、転送を自分で辿る。
        //   true のままだと、転送先が you-net-dx.jp を外れても
        //   Cookie ヘッダごと付いていってしまう。
        var hop3 = dxFetchWithin_(dxUrl, sessionCookie);
        if (hop3.denied) {
          audit_(authEmail, 'dxCheckIn', false, 'redirect:' + hop3.denied);
          return json_({ ok: false, reason: 'badDxUrl', msg: 'redirect blocked' });
        }
        var attendPage = hop3.resp;
        var pageHtml = attendPage.getContentText();
        var sidMatch = pageHtml.match(/name="student_id" value="(\d+)"/);
        var studentId = sidMatch ? sidMatch[1] : '';
        if (!studentId) {
          return json_({ ok: false, msg: 'no student_id' });
        }

        // ステップ4: 出席フォームをPOST送信（これが実際の登録）
        // ★2026-09-09: 大文字のURL（HTTPS://…?TYPE=1）を通すようにしたので、
        //   ここも大文字小文字を無視する。無視しないと ?TYPE=1（下校）が
        //   読めずに既定の 0（登校）へ落ち、【下校が登校として登録される】。
        var typeMatch = dxUrl.match(/type=(\d)/i);
        var studioMatch = dxUrl.match(/studio_id=(\d)/i);
        // ★2026-09-09: ここも転送を自分で辿る（行き先を1手ごとに確かめる）。
        //   辿る挙動そのものは今までと同じなので、成功・失敗の判定は変わらない。
        var hop4 = dxFetchWithin_(dxUrl, sessionCookie, {
          method: 'post',
          payload: {
            student_id: studentId,
            type: typeMatch ? typeMatch[1] : '0',
            studio_id: studioMatch ? studioMatch[1] : '3',
            attend: '送信する'
          }
        });
        if (hop4.denied) {
          audit_(authEmail, 'dxCheckIn', false, 'redirect:' + hop4.denied);
          return json_({ ok: false, reason: 'badDxUrl', msg: 'redirect blocked' });
        }
        var submitResp = hop4.resp;
        var code = submitResp.getResponseCode();
        var ok = code >= 200 && code < 400;
        audit_(authEmail, 'dxCheckIn', ok, 'code=' + code);
        return json_({ ok: ok, code: code });
      } catch (err) {
        audit_(authEmail, 'dxCheckIn', false, 'error');
        return json_({ ok: false, msg: err.toString() });
      }
    }

    return json_({ ok: false, error: 'invalid action' });
  } catch (err) {
    // ★中身（スタックトレース等）は返さない。返すと構成が外から見える
    return json_({ ok: false, error: 'bad request' });
  }
}

// ============================================================================
// 番人（Firebase IDトークンの検証）
// ============================================================================
// 経緯: 2026-09-02／09-08 の実測で、この窓口が完全に無認証であることを確認した。
//   ・無認証の curl に HTTP 200 / application/json を返していた
//   ・getStudents が全生徒の氏名・学年・dx_email・平文パスワードを返していた
//   ・saveStudents が無認証で、sheet.clear() により名簿を丸ごと消せた
// この画面は静的サイト（GitHub Pages・PUBLICリポジトリ）から呼ばれるため、
// 「合言葉」をプログラムに埋めても一緒に公開される＝秘密にならない。
// そこで Firebase の IDトークン（署名付き・1時間で失効）を GAS 側で検証する。
// 作りは生徒ポータルの gas/coin.gs と同じ（実績のある形をそのまま使う）。

var ALLOWED_DOMAIN_ = 'yushi-kokusai.jp';

// GET でも POST でも同じ扱いにする読み取り系の action
var READ_ACTIONS_ = ['getRecs', 'getStudents', 'getAttendance', 'getPeriod2', 'getTT'];

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
  var key = 'ttg_idt_' + Utilities.base64EncodeWebSafe(
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

  var email = String(users[0].email || '').toLowerCase();
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
// 職員か生徒かの判定（2026-09-09 追加・A4-41）
// ============================================================================
// これまでの番人は「@yushi-kokusai.jp なら誰でも通す」だった。
// そのため【生徒のアカウントでも全生徒の名簿が読めて、名簿を全消しできた】。
// 職員ページの手前にある合言葉はブラウザの中だけの話で、localStorage を
// 書き換えれば素通りする。そもそも画面を経由せず窓口を直接叩けば無関係だった。
//
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

// ----------------------------------------------------------------------------
// 職員だけが叩けるアクション（★生徒には必要な分だけ通す＝最小権限）
// ----------------------------------------------------------------------------
// ここに載っていないもの（getTT / getMe / getAttendance / getPeriod2 /
// checkIn / checkOut / savePeriod2 / dxCheckIn / authStudent）は生徒も叩ける。
// ★getAttendance と getPeriod2 は生徒も叩けるが、返すのは【本人の行だけ】。
//   他人の氏名は渡さない（limitToSelf_ を見ること）。
var STAFF_ONLY_ACTIONS_ = [
  'getStudents',   // 全生徒の氏名・学年・dx_email・パスワードの有無（A4-21 そのもの）
  'saveStudents',  // 名簿の作り直し（全消しを含む）
  'getRecs',       // 全生徒の申告（氏名・学年入り）
  'saveRec',       // 申告の追加。画面に呼び元が無く、生徒は使っていない
  'deleteRec',     // 申告を1件消す
  'clearRecs',     // 申告を全部消す
  'saveTT'         // 時間割マスタの上書き
];

/**
 * 通してよいか。null なら通す。文字列なら拒否の理由。
 * ★fail close。判定できない形（role が null）は全アクション拒否。
 */
function accessDenyReason_(email, action) {
  var role = classifyRole_(email);
  if (role !== 'staff' && role !== 'student') return 'unknownAccount';
  if (role === 'staff') return null;
  if (STAFF_ONLY_ACTIONS_.indexOf(action) !== -1) return 'staffOnly';
  return null;
}

/**
 * 生徒には本人の行だけを渡す（職員はそのまま全部）。
 * ★本人が名簿に見つからなければ空を返す（安全側）。
 */
function limitToSelf_(email, rows) {
  if (classifyRole_(email) !== 'student') return rows;
  var myName = myStudentName_(email);
  if (!myName) return [];
  return rows.filter(function (r) {
    return String(r.name === null || r.name === undefined ? '' : r.name).trim() === myName;
  });
}

/**
 * 名簿から本人の氏名を引く。見つからなければ null。
 * ★突き合わせは getMe と同じ normEmail_。
 *   getMe とまとめなかったのは、あちらが返す中身（学年・曜日など）まで
 *   組み立てているため。ここは氏名だけが要る。
 */
function myStudentName_(email) {
  var me = normEmail_(email);
  var data = getOrCreateSheet(SHEET_STUDENTS).getDataRange().getValues();
  if (data.length <= 1) return null;
  var iEmail = data[0].indexOf('dx_email');
  var iName  = data[0].indexOf('name');
  if (iEmail < 0 || iName < 0) return null;
  for (var i = 1; i < data.length; i++) {
    if (normEmail_(data[i][iEmail]) === me) {
      var v = data[i][iName];
      return String(v === null || v === undefined ? '' : v).trim();
    }
  }
  return null;
}

// ============================================================================
// dxUrl（QRから読んだ行き先）の確認（2026-09-09 追加・A4-41）
// ============================================================================
// ★これが無いと何が起きるか:
//   dxCheckIn は younetDX にログインし、そのログイン済み cookie を付けて
//   dxUrl へ通信する。dxUrl は QRの窓口（別プロジェクト・認証なし）から
//   画面に降りてくる値なので、そこを差し替えられると
//   【生徒のログイン済み cookie が他所へ送られる】。
//   番人はこれを止められない（叩いているのは本物の生徒だから）。
//
// ★「文字列に you-net-dx.jp が含まれるか」では判定しないこと。それだと
//     https://evil.example/?x=you-net-dx.jp   … 通ってしまう
//     https://you-net-dx.jp.evil.example/     … 通ってしまう
//   ホストの部分を取り出して【完全一致】させる。
//   （isAllowedDomain_ で @ を厳密に見たのと同じ考え方）
// ★GAS に URL クラスは無いので、正規表現で scheme://host を切り出す。

var DX_ALLOWED_HOST_ = 'you-net-dx.jp';
var DX_MAX_REDIRECTS_ = 3;

/**
 * URL からホスト名だけを取り出す。https でない・形が違うなら null。
 * ★user@host の形（https://you-net-dx.jp@evil.example/）は null にする。
 *
 * ★大文字小文字について（2026-09-09 に緩めました）:
 *   URL のうち【スキームとホストだけ】は大文字小文字を区別しない決まりなので、
 *   比べるときだけ小文字にそろえます。HTTPS://YOU-NET-DX.JP/… は通ります。
 *   そろえてから完全一致させるので抜け道は増えません（安全性は同じ）。
 *   ここを厳しくすると、QRが大文字のURLを吐いていた場合に
 *   【生徒全員が登校できなくなる】＝得るものが無いのに失敗が重すぎます。
 * ★★パスとクエリは絶対に小文字にしないこと。?type=0 や
 *   大文字を含むパスが壊れます。小文字にするのは、この関数が切り出す
 *   【ホストの文字列だけ】。younetDX へ送るURLは受け取った原形のまま使います。
 */
function dxHostOf_(url) {
  var s = String(url === null || url === undefined ? '' : url).trim();
  var m = /^https:\/\/([^\/?#]*)/i.exec(s);    // ★i ＝ スキームの大文字を許す
  if (!m) return null;
  var host = m[1].toLowerCase();               // ★ホストだけ小文字にそろえる
  if (!host) return null;
  if (host.indexOf('@') !== -1) return null;   // https://you-net-dx.jp@evil.example/
  var c = host.indexOf(':');
  return c !== -1 ? host.slice(0, c) : host;   // ポート番号は落とす
}

/**
 * 通してよい行き先か。null なら通す。文字列なら拒否の理由。
 * ★https であること（http:// は cookie が平文で流れる）。HTTPS:// も可。
 * ★ホストは完全一致。サブドメインも通さない。
 */
function dxUrlDenyReason_(url) {
  var s = String(url === null || url === undefined ? '' : url).trim();
  if (!s) return 'noDxUrl';
  // ★i ＝ HTTPS:// も許す。http:// / javascript: / //host/ はここで落ちる
  if (!/^https:\/\//i.test(s)) return 'badScheme';
  var host = dxHostOf_(s);
  if (!host) return 'badHost';
  if (host !== DX_ALLOWED_HOST_) return 'badHost';
  return null;
}

/**
 * 転送先（Location）を、いまのURLを基準に絶対URLへ直す。
 */
function dxResolve_(base, loc) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(loc)) return loc;    // 絶対URL
  var m = /^(https:\/\/[^\/?#]+)/i.exec(base);             // ★i ＝ HTTPS:// の基準URLでも拾う
  var origin = m ? m[1] : '';
  if (loc.charAt(0) === '/') return origin + loc;          // ルート相対
  var path = base.replace(/[?#].*$/, '');                  // 相対パス
  return path.slice(0, path.lastIndexOf('/') + 1) + loc;
}

/**
 * younetDX の中だけを辿る通信（2026-09-09 追加）。
 *
 * ★UrlFetchApp の followRedirects: true をやめて、転送を自分で辿る。
 *   true のままだと、許可したホストが他所へ転送したときに
 *   Cookie ヘッダごと付いていってしまう（オープンリダイレクト）。
 *   自分で辿れば、1手ごとに行き先を確かめられる。
 * ★転送のあとは GET にする（ブラウザや followRedirects と同じ振る舞い）。
 * 返り: { resp: 応答, denied: null } または { resp: null, denied: 理由 }
 */
function dxFetchWithin_(url, cookie, opts) {
  opts = opts || {};
  var current = String(url);
  var method = opts.method || 'get';
  var payload = opts.payload || null;

  for (var hop = 0; hop <= DX_MAX_REDIRECTS_; hop++) {
    var reason = dxUrlDenyReason_(current);
    if (reason) return { resp: null, denied: reason };

    var params = {
      headers: { 'Cookie': cookie },
      followRedirects: false,
      muteHttpExceptions: true
    };
    if (method !== 'get') {
      params.method = method;
      params.payload = payload;
    }
    var resp = UrlFetchApp.fetch(current, params);
    var code = resp.getResponseCode();
    if (code < 300 || code >= 400) return { resp: resp, denied: null };

    var headers = resp.getAllHeaders() || {};
    var loc = headers['Location'];
    if (loc === undefined) loc = headers['location'];
    if (loc && typeof loc !== 'string' && loc.length) loc = loc[0];
    if (!loc) return { resp: resp, denied: null };   // 行き先が書いていない

    current = dxResolve_(current, String(loc));
    method = 'get';
    payload = null;
  }
  return { resp: null, denied: 'tooManyRedirects' };
}

function denied_(reason) {
  return json_({ error: 'unauthorized', reason: reason });
}

/**
 * 「ログインはできているが、あなたには権限が無い」。
 * ★denied_（＝ログインし直せ）と分けてある。画面は別の文言を出すこと。
 *   reason: 'staffOnly'      … 職員だけのアクションを生徒が叩いた
 *   reason: 'unknownAccount' … メールの形が生徒とも職員とも判定できない
 */
function forbidden_(reason) {
  return json_({ error: 'forbidden', reason: reason });
}

/**
 * メールアドレスの正規化（2026-09-09 追加・A4-41）。
 * 前後の空白を落とし、大文字小文字を無視できる形にそろえる。
 * ★getMe の突き合わせと、旧 authStudent がやっていた正規化を同じものにするための関数。
 *   セルに入っている値が文字列とは限らない（空セル＝''、数字など）ので String() を通す。
 */
function normEmail_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// 操作の記録（シート audit）
// ============================================================================
// いつ・誰が・何を したかを1行ずつ書き残す。
// ★書かないもの: 生徒の氏名・メールアドレス・パスワード（件数や日付だけにする）
// ★弾いたアクセス（未ログイン）は書かない。誰でも叩ける入口なので、
//   書くと外から好きなだけ行を増やせてしまう（シートが膨らむ）。
/**
 * audit シートの見出し行の面倒を見る（2026-09-09 追加）。
 *
 * ★本番の audit シートは【すでに5列で動いている】。
 *   「空のときだけ見出しを書く」ままだと、見出しの無い6列目にだけ値が入る。
 *   ここで、見出しに role が無ければ6列目に role を書き足す。
 * ★書くのは【見出し行の1マスだけ】。データ行は1行も触らない。
 * ★2回目からは何もしない（二重に足さない）。
 */
function ensureAuditHeader_(sheet) {
  // 初回＝シートが空。最初から6列で作る
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(AUDIT_HEADERS_);
    return;
  }
  // すでに行がある＝本番のシート。見出しに role があるか見る
  var lastCol = sheet.getLastColumn() || 0;
  var width = Math.max(lastCol, AUDIT_HEADERS_.length);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0] || [];
  for (var i = 0; i < header.length; i++) {
    if (String(header[i] === null || header[i] === undefined ? '' : header[i])
        .trim().toLowerCase() === 'role') {
      return;   // ★すでに6列。何もしない
    }
  }
  // ★見出し行の6列目にだけ書く
  sheet.getRange(1, AUDIT_HEADERS_.length).setValue('role');
}

function audit_(email, action, ok, note) {
  try {
    var sheet = getOrCreateSheet(SHEET_AUDIT);
    // ★見出しの面倒はここで見る（本番の5列シートに role を足す）
    ensureAuditHeader_(sheet);

    // ★2026-09-09: 職員か生徒かを残す（後から追えるように）。
    //   ・role 列（6列目）に staff / student / unknown をそのまま入れる
    //   ・note の頭の [staff] / [student] / [unknown] は【残す】。
    //     role 列が空欄の過去の行と読み方を変えないため。
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
    // ★この try を外さないこと。記録のせいで生徒の打刻が落ちるのが最悪。
  }
}

// ============================================================================
// パスワードの据え置き（2026-09-02 追加・A4-41）
// ============================================================================
// 画面から空のパスワードが届いたとき、既存の値を据え置くための関数。
// これが無いと、保存を1回押すだけで全生徒のパスワードが消える。
function keepPassword_(s, prevPw) {
  const incoming = (s.dx_password || '').toString();
  if (incoming) return incoming;                     // 入力があれば変更
  const email = (s.dx_email || '').toString().trim().toLowerCase();
  if (email && prevPw['e:' + email]) return prevPw['e:' + email];
  const name = (s.name || '').toString().trim();
  if (name && prevPw['n:' + name]) return prevPw['n:' + name];
  return '';                                          // 元から未設定
}

// ============================================================================
// 貼り付けたあとの自己診断（A4-41）
// ============================================================================
// Apps Script のエディタで、関数の一覧から「TTG_番人_自己診断」を選んで実行する。
// ★シートは書き換えません（読むだけ／audit にも書きません）。
// ★生徒の氏名・メール・パスワードはログに出しません（件数だけ）。
function TTG_番人_自己診断() {
  var out = [];

  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  out.push(apiKey
    ? 'FIREBASE_API_KEY: OK（設定されています）'
    : 'FIREBASE_API_KEY: NG ★未設定です。このままだと全部拒否されます（プロジェクトの設定→スクリプト プロパティ）');

  out.push(typeof verifyIdToken_ === 'function'
    ? '番人(verifyIdToken_): OK'
    : '番人(verifyIdToken_): NG ★貼り付けが済んでいません');

  // トークン無し・デタラメ を実際に通してみる（どちらも null になるはず）
  var noToken   = verifyIdToken_('');
  var junk      = verifyIdToken_('DEADBEEF.NOT.AREALTOKEN');
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

  // 守られているアクションの数（読み取り5＋書き込み10＝15）
  out.push('読み取り系アクション: ' + READ_ACTIONS_.length + '件（' + READ_ACTIONS_.join(', ') + '）');

  // --------------------------------------------------------------------
  // ★2026-09-09: 職員か生徒かの判定（A4-41）
  // --------------------------------------------------------------------
  // ★★生徒も職員も「s」で始まる。ここが崩れると職員が全員生徒扱いになり、
  //   名簿も時間割も誰も編集できなくなる。逆に生徒が職員になると誰も気づけない。
  var roleCases = [
    ['s26100012@yushi-kokusai.jp',  'student'],  // 1文字＋数字8桁
    ['a00000001@yushi-kokusai.jp',  'student'],
    ['s-hisho09@yushi-kokusai.jp',   'staff'],    // ★s で始まるが職員
    ['sa-sakai@yushi-kokusai.jp',   'staff'],    // ハイフン前が2文字
    ['s-hisho10@yushi-kokusai.jp',     'staff'],
    ['S-Kawata@Yushi-Kokusai.JP',   'staff'],    // 大文字混じり
    ['  s26100012@yushi-kokusai.jp  ', 'student'], // 前後の空白
    ['s2610001@yushi-kokusai.jp',   null],       // 数字7桁＝想定外
    ['s261000123@yushi-kokusai.jp', null],       // 数字9桁＝想定外
    ['26100012@yushi-kokusai.jp',   null],       // 先頭が数字
    ['kawata@yushi-kokusai.jp',     null],       // ハイフン無し＝想定外（職員に倒さない）
    ['-kawata@yushi-kokusai.jp',    null],       // ハイフンが先頭
    ['kawata-@yushi-kokusai.jp',    null],       // ハイフンが末尾
    ['s-kawata@gmail.com',          null],       // 別ドメイン
    ['s-hisho09@yushi-kokusai.jp.evil@x.com', null], // @が2つ
    ['s26100012',                   null]        // @が無い
  ];
  var roleOk = true;
  for (var k = 0; k < roleCases.length; k++) {
    if (classifyRole_(roleCases[k][0]) !== roleCases[k][1]) {
      roleOk = false;
      out.push('職員/生徒の判定 ★NG: ' + roleCases[k][0]
               + ' → ' + classifyRole_(roleCases[k][0])
               + '（' + roleCases[k][1] + ' のはず）');
    }
  }
  if (roleOk) out.push('職員/生徒の判定（' + roleCases.length + '通り）: OK');

  out.push('職員だけが叩けるアクション: ' + STAFF_ONLY_ACTIONS_.length + '件（'
           + STAFF_ONLY_ACTIONS_.join(', ') + '）');

  // 生徒が名簿を読めない／消せないことを、実際に判定器へ通して確かめる
  var stu = 's26100012@yushi-kokusai.jp';
  var stf = 's-hisho09@yushi-kokusai.jp';
  var mustDeny = ['getStudents', 'saveStudents'];
  var denyOk = true;
  for (var m = 0; m < mustDeny.length; m++) {
    if (accessDenyReason_(stu, mustDeny[m]) !== 'staffOnly') denyOk = false;
    if (accessDenyReason_(stf, mustDeny[m]) !== null) denyOk = false;
  }
  out.push(denyOk
    ? '生徒は名簿を読めない・消せない: OK（職員は通ります）'
    : '生徒は名簿を読めない・消せない: ★NG 危険です。貼り付けが古い版のままです');

  var studentMust = ['getMe', 'getTT', 'checkIn', 'checkOut', 'savePeriod2', 'dxCheckIn',
                     'getAttendance', 'getPeriod2'];
  var stuOk = true;
  for (var n = 0; n < studentMust.length; n++) {
    if (accessDenyReason_(stu, studentMust[n]) !== null) {
      stuOk = false;
      out.push('★NG: 生徒が ' + studentMust[n] + ' を使えません（登校できなくなります）');
    }
  }
  if (stuOk) out.push('生徒が使うアクション' + studentMust.length + '件: OK（通ります）');

  // 2026-09-02 の修正2点が入っているか
  out.push(typeof keepPassword_ === 'function'
    ? 'パスワード据え置き(keepPassword_): OK'
    : 'パスワード据え置き(keepPassword_): NG ★これが無いと保存1回で全員のパスワードが消えます');

  // --------------------------------------------------------------------
  // 2026-09-09（A4-41）: 二重ログインの廃止が入っているか
  // --------------------------------------------------------------------
  // doPost の中身を文字列として読んで、入れ替えが済んでいるかを見る。
  // （getMe / authStudent は関数ではなく doPost の中の分岐なので、この見方になる）
  var postSrc = '';
  try { postSrc = String(doPost); } catch (e) { postSrc = ''; }

  // ★注意書き（コメント行）にも「body.email」などと書いてあるので、
  //   コメントを外してから探す。外さないと、注意書きを読んで
  //   「まだ残っています」と誤報する（自作の検査を疑うこと）。
  var codeOnly = postSrc.split('\n').filter(function (l) {
    return l.replace(/^[\s]+/, '').indexOf('//') !== 0;
  }).join('\n');

  out.push(codeOnly.indexOf("'getMe'") !== -1
    ? 'getMe: OK（Googleログインだけで本人を割り出す窓口が入っています）'
    : 'getMe: NG ★入っていません。生徒は誰も自分の時間割を出せません（貼り付けが古い版のままです）');

  var hasPwCompare = codeOnly.indexOf('dxPw === password') !== -1
                  || codeOnly.indexOf('dxPw===password') !== -1
                  || codeOnly.indexOf('body.password') !== -1;
  out.push(!hasPwCompare
    ? 'authStudent のパスワード比較: OK（残っていません＝生徒はパスワードを打ちません）'
    : 'authStudent のパスワード比較: NG ★まだ残っています。貼り付けが古い版のままです');

  // ★dxCheckIn は残っていないといけない（登校・下校QRの本体）
  out.push(codeOnly.indexOf("'dxCheckIn'") !== -1
    ? 'dxCheckIn: OK（登校・下校QRは生きています）'
    : 'dxCheckIn: NG ★消えています。QRが動きません');

  // ★2026-09-09: なりすまし塞ぎ。本文のメールを1か所も読んでいないこと。
  //   読んでいると、ログイン済みの生徒が本文に他人のメールを書くだけで
  //   他人の登校・下校を younetDX に登録できてしまう。
  out.push(codeOnly.indexOf('body.email') === -1
    ? '本文のメールを読んでいない: OK（他人の登校は登録できません）'
    : '本文のメールを読んでいる: NG ★他人になりすませます。貼り付けが古い版のままです');

  // ★2026-09-09: QRから読んだ行き先（dxUrl）を確かめているか
  out.push(codeOnly.indexOf('dxUrlDenyReason_') !== -1
    ? 'dxUrl の行き先を確認している: OK（' + DX_ALLOWED_HOST_ + ' 以外へは送りません）'
    : 'dxUrl の行き先を確認していない: NG ★生徒のログイン済みcookieを他所へ送れます');

  // 行き先の判定を実際に通してみる（★通信はしない。文字列を見るだけ）
  var urlCases = [
    ['https://you-net-dx.jp/yushi/student/pages/attend.php?type=0&studio_id=3', null],
    ['https://you-net-dx.jp/',                       null],
    ['https://evil.example/',                        'badHost'],
    ['https://you-net-dx.jp.evil.example/',          'badHost'],
    ['https://evil.example/?x=you-net-dx.jp',        'badHost'],
    ['https://you-net-dx.jp@evil.example/',          'badHost'],
    ['https://sub.you-net-dx.jp/',                   'badHost'],
    // ★スキームとホストの大文字は通す（比べるときだけ小文字にそろえる）
    ['HTTPS://YOU-NET-DX.JP/x',                      null],
    ['Https://You-Net-Dx.JP/yushi/Attend.php?Type=1', null],
    ['http://you-net-dx.jp/',                        'badScheme'],
    ['HTTP://YOU-NET-DX.JP/',                        'badScheme'],
    ['//you-net-dx.jp/',                             'badScheme'],
    ['javascript:alert(1)',                          'badScheme'],
    ['',                                             'noDxUrl']
  ];
  var urlOk = true;
  for (var u = 0; u < urlCases.length; u++) {
    if (dxUrlDenyReason_(urlCases[u][0]) !== urlCases[u][1]) {
      urlOk = false;
      out.push('行き先の判定 ★NG: ' + (urlCases[u][0] || '(空)')
               + ' → ' + dxUrlDenyReason_(urlCases[u][0])
               + '（' + urlCases[u][1] + ' のはず）');
    }
  }
  if (urlOk) out.push('行き先の判定（' + urlCases.length + '通り）: OK');

  // --------------------------------------------------------------------
  // ★2026-09-09: audit シートの見出しに role があるか（読むだけ）
  // --------------------------------------------------------------------
  // ★ここでは getOrCreateSheet を使わない。使うとシートを作ってしまう＝書き込みになる。
  var auditSheet = null;
  try {
    auditSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUDIT);
  } catch (e) { auditSheet = null; }
  if (!auditSheet) {
    out.push('audit シート: まだありません（最初の記録のときに6列で作られます）');
  } else if (auditSheet.getLastRow() === 0) {
    out.push('audit シート: 空です（最初の記録のときに6列で作られます）');
  } else {
    var aw = Math.max(auditSheet.getLastColumn() || 0, AUDIT_HEADERS_.length);
    var ah = auditSheet.getRange(1, 1, 1, aw).getValues()[0] || [];
    var hasRole = false;
    for (var q = 0; q < ah.length; q++) {
      if (String(ah[q]).trim().toLowerCase() === 'role') hasRole = true;
    }
    out.push(hasRole
      ? 'audit シートの role 列: OK（' + Math.max(0, auditSheet.getLastRow() - 1) + '行の記録があります）'
      : 'audit シートの role 列: まだ ★次に誰かが操作した時点で見出しに足されます'
        + '（既存' + Math.max(0, auditSheet.getLastRow() - 1) + '行はそのまま。role 欄は空のままです）');
  }

  // シートの状態（件数だけ）
  var st = getOrCreateSheet(SHEET_STUDENTS);
  out.push('名簿シート students: ' + Math.max(0, st.getLastRow() - 1) + '件');

  // --------------------------------------------------------------------
  // ★締め出しの人数を先に数える（2026-09-09・A4-41）
  // --------------------------------------------------------------------
  // getMe は「番人が確かめた Google のメール」と名簿の dx_email を突き合わせる。
  // dx_email が学校の Google アカウントと違う人は、在籍していても
  // 全員 notEnrolled で締め出される（＝自分の時間割が1件も出ない）。
  // ここで貼る前に人数を出す。★メールアドレスそのものは出さない（件数だけ）。
  var sdata = st.getDataRange().getValues();
  if (sdata.length > 1) {
    var iE = sdata[0].indexOf('dx_email');
    if (iE < 0) {
      out.push('★NG: 名簿に dx_email 列がありません。getMe は誰も照合できません');
    } else {
      var nBlank = 0, nOther = 0, nSchool = 0, nDup = 0;
      var seen = {};
      for (var r = 1; r < sdata.length; r++) {
        var e2 = normEmail_(sdata[r][iE]);
        if (!e2) { nBlank++; continue; }
        if (!isAllowedDomain_(e2)) { nOther++; continue; }
        if (seen[e2]) { nDup++; } else { seen[e2] = true; }
        nSchool++;
      }
      out.push('dx_email が学校ドメイン(@' + ALLOWED_DOMAIN_ + '): ' + nSchool + '件'
               + (nSchool ? ' → この人たちは通ります' : ''));
      out.push('dx_email が空: ' + nBlank + '件' + (nBlank ? ' ★この人たちは締め出されます（notEnrolled）' : ''));
      out.push('dx_email が別ドメイン: ' + nOther + '件' + (nOther ? ' ★この人たちは締め出されます（notEnrolled）' : ''));
      if (nSchool === 0) {
        out.push('★★ 名簿の dx_email が1件も学校ドメインではありません。');
        out.push('★★ このまま貼ると【生徒全員】が「名簿にありません」になります。');
        out.push('★★ 貼る前に名簿の dx_email を学校の Google アカウントにそろえてください。');
      }
      if (nDup > 0) {
        out.push('★同じ dx_email が重複: ' + nDup + '件（getMe は先に見つかった行を返します）');
      }
    }
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}
