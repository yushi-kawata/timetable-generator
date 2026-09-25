/* ============================================================================
   教室の座席表（独立ページ）の中身 ── 2026-09-24
   ============================================================================

   ★★このファイルは【そのまま公開されます】（view-source で誰でも読めます）。
     src/ の中と違って、ビルドで注記が落ちません。public/ に置いたものは
     1文字も削られずに配られます。
     ★校内の管理番号・役職名・担当の呼び名・ローカルのファイル位置を
       書かないこと。説明は書いてよい（中身の話は残す）。

   ★★このファイルは【React の画面とは何のつながりもありません】。
     ・Firebase を読み込みません（ログインの仕組みがそもそも載っていません）
     ・ビルドを通りません（public/ に置いた素のファイルがそのまま配られます）
     ・src/ のどのファイルも import しません
     ★ここに import を書き足さないこと。書いた瞬間に「素のファイル」でなくなります。

   ★なぜ React の #/seats/classroom を使わないのか
     あちらは iPad で出ない不具合が未解決です（症状も未確定）。同じ道を通すと、
     出なかったときに【アプリ側の問題か端末側の問題かを切り分けられません】。
     このページは別の道なので、出なければ端末側、出れば元の道の問題、と分かれます。
     ★#/seats/classroom は消しません。並べて置きます。

   ★このページに置かないもの（意図的に1つもありません）
     ・<a> と <button>（押して出られる先を作らない）
     ・ログインの仕組み（そもそも持たない）
     ・合い言葉（★ソースに書かない。URL から受け取るだけ）

   ★試験（tests/classroomStandalone.test.mjs）はこのファイルを直接読み込みます。
     判断するところは【画面を触らない純粋な関数】に分けてあります。
   ========================================================================== */

(function (root) {
  'use strict';

  /* ── 決まった数（★ここだけ見れば間隔が分かる）──────────────────── */

  /**
   * 何も触らずにこの時間が過ぎたら画面を伏せる。
   * ★決定事項・当面そのまま（2026-09-24 に「残す」と決まっています）。
   *   ★実際に教室に置いてみて短すぎるようなら、この数字を延ばせます
   *     （例: 5分にするなら 5 * 60 * 1000）。試験も一緒に直すこと。
   */
  var MASK_IDLE_MS = 60 * 1000;
  /** うまく取れているときに取り直す間隔 */
  var RELOAD_MS = 10 * 60 * 1000;
  /** 取れなかったときに取り直す間隔 */
  var RETRY_MS = 60 * 1000;
  /** 時計と「伏せるまで」を見張る間隔 */
  var TICK_MS = 15 * 1000;

  /**
   * ★窓口URLとして通してよい形。
   *   デプロイ済みの /exec だけ。/dev も、別のドメインも通しません。
   *   ★これが無いと、URL を書き換えるだけで【このページを好きな相手に
   *     繋ぎ替えられます】（学校の画面に、外から用意した中身を出せてしまう）。
   *   ★src/lib/gasUrl.ts と同じ形にしてあります。
   */
  var GAS_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

  /** 窓口の名前。★サーバー側（GAS）の CLASSROOM_ACTION_ と合わせること */
  var ACTION = 'classroomSeats';

  /* ── ここから：画面を触らない部分（試験が直接叩く）───────────────── */

  function isAllowedGasUrl(value) {
    return typeof value === 'string' && GAS_URL_RE.test(value.trim());
  }

  /**
   * ブックマークの URL（ハッシュ）から、窓口URLと合い言葉を取り出す。
   *
   * ★★なぜ「?」ではなく「#」に入れるのか
   *   「?」以降はサーバー（GitHub Pages）に送られ、向こうの記録に残ります。
   *   「#」以降は【送られません】。合い言葉を余計な場所に残さないためです。
   *
   * 形: #u=<窓口URL>&k=<合い言葉>
   *
   * @returns {ok:true, url, token} または {ok:false, reason}
   */
  function parseBookmark(hash) {
    var t = String(hash === null || hash === undefined ? '' : hash);
    if (t.charAt(0) === '#') t = t.slice(1);
    if (!t) return { ok: false, reason: 'noHash' };

    var params = new URLSearchParams(t);
    var url = (params.get('u') || '').trim();
    var token = (params.get('k') || '').trim();

    if (!url && !token) return { ok: false, reason: 'noHash' };
    if (!url) return { ok: false, reason: 'noUrl' };
    // ★ここを緩めないこと。緩めると、このページを別の相手に繋ぎ替えられます
    if (!isAllowedGasUrl(url)) return { ok: false, reason: 'badUrl' };
    if (!token) return { ok: false, reason: 'noToken' };

    return { ok: true, url: url, token: token };
  }

  /** 窓口を叩く URL を作る。★合い言葉は encodeURIComponent を通す */
  function requestUrl(url, token) {
    return url + '?action=' + encodeURIComponent(ACTION) + '&k=' + encodeURIComponent(token);
  }

  /**
   * 受け取った中身が、約束どおりの形かを確かめる。
   * ★形が違うものを黙って描かない（古い窓口・別の窓口に当たったときに気づくため）。
   */
  function normalize(json) {
    if (!json || typeof json !== 'object') return { ok: false, reason: 'badShape' };
    if (json.error === 'notFound') return { ok: false, reason: 'notFound' };
    if (json.error) return { ok: false, reason: 'unavailable' };

    var grid = json.grid;
    if (!grid || typeof grid !== 'object') return { ok: false, reason: 'badShape' };
    var rows = Number(grid.rows);
    var cols = Number(grid.cols);
    if (!(rows > 0) || !(cols > 0)) return { ok: false, reason: 'badShape' };
    if (!Array.isArray(json.seats)) return { ok: false, reason: 'badShape' };
    // ★いつの座席表か分からないものは出さない（古い画面を新しいと誤認させないため）
    if (!json.asof) return { ok: false, reason: 'noAsof' };

    return {
      ok: true,
      open: json.open === true,
      room: String(json.room || ''),
      day: String(json.day || ''),
      dateLabel: String(json.dateLabel || ''),
      weekdayLabel: String(json.weekdayLabel || ''),
      nextDay: String(json.nextDay || ''),
      nextDateLabel: String(json.nextDateLabel || ''),
      rows: rows,
      cols: cols,
      seats: json.seats,
      unknownCount: Number(json.unknownCount) || 0,
      asof: String(json.asof),
    };
  }

  /**
   * 席の一覧を、教室の形（行×列）に並べ直す。
   *
   * ★黙って落とさないこと。
   *   ・教室の外を指している席   → outside に数える（空席に見せない）
   *   ・同じ席に2人               → overlaps に控える（先の人を消さない）
   *   どちらも画面に小さく出します。
   */
  function buildGrid(view) {
    var cells = [];
    for (var r = 0; r < view.rows; r++) {
      var line = [];
      for (var c = 0; c < view.cols; c++) line.push('');
      cells.push(line);
    }
    var outside = 0;
    var overlaps = [];

    for (var i = 0; i < view.seats.length; i++) {
      var s = view.seats[i] || {};
      var row = Number(s.row);
      var col = Number(s.col);
      var name = String(s.name === null || s.name === undefined ? '' : s.name);
      if (!(row >= 1 && row <= view.rows) || !(col >= 1 && col <= view.cols)) {
        outside = outside + 1;
        continue;
      }
      if (cells[row - 1][col - 1] !== '') {
        // ★先に入れた人を消さない。あとの人は名前を控えて画面に出す
        overlaps.push(name);
        continue;
      }
      cells[row - 1][col - 1] = name;
    }
    return { cells: cells, outside: outside, overlaps: overlaps };
  }

  /** 画面に出す「取れなかった理由」。★決まり文句だけ（中の作りを出さない） */
  function failureText(reason) {
    if (reason === 'noHash' || reason === 'noUrl' || reason === 'noToken') {
      return { title: '設定がされていません', hint: 'この iPad のブックマークを作り直してください' };
    }
    if (reason === 'badUrl') {
      return { title: '窓口の指定が正しくありません', hint: 'ブックマークを作り直してください' };
    }
    if (reason === 'notFound') {
      return { title: '合い言葉が使えなくなっています', hint: 'ブックマークを作り直してください' };
    }
    if (reason === 'noAsof' || reason === 'badShape') {
      return { title: '受け取った形が想定と違います', hint: '先生にご連絡ください' };
    }
    if (reason === 'unavailable') {
      return { title: '座席表を読み取れませんでした', hint: '時間をおいて自動でやり直します' };
    }
    return { title: '座席表を取得できませんでした', hint: '時間をおいて自動でやり直します' };
  }

  /** 「8:40」の形にする */
  function hhmm(d) {
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  var api = {
    MASK_IDLE_MS: MASK_IDLE_MS,
    RELOAD_MS: RELOAD_MS,
    RETRY_MS: RETRY_MS,
    TICK_MS: TICK_MS,
    ACTION: ACTION,
    isAllowedGasUrl: isAllowedGasUrl,
    parseBookmark: parseBookmark,
    requestUrl: requestUrl,
    normalize: normalize,
    buildGrid: buildGrid,
    failureText: failureText,
    hhmm: hhmm,
  };

  root.ClassroomCore = api;

  /* ── ここから下：画面を触る部分（ブラウザでだけ動く）──────────────── */

  if (typeof document === 'undefined') return;

  var elGrid, elRoom, elDay, elAsof, elNotice, elClosed, elMask, elFail, elClock;
  var bookmark = null;
  var failedLast = false;
  var lastLoadAt = 0;
  var lastTouchAt = Date.now();

  function text(el, value) {
    // ★innerHTML を使わない。氏名がそのまま HTML として解釈されないように
    el.textContent = value;
  }

  function show(el, on) {
    el.style.display = on ? '' : 'none';
  }

  function renderFailure(reason) {
    var f = failureText(reason);
    show(elGrid, false);
    show(elClosed, false);
    show(elFail, true);
    text(elFail.querySelector('.fail-title'), f.title);
    text(elFail.querySelector('.fail-hint'), f.hint);
    text(elDay, '');
    text(elAsof, '');
    text(elNotice, '');
  }

  function renderView(view) {
    show(elFail, false);
    text(elRoom, view.room);
    text(elAsof, view.asof ? (view.asof.slice(11, 16) + ' 時点') : '');

    if (!view.open) {
      show(elGrid, false);
      show(elClosed, true);
      text(elDay, view.dateLabel + '（' + view.weekdayLabel + '）');
      text(
        elClosed.querySelector('.closed-next'),
        view.nextDateLabel
          ? ('次の登校日は ' + view.nextDateLabel + '（' + view.nextDay + '曜日）です')
          : '',
      );
      text(elNotice, '');
      return;
    }

    show(elClosed, false);
    show(elGrid, true);
    text(elDay, view.dateLabel + '（' + view.weekdayLabel + '）');

    var built = buildGrid(view);
    // ★innerHTML は1箇所も使いません（氏名が HTML として解釈される道を残さない）。
    //   空にするのも子を外す形でやります。試験がソースを読んで見張っています。
    while (elGrid.firstChild) elGrid.removeChild(elGrid.firstChild);
    elGrid.style.gridTemplateColumns = 'repeat(' + view.cols + ', 1fr)';
    for (var r = 0; r < built.cells.length; r++) {
      for (var c = 0; c < built.cells[r].length; c++) {
        var cell = document.createElement('div');
        var name = built.cells[r][c];
        cell.className = name ? 'seat seat-taken' : 'seat seat-empty';
        text(cell, name);
        elGrid.appendChild(cell);
      }
    }

    // ★黙って捨てない。おかしなものがあれば小さく出す
    var notes = [];
    if (view.unknownCount > 0) notes.push('名簿に無い席が ' + view.unknownCount + ' 件');
    if (built.outside > 0) notes.push('教室の外を指す席が ' + built.outside + ' 件');
    if (built.overlaps.length > 0) notes.push('席が重なっています（' + built.overlaps.length + ' 件）');
    text(elNotice, notes.join('／'));
  }

  function load() {
    lastLoadAt = Date.now();
    if (!bookmark || !bookmark.ok) {
      failedLast = true;
      renderFailure(bookmark ? bookmark.reason : 'noHash');
      return;
    }
    // ★資格情報を送らない（Cookie を付けない）。合い言葉だけで通る窓口です
    fetch(requestUrl(bookmark.url, bookmark.token), {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('http');
        return res.json();
      })
      .then(function (json) {
        var view = normalize(json);
        if (!view.ok) {
          failedLast = true;
          renderFailure(view.reason);
          return;
        }
        failedLast = false;
        renderView(view);
      })
      .catch(function () {
        failedLast = true;
        renderFailure('network');
      });
  }

  function tick() {
    var now = Date.now();
    text(elClock, hhmm(new Date()));

    // ★伏せる（決定事項・当面そのまま残す）
    if (now - lastTouchAt >= MASK_IDLE_MS) show(elMask, true);

    var due = failedLast ? RETRY_MS : RELOAD_MS;
    if (now - lastLoadAt >= due) load();
  }

  function wake() {
    lastTouchAt = Date.now();
    show(elMask, false);
  }

  function start() {
    elGrid = document.getElementById('grid');
    elRoom = document.getElementById('room');
    elDay = document.getElementById('day');
    elAsof = document.getElementById('asof');
    elNotice = document.getElementById('notice');
    elClosed = document.getElementById('closed');
    elMask = document.getElementById('mask');
    elFail = document.getElementById('fail');
    elClock = document.getElementById('clock');

    bookmark = parseBookmark(window.location.hash);

    // ────────────────────────────────────────────────────────────────────
    // ★★ここで URL の「#」以降を消してはいけません（2026-09-25・実機で確定）
    //
    // 【前にやっていたこと】
    //   読み込みに成功した直後に、履歴を差し替えて「#」以降を消し、
    //   合い言葉がアドレス欄に残らないようにしていました。
    //   そこにはこう書いてありました——「ブックマーク自体は残るので、
    //   次に開いたときも同じように動きます」。★これが誤りでした。
    //
    // 【それで何が壊れたか】★iPad で実際に起きました
    //   1. QR で「#…」付きの URL を開く      → 座席表が出る（ここまでは動く）
    //   2. その画面のまま「ホーム画面に追加」 → 追加できる
    //   3. ★ホーム画面のアイコンから開き直す → ★「設定がされていません」
    //
    //   ＝「ホーム画面に追加」で保存されるのは【いまアドレス欄にある URL】です。
    //     消したあとに追加するので、合い言葉の無い URL が保存されていました。
    //     合い言葉の控えはこの中の変数だけなので、開き直すと何も残っていません。
    //   ★iOS では「開いてから追加」しかできないので、この順序は避けられません。
    //
    // 【なぜ消さなくてよいか】
    //   消す目的（合い言葉をアドレス欄に見せない）は、
    //   ★「ホーム画面に追加」して起動すれば【アドレス欄そのものが出ない】ので、
    //     そちらで達成されます。
    //   ＝守りが二重にかかって、肝心の起動経路のほうを壊していました。
    //
    // 【承知のうえで受け入れたこと】
    //   ★Safari で（ホーム画面からではなく）ふつうに開くと、
    //     アドレス欄に合い言葉が見えます。それを承知でこうしています。
    //   ★だから手順書は「ホーム画面に追加」を勧めています。
    //
    // 【この形を採らなかった案】
    //   合い言葉を端末に控えておいて「#」を消す案は採りませんでした。
    //   ★iOS では「ホーム画面のアプリ」と Safari で保存場所が分かれるため、
    //     Safari で保存してもホーム画面から起動したときに読めない見込みで、
    //     確かめずに入れると「直したつもりで直っていない」になります。
    //
    // ★★消し忘れではありません。ここに履歴の差し替えを書き戻さないでください。
    //   書き戻すと、ホーム画面のアイコンがまた動かなくなります。
    //   試験（tests/classroomStandalone.test.mjs）が見張っています。
    // ────────────────────────────────────────────────────────────────────

    ['touchstart', 'mousedown', 'keydown'].forEach(function (name) {
      window.addEventListener(name, wake, { passive: true });
    });

    load();
    setInterval(tick, TICK_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
