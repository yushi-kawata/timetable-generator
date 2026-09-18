// ============================================================================
// 座席表の【教室表示モード】── 台帳 A4-119
// ============================================================================
// 教室の iPad に置きっぱなしにして、毎朝そのまま見るための画面です。
// 社長決裁（2026-09-18・5件）:
//   (1) 作る
//   (2) 入口は【専用のURL】（#/seats/classroom）。★画面上に切り替えを置かない
//   (3) ★見るだけ。席は動かせない
//   (4) ★1分で伏せる（通常の座席表は5分のまま。定数は別）
//   (5) iPad のアクセスガイドの暗証番号を知るのは社長のみ
//
// ★★この画面だけでは守れません。
//   座席表は職員専用なので、職員アカウントで入れたまま置くことになります。
//   生徒が「戻る」を押したり URL を打ち替えたりすれば、名簿（氏名・メール・
//   パスワードの有無）・時間割マスタ（全消しも可能）・出欠・生徒コインに届きます。
//   ＝【iPad 側のアクセスガイドで Safari から出られなくして、初めて成立します】。
//   この画面がしているのは「出口を1つも描かない」ことだけです。
//
// ★★この画面には操作子（ボタン・リンク・入力欄）を1つも置きません。
//   ・他の画面へ行く道を出さない（戻る・他のモードへの入口・ヘッダーの操作子）
//   ・編集・保存・自動配置を出さない（見るだけ）
//   ・伏せた画面を戻すのも「ふれる」だけ（押す部品を置かない）
//   ★ここに <button> や <a> を足さないこと。試験（tests/classroomSeats.test.mjs）が
//     ソースを読んで落とします。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLASSROOM_MASK_IDLE_MS,
  CLASSROOM_RELOAD_MS,
  CLASSROOM_RETRY_MS,
  CLASSROOM_TICK_MS,
  SEAT_ROOM_NAME,
  buildSeatGrid,
  classroomToday,
} from '../../lib/seatChart';
import type { SeatChart } from '../../lib/seatChart';
import { fetchSeatChart } from '../../lib/seatChartApi';
import type { SeatChartFetch } from '../../lib/seatChartApi';
import SeatGridView from './SeatGridView';
// ★席の意匠は通常の座席表と共通（seat-plan.css）。この画面ぶんの枠だけ別に持つ
import './seat-plan.css';
import './classroom-view.css';

/**
 * 動作確認のための上書き。
 * ★本番のビルドでは常に null（import.meta.env.DEV が false に畳まれる）。
 *   1分・10分を待たずに確かめるため、開発サーバーでだけ効きます。
 */
function devParam(search: string, key: string): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(search).get(key);
}

function devMs(search: string, key: string, fallback: number): number {
  const v = Number(devParam(search, key));
  if (Number.isFinite(v) && v >= 200) return v;
  return fallback;
}

/** ★開発サーバーでだけ、今日の日付を差し替える（土日の出方を確かめるため） */
function devDate(search: string, now: Date): Date {
  const v = devParam(search, 'classroomDate');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  if (!m) return now;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function hhmm(d: Date): string {
  const p2 = (x: number) => String(x).padStart(2, '0');
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

type Failure = { message: string; hint: string };

/**
 * ★編集のための受け口。この画面では【1つも使いません】。
 *   SeatGridView は通常の座席表と共通の部品なので、編集用の引数を必ず求めます。
 *   ここでは空の集合と「何もしない関数」を渡し、editing={false} で描きます
 *   ＝押せる部品（button）は1つも生まれません。
 */
const EMPTY_CELLS: Set<string> = new Set();
function noop() {}

export default function ClassroomSeatView() {
  const search = window.location.search;
  const maskMs = devMs(search, 'classroomMaskMs', CLASSROOM_MASK_IDLE_MS);
  const reloadMs = devMs(search, 'classroomReloadMs', CLASSROOM_RELOAD_MS);
  const retryMs = devMs(search, 'classroomRetryMs', CLASSROOM_RETRY_MS);
  const tickMs = devMs(search, 'classroomTickMs', CLASSROOM_TICK_MS);

  const [chart, setChart] = useState<SeatChart | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [demo, setDemo] = useState(false);
  const [fetchedAt, setFetchedAt] = useState('');
  const [masked, setMasked] = useState(false);
  /** いまの時刻。★日付が変わったら曜日も変わるので、時計を持つ */
  const [now, setNow] = useState(() => new Date());

  /** ★取りに行った結果を画面に移す。取りに行くところとは分けてある */
  const failedRef = useRef(false);
  const lastLoadRef = useRef(0);

  const apply = useCallback((r: SeatChartFetch) => {
    if (r.ok) {
      setChart(r.chart);
      setDemo(r.demo);
      setFailure(null);
      setFetchedAt(hhmm(new Date()));
      failedRef.current = false;
    } else {
      // ★古い座席表を出し続けない（新しいものだと誤認させないため）
      setChart(null);
      setDemo(false);
      setFetchedAt('');
      setFailure({ message: r.message, hint: r.hint });
      failedRef.current = true;
    }
  }, []);

  // ── 開いたときに1回だけ取りに行く ───────────────────────────────
  useEffect(() => {
    if (classroomToday(devDate(search, new Date())).kind !== 'class') return;
    let alive = true;
    lastLoadRef.current = Date.now();
    void (async () => {
      const r = await fetchSeatChart(window.location.search);
      if (alive) apply(r);
    })();
    return () => {
      alive = false;
    };
  }, [apply, search]);

  // ── 時計。★この画面には操作子が無い＝人は読み直せない。時計が読み直す ──
  //   ・日付が変わったら曜日も変わる（金曜の夜から土曜へ、など）
  //   ・取れているときは CLASSROOM_RELOAD_MS ごと
  //   ・失敗しているときは CLASSROOM_RETRY_MS ごと（誰も押し直せないため）
  useEffect(() => {
    let alive = true;
    const id = window.setInterval(() => {
      const at = new Date();
      setNow(at);
      if (classroomToday(devDate(search, at)).kind !== 'class') return;  // 土日は取りに行かない
      const due = failedRef.current ? retryMs : reloadMs;
      if (Date.now() - lastLoadRef.current < due) return;
      lastLoadRef.current = Date.now();
      // ★ここを短く書き直さないこと。取りに行く処理を効果の本体に直接置くと、
      //   「効果の中で state を直している」と見なされる（lint の指摘）。
      void (async () => {
        const r = await fetchSeatChart(window.location.search);
        if (alive) apply(r);
      })();
    }, tickMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [apply, search, tickMs, reloadMs, retryMs]);

  const today = useMemo(() => classroomToday(devDate(search, now)), [now, search]);

  // ── ★日付が変わって「授業のある日」でなくなったら、持っている氏名を捨てる。
  //   （描いていなくても、端末の中に持ち続ける理由が無い）
  //   ★React の「描くときに前の値と比べて state を直す」書き方。
  //     効果（useEffect）の中で state を直すと描き直しが1回増えるため、こちらで行う。
  const [prevKind, setPrevKind] = useState(today.kind);
  if (prevKind !== today.kind) {
    setPrevKind(today.kind);
    if (today.kind !== 'class') {
      setChart(null);
      setFailure(null);
      setFetchedAt('');
    }
  }

  // ── しばらく触らなければ伏せる（★1分）──────────────────────
  //   ★伏せている間も、ふれれば戻ります。押す部品は置きません。
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setMasked(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMasked(true), maskMs);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    wake();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, [maskMs]);

  const room = chart?.grid ?? { rows: 4, cols: 7 };
  const day = today.kind === 'class' ? today.day : null;

  const grid = useMemo(() => {
    if (!chart || !day) return null;
    return buildSeatGrid(
      {
        students: chart.students,
        seats: chart.seatsByDay[day] ?? [],
        rows: room.rows,
        cols: room.cols,
      },
      day,
    );
  }, [chart, day, room.rows, room.cols]);

  const reloadMin = Math.max(1, Math.round(reloadMs / 60000));
  const retryMin = Math.max(1, Math.round(retryMs / 60000));

  return (
    <div className="classroom">
      {/* ── 見出し。★操作子ではない（押しても何も起きない）───────── */}
      <header className="classroom-head">
        <div className="classroom-head-left">
          <span className="classroom-room">福岡GC {SEAT_ROOM_NAME}</span>
          <span className="classroom-title">座席表</span>
        </div>
        <div className="classroom-head-right">
          <span className="classroom-date numeric">
            {today.dateLabel}（{today.weekdayLabel}）
          </span>
          {/* ★いつのデータかを必ず出す（自動で読み直すので、なおさら要る） */}
          <span className="classroom-asof numeric">
            {chart
              ? 'このデータ：' + chart.asof + ' 時点' +
                (fetchedAt ? '（' + fetchedAt + ' に取得）' : '')
              : 'このデータ：—'}
          </span>
        </div>
      </header>

      <div className="classroom-body">
        {/* ── 月〜金でない日（★黙って月曜を出さない）───────────── */}
        {today.kind === 'offday' && (
          <div className="classroom-panel">
            <span className="classroom-panel-title">今日は授業がありません</span>
            <span className="classroom-panel-line">
              {today.dateLabel}（{today.weekdayLabel}）は月〜金ではないため、座席表は出していません。
            </span>
            <span className="classroom-panel-line">
              次の登校日は {today.nextDateLabel}（{today.nextDay}）です。
            </span>
          </div>
        )}

        {/* ── 伏せている間（★氏名は描かない。隠すのではなく出さない）── */}
        {today.kind === 'class' && masked && (
          <div className="classroom-mask">
            <span className="classroom-mask-title">画面を伏せています</span>
            <span className="classroom-mask-note">画面にふれると座席表が出ます</span>
          </div>
        )}

        {today.kind === 'class' && !masked && (
          <>
            {!chart && !failure && (
              <div className="classroom-panel">
                <span className="classroom-panel-line">読み込み中...</span>
              </div>
            )}

            {failure && (
              <div className="classroom-panel classroom-panel--error" role="alert">
                <span className="classroom-panel-title">{failure.message}</span>
                <span className="classroom-panel-line">{failure.hint}</span>
                {/* ★古いものを出し続けない。消したことを言う */}
                <span className="classroom-panel-line">
                  前の座席表は消しました（古いものを表示し続けないためです）。
                </span>
                <span className="classroom-panel-line">
                  {retryMin}分ごとに自動でやり直します。直らないときは先生にお知らせください。
                </span>
              </div>
            )}

            {grid && (
              <section className="classroom-plan">
                {/* ★曜日は【今日の曜日】。選び直す操作子は置かない */}
                <div className="classroom-day-band">
                  {/* ★教卓＝部屋の向き（どちらが前か）を図で示す面。
                      通常の座席表と同じく左に置く。★押せる部品ではない。
                      これが無いと、離れた席から見たときに前後が分からない。 */}
                  <div className="seat-desk classroom-desk" aria-label="教卓（教室の前）">
                    <span className="seat-desk-label">教卓</span>
                  </div>
                  <span className="classroom-day">{day}曜日</span>
                  <span className="classroom-day-note">
                    {day}曜日に登校 <span className="numeric">{grid.attendingCount}</span> 人 /
                    <span className="numeric"> {room.rows * room.cols}</span> 席
                  </span>
                </div>

                <SeatGridView
                  grid={grid}
                  editing={false}
                  pickedId={null}
                  violatedCells={EMPTY_CELLS}
                  fixedCells={EMPTY_CELLS}
                  onPickStudent={noop}
                  onPickCell={noop}
                />

                {grid.unseated.length > 0 && (
                  <div className="classroom-unseated">
                    <span className="classroom-unseated-title">席が決まっていない人</span>
                    <span className="classroom-unseated-names">
                      {grid.unseated.map((s) => s.name).join('・')}
                    </span>
                  </div>
                )}

                {/* ★人が表に出せていないときは、その場で言う（数だけにしない） */}
                {grid.conflicts.length > 0 && (
                  <div className="classroom-foot-note" role="alert">
                    同じ席に2人以上が登録されています（
                    {grid.conflicts
                      .map((c) => c.row + '列目' + c.col + '番：' + c.kept + ' と ' + c.hidden)
                      .join('／')}
                    ）。あとの人は表に出せていません。
                  </div>
                )}

                <div className="classroom-foot">
                  <span>{reloadMin}分ごとに自動で読み直します</span>
                  {demo && <span className="classroom-foot-warn">★見本データです</span>}
                  {chart && !chart.gridProvided && (
                    <span className="classroom-foot-warn">
                      教室の広さが窓口から返っていません（控えの値で描いています）
                    </span>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
