/* ==========================================================================
   教室のiPadの「外枠」ページ
   --------------------------------------------------------------------------
   ★このページ自体は、ほとんど何もしません。
     登校・下校のページと座席表のページを、2枚の枠（iframe）に並べて、
     見せる方を切り替えるだけです。

   ★★なぜ枠を2枚に分けるのか
     2つのページは、同じ名前の入れ物をいくつか持っています。
     中身を1枚に載せると、名前を奪い合って両方おかしくなります。
     枠を分ければ、それぞれが自分の世界を持つので、ぶつかりません。
     ★そして何より、2つのページを1バイトも直さずに済みます。

   ★このファイルは public/ にあります。ここに書いた注記は【そのまま配信されます】
     （src/ と違い、ビルドで落ちません）。校内の呼び名や管理番号を書かないこと。

   ★★合い言葉をこのファイルに書かないこと。
     このページは、自分が開かれたURLの「#」から受け取って、
     座席表の枠へ渡すだけです。端末にも保存しません。
   ========================================================================== */
(function (root) {
  'use strict';

  /* ── 決まった数（★ここだけ見れば分かる）──────────────────────── */

  /**
   * 何も触られないままこの時間が過ぎたら、登校・下校に戻す。
   * ★次に来た生徒が、前の人の残した画面を見ないようにするためです。
   * ★長すぎると意味が薄れ、短すぎると座席表を見ている途中で戻ります。
   */
  var IDLE_BACK_MS = 90 * 1000;
  /** 上の時間が過ぎたかを見張る間隔 */
  var TICK_MS = 5 * 1000;

  var VIEW_QR = 'qr';
  var VIEW_SEATS = 'seats';

  /* ── ここから：画面を触らない部分（試験が直接叩く）─────────────── */

  /** 「#」を外して、中身だけを取り出す。★中身は1文字も変えません */
  function hashPayload(hash) {
    var t = String(hash === null || hash === undefined ? '' : hash);
    if (t.charAt(0) === '#') t = t.slice(1);
    return t;
  }

  /**
   * 座席表の枠に入れるURLを組み立てる。
   * ★受け取った中身を、そのまま後ろに付けます。
   *   向こうは決まった形で読むので、並べ替えたり直したりしてはいけません。
   * ★中身が無いときは、何も付けずに渡します。
   *   すると向こうが「設定がされていません」と出します。
   *   ★ここで独自のお知らせを作らないこと（二重に出ると分かりにくくなります）。
   */
  function classroomSrc(hash) {
    var payload = hashPayload(hash);
    return payload ? ('classroom.html#' + payload) : 'classroom.html';
  }

  /**
   * 登校・下校の枠に入れるURL。
   * ★★受け取った中身は【渡しません】。向こうは要らないからです。
   *   渡さなければ、そちらへ回り込む道がそもそもできません。
   */
  function qrSrc() {
    return 'qr.html';
  }

  var api = {
    IDLE_BACK_MS: IDLE_BACK_MS,
    TICK_MS: TICK_MS,
    VIEW_QR: VIEW_QR,
    VIEW_SEATS: VIEW_SEATS,
    hashPayload: hashPayload,
    classroomSrc: classroomSrc,
    qrSrc: qrSrc,
    /** ★試験から見張りを1回だけ回すための入口（ブラウザでは使わない） */
    _tickForTest: null,
    /** ★試験から時計を差し替えるための入口（ブラウザでは使わない） */
    _setNowForTest: null,
  };

  root.KioskCore = api;

  /* ── ここから下：画面を触る部分（ブラウザでだけ動く）─────────────── */

  if (typeof document === 'undefined') return;

  var elQr, elSeats, elTabQr, elTabSeats;
  var current = VIEW_QR;
  var lastTouchAt = 0;

  /** いまの時刻。★試験から差し替えられるようにしてあります */
  var nowFn = function () { return new Date(); };

  function markTab(el, on) {
    if (!el) return;
    el.className = on ? 'tab is-on' : 'tab';
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  }

  /**
   * 見せる方を切り替える。
   * ★枠は消しません（隠すだけ）。消すと読み直しになり、
   *   切り替えるたびに窓口を叩くことになります。
   *   隠している間も、それぞれが自分で取り直しを続けます。
   */
  function show(view) {
    current = view;
    lastTouchAt = nowFn().getTime();
    var isQr = view === VIEW_QR;
    if (elQr) elQr.hidden = !isQr;
    if (elSeats) elSeats.hidden = isQr;
    markTab(elTabQr, isQr);
    markTab(elTabSeats, !isQr);
  }

  function tick() {
    // ★登校・下校を見ているときは、戻す先が無いので何もしません
    if (current === VIEW_QR) return;
    if (nowFn().getTime() - lastTouchAt >= IDLE_BACK_MS) show(VIEW_QR);
  }

  api._tickForTest = tick;
  api._setNowForTest = function (fn) { nowFn = fn; };

  function start() {
    elQr = document.getElementById('qrFrame');
    elSeats = document.getElementById('seatsFrame');
    elTabQr = document.getElementById('tabQr');
    elTabSeats = document.getElementById('tabSeats');

    // ★2枚とも、最初に1回だけ読み込みます（切り替えでは読み直しません）
    if (elQr) elQr.src = qrSrc();
    if (elSeats) elSeats.src = classroomSrc(window.location.hash);

    if (elTabQr) elTabQr.addEventListener('click', function () { show(VIEW_QR); });
    if (elTabSeats) elTabSeats.addEventListener('click', function () { show(VIEW_SEATS); });

    // ★最初に出すのは登校・下校（全員が1日に2回使うため）
    show(VIEW_QR);

    setInterval(tick, TICK_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
