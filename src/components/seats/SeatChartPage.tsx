// ============================================================================
// 教室の座席表（台帳 A4-107）── 福岡GC A教室（2年）
// ============================================================================
// この画面が守っていること:
//  1. 出すのは【氏名】と【座席の位置】だけ。学年・コース・メール・パスワード・
//     要配慮情報・学籍番号は1つも出さない（形をそろえる段階で落としている）。
//  2. いつのデータかを必ず出す（asof）。取れなかったら【前のデータを出し続けない】。
//  3. しばらく触らなければ伏せる（氏名を描かない）。教室の iPad は他の人からも見える。
//  4. 既定は閲覧だけ。席を動かすのは、明示的に編集へ切り替えたときだけ。
//  5. ★押すまで保存されない。未保存の変更があることを画面に出す。
//  6. ★席は曜日ごとに別。保存も「その曜日の分」だけ送る。
//  7. ★決まりごと（固定席・禁止席・引き離し）に反していたら、赤くして名指しで出す。
//  8. ★自動配置は押すたびに別の案を出す（もとの「水曜日①②」の代わり）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayOfWeek } from '../../types/master';
import { SEAT_MASK_IDLE_MS, buildSeatGrid, moveSeat, weekdayOf } from '../../lib/seatChart';
import type { Seat, SeatChart } from '../../lib/seatChart';
import { autoAssign, checkSoftWishes, countConstraints, findViolations } from '../../lib/seatAssign';
import type { SeatConstraints, Violation } from '../../lib/seatAssign';
import { fetchSeatChart, saveSeating } from '../../lib/seatChartApi';
import type { SeatChartFetch } from '../../lib/seatChartApi';
import SeatGridView from './SeatGridView';
import SeatPlanHeader from './SeatPlanHeader';
import ConstraintDraft from './ConstraintDraft';
// ★この画面の意匠はここ1枚にまとめてある（index.css には入れない）
import './seat-plan.css';

/** 対象の教室。★他の学習センター・他教室には広げない（社長決裁 C-5） */
const ROOM_NAME = 'A教室（2年）';

/**
 * 伏せるまでの時間。★本番の値は lib/seatChart.ts の SEAT_MASK_IDLE_MS 1か所だけ。
 *   ?seatMaskMs=3000 は【開発サーバーでの動作確認用】で、本番のビルドでは効きません
 *   （import.meta.env.DEV が false に畳まれるため）。5分待たずに確かめるために置いています。
 */
function maskDelayMs(search: string): number {
  if (import.meta.env.DEV) {
    const v = Number(new URLSearchParams(search).get('seatMaskMs'));
    if (Number.isFinite(v) && v >= 500) return v;
  }
  return SEAT_MASK_IDLE_MS;
}

function hhmm(d: Date): string {
  const p2 = (x: number) => String(x).padStart(2, '0');
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

const EMPTY_BY_DAY: Record<DayOfWeek, Seat[]> = { 月: [], 火: [], 水: [], 木: [], 金: [] };

type Failure = { message: string; hint: string };
type Notice = { kind: 'ok' | 'warn' | 'error'; lines: string[] };

export default function SeatChartPage() {
  const [chart, setChart] = useState<SeatChart | null>(null);
  const [constraints, setConstraints] = useState<SeatConstraints | null>(null);
  /** 読み取れなかった決まりごとの知らせ（★黙って捨てない） */
  const [ruleIssues, setRuleIssues] = useState<string[]>([]);
  const [showDraft, setShowDraft] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState('');

  const [day, setDay] = useState<DayOfWeek>(() => weekdayOf(new Date()) ?? '月');
  const [editing, setEditing] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** 曜日ごとの「まだ保存していない並び」。★保存に成功したら消す */
  const [draft, setDraft] = useState<Partial<Record<DayOfWeek, Seat[]>>>({});
  const [reloadArmed, setReloadArmed] = useState(false);
  const [masked, setMasked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 自動配置の種。押すたびに増やして別の案を出す */
  const [seed, setSeed] = useState(1);

  const dirtyDays = Object.keys(draft) as DayOfWeek[];
  const dirty = dirtyDays.length > 0;
  const dayDirty = draft[day] !== undefined;

  const apply = useCallback((r: SeatChartFetch) => {
    setDraft({});
    setPickedId(null);
    setReloadArmed(false);
    setNotice(null);
    if (r.ok) {
      setChart(r.chart);
      setConstraints(r.constraints);
      setRuleIssues(r.constraintIssues);
      setDemo(r.demo);
      setFailure(null);
      setFetchedAt(hhmm(new Date()));
    } else {
      // ★黙って古い表を出し続けない（新しいものだと誤認させないため）
      setChart(null);
      setConstraints(null);
      setRuleIssues([]);
      setDemo(false);
      setFetchedAt('');
      setFailure({ message: r.message, hint: r.hint });
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    apply(await fetchSeatChart(window.location.search));
  }, [apply]);

  // ★開いたときに1回だけ取りに行く。描画の途中で state を書き換えない
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchSeatChart(window.location.search);
      if (alive) apply(r);
    })();
    return () => {
      alive = false;
    };
  }, [apply]);

  // ── しばらく触らなければ伏せる ────────────────────────────────────
  useEffect(() => {
    if (masked) return;
    const delay = maskDelayMs(window.location.search);
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMasked(true), delay);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    arm();
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
  }, [masked]);

  /** 教室の広さ。★窓口の grid が正本（無ければ控えの値。そのときは画面に出す） */
  const room = chart?.grid ?? { rows: 4, cols: 7 };
  const roomLabel = room.rows + '行 × ' + room.cols + '列';

  const savedByDay = chart?.seatsByDay ?? EMPTY_BY_DAY;
  const seats = useMemo(() => draft[day] ?? savedByDay[day] ?? [], [draft, day, savedByDay]);

  const grid = useMemo(
    () =>
      chart
        ? buildSeatGrid(
            { students: chart.students, seats, rows: room.rows, cols: room.cols },
            day,
          )
        : null,
    [chart, seats, day, room.rows, room.cols],
  );

  /** 学籍番号 → 氏名（★画面に番号を出さないための引き当て） */
  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of chart?.students ?? []) m[s.student_id] = s.name;
    return m;
  }, [chart]);

  const attendees = useMemo(
    () => (chart?.students ?? []).filter((s) => s.days[day]).map((s) => s.student_id),
    [chart, day],
  );

  /** 決まりごとに反しているところ（★閲覧中も出す。名簿が変われば崩れるため） */
  const violations: Violation[] = useMemo(() => {
    if (!chart || !constraints) return [];
    return findViolations({ placed: seats, constraints, attendees, names });
  }, [chart, constraints, seats, attendees, names]);

  const violatedCells = useMemo(() => {
    const set = new Set<string>();
    for (const v of violations) for (const c of v.cells) set.add(c.row + '/' + c.col);
    return set;
  }, [violations]);

  /** 【希望】がいまの並びでどれだけ叶っているか（★違反ではないので赤くしない） */
  const soft = useMemo(() => {
    if (!chart || !constraints) return null;
    return checkSoftWishes({ placed: seats, constraints, attendees, names, cols: room.cols });
  }, [chart, constraints, seats, attendees, names, room.cols]);

  const fixedCells = useMemo(() => {
    const set = new Set<string>();
    for (const f of constraints?.fixed ?? []) {
      if (attendees.includes(f.student_id)) set.add(f.row + '/' + f.col);
    }
    return set;
  }, [constraints, attendees]);

  const setDayDraft = (next: Seat[]) => setDraft((d) => ({ ...d, [day]: next }));

  const handleReload = () => {
    // 保存していない並びがあるなら、1回では消さない（2回押させる）
    if (dirty && !reloadArmed) {
      setReloadArmed(true);
      return;
    }
    void load();
  };

  const handleUnmask = () => {
    setMasked(false);
    // 伏せていたあいだにデータが古くなっている。未保存が無ければ取り直す
    if (!dirty) void load();
  };

  const handlePickCell = (row: number, col: number) => {
    if (!pickedId) return;
    setDayDraft(moveSeat(seats, pickedId, { row, col }));
    setPickedId(null);
  };

  /** ★押すたびに別の案を出す（種を1つ進める） */
  const handleAutoAssign = () => {
    if (!chart || !constraints) return;
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    const r = autoAssign({
      attendees,
      constraints,
      rows: room.rows,
      cols: room.cols,
      names,
      avoid: seats,
      seed: nextSeed,
    });
    if (!r.ok) {
      // ★「配置できませんでした」だけで終わらせない。どれが衝突しているかを名指しする
      setNotice({
        kind: 'error',
        lines: [
          r.kind === 'contradiction'
            ? '決まりごと同士が食い違っています。'
            : r.kind === 'timeout'
              ? '時間内に並べ方を見つけられませんでした。'
              : 'この決まりごとでは並べられませんでした。',
          ...r.reasons,
        ],
      });
      return;
    }
    setDayDraft(r.seats);
    setPickedId(null);
    const lines = [
      day + '曜日の案を作りました（' + r.seats.length + ' 人・前の並びから ' + r.moved +
        ' 人が移動）。',
      'もう一度押すと別の案が出ます。まだ保存していません。',
    ];
    // ★叶わなかった希望は黙って捨てず、必ず添える
    if (r.soft.nearTotal > 0) {
      lines.push('近づけたい：' + r.soft.nearMet + ' / ' + r.soft.nearTotal + ' 組');
    }
    for (const m of r.soft.nearUnmetMessages) lines.push('・' + m);
    if (r.soft.rightTotal > 0) {
      lines.push('右寄せ：' + r.soft.rightMet + ' / ' + r.soft.rightTotal + ' 人');
    }
    setNotice({ kind: r.soft.nearUnmetMessages.length > 0 ? 'warn' : 'ok', lines });
  };

  const handleSave = async () => {
    if (!chart || saving) return;
    setSaving(true);
    setNotice(null);
    const r = await saveSeating(day, seats);
    setSaving(false);
    if (!r.ok) {
      setNotice({ kind: 'error', lines: [r.message, r.hint] });
      return;
    }
    // 保存できた分だけ下書きから外す（他の曜日の未保存は残す）
    setDraft((d) => {
      const next = { ...d };
      delete next[day];
      return next;
    });
    setNotice({ kind: 'ok', lines: [day + '曜日の並びを保存しました。'] });
  };

  const pickedName = chart?.students.find((s) => s.student_id === pickedId)?.name ?? '';

  return (
    <div>
      {/* ── 見出しと、いつのデータか ───────────────────────────── */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="page-title">教室の座席表</h2>
            <p className="text-sm text-[var(--ink3)] mt-1">
              福岡GC {ROOM_NAME}（{roomLabel}＝{room.rows * room.cols}席）
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="control-button" onClick={handleReload}>
              {reloadArmed ? '未保存を捨てて取り直す' : '最新にする'}
            </button>
            <button
              type="button"
              className={editing ? 'control-button primary-button' : 'control-button'}
              aria-pressed={editing}
              onClick={() => {
                setEditing((v) => !v);
                setPickedId(null);
              }}
            >
              {editing ? '編集をやめる' : '座席を編集'}
            </button>
          </div>
        </div>

        {/* ★いつのデータかは必ず出す（古い表を新しいと誤認させないため） */}
        <p className="text-sm text-[var(--ink2)] mt-4 numeric">
          {chart
            ? 'このデータ：' + chart.asof + ' 時点' + (fetchedAt ? '（' + fetchedAt + ' に取得）' : '')
            : 'このデータ：—'}
        </p>

        {/* ★押すまで保存されないことを、押す前から見えるようにする */}
        {dirty && (
          <div className="seat-note seat-note--warn mt-3">
            <strong>まだ保存していません。</strong>
            <span className="block mt-1">
              未保存の曜日：{dirtyDays.join('・')}。
              「この曜日を保存」を押すまで、この端末の中だけの並びです。
            </span>
          </div>
        )}
        {/* ★決まりごとの件数を必ず出す。0件が「指定なし」なのか「読めていない」のかを
            見分けられるようにするため（黙って効かなくなるのを防ぐ） */}
        {constraints && (
          <p className="text-sm text-[var(--ink3)] mt-2">
            決まりごと：<span className="numeric">{countConstraints(constraints)}</span> 件
            （固定席 {constraints.fixed.length}／禁止席 {constraints.forbidden.length}／
            引き離し {constraints.apart.length}／近づけたい {constraints.near.length}／
            右寄せ {constraints.rightward.length}）
          </p>
        )}
        {ruleIssues.length > 0 && (
          <div role="alert" className="seat-note seat-note--error mt-3">
            {ruleIssues.map((m, i) => (
              <span key={i} className="block">{m}</span>
            ))}
          </div>
        )}
        {chart && !chart.gridProvided && (
          <p className="seat-note seat-note--warn mt-3">
            窓口から教室の広さが返っていないので、控えの値（{roomLabel}）で描いています。
            実際の教室と違う場合は、席がはみ出して見えることがあります。
          </p>
        )}
        {demo && (
          <p className="seat-note seat-note--warn mt-3">
            ★これは見本データです（窓口がまだ本番に入っていません）。実際の名簿ではありません。
          </p>
        )}
      </div>

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="card">
        {loading && <p className="text-sm text-[var(--ink3)]">読み込み中...</p>}

        {!loading && failure && (
          <div role="alert" className="seat-note seat-note--error">
            <strong>{failure.message}</strong>
            <span className="block mt-1">{failure.hint}</span>
            <span className="block mt-1">
              前の座席表は消しました（古いものを表示し続けないためです）。
            </span>
          </div>
        )}

        {!loading && !failure && masked && (
          <button type="button" className="seat-mask" onClick={handleUnmask}>
            <span className="seat-mask-title">画面を伏せています</span>
            <span className="text-sm">画面にふれると座席表が出ます</span>
          </button>
        )}

        {!loading && !failure && !masked && grid && (
          <>
            {/* ── 平面図（見出し帯＋並び）─────────────────────── */}
            <section className="seat-plan">
              <SeatPlanHeader day={day} room={ROOM_NAME} onSelectDay={(d) => {
                setDay(d);
                setPickedId(null);
                setNotice(null);
              }} />
              <SeatGridView
                grid={grid}
                editing={editing}
                pickedId={pickedId}
                violatedCells={violatedCells}
                fixedCells={fixedCells}
                onPickStudent={setPickedId}
                onPickCell={handlePickCell}
              />
              <footer className="seat-plan-foot">
                <span>
                  {day}曜日に登校：<strong className="numeric">{grid.attendingCount}</strong> 人
                  {' / '}
                  <span className="numeric">{room.rows * room.cols}</span> 席
                </span>
                {dayDirty && <span className="seat-plan-foot-flag">未保存</span>}
              </footer>
            </section>

            {/* ── 決まりごとに反しているところ ─────────────────── */}
            {violations.length > 0 && (
              <div role="alert" className="seat-note seat-note--error mt-4">
                <strong>決まりごとに反しています（赤い席）。</strong>
                <ul className="mt-1 list-disc pl-5">
                  {violations.map((v, i) => (
                    <li key={i}>{v.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {soft && soft.nearUnmetMessages.length > 0 && (
              <div className="seat-note seat-note--info mt-4">
                <strong>
                  できる限りの希望（近づけたい）が {soft.nearMet} / {soft.nearTotal} 組です。
                </strong>
                <span className="block mt-1">
                  ★これは決まりごと違反ではありません。欠席や固定席との兼ね合いで叶わない日があります。
                </span>
                <ul className="mt-1 list-disc pl-5">
                  {soft.nearUnmetMessages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {grid.conflicts.length > 0 && (
              <p className="seat-note seat-note--error mt-4">
                同じ席に2人以上が登録されています（
                {grid.conflicts
                  .map((c) => c.row + '列目' + c.col + '番：' + c.kept + ' と ' + c.hidden)
                  .join('／')}
                ）。あとの人は表に出せていません。名簿を確かめてください。
              </p>
            )}
            {grid.orphans.length > 0 && (
              <p className="seat-note seat-note--warn mt-4">
                名簿に無い学籍番号の席が {grid.orphans.length} 件あります（
                {grid.orphans.map((o) => o.row + '列目' + o.col + '番').join('・')}
                ）。表では「？」で出しています。
              </p>
            )}
            {grid.outOfRoom && (
              <p className="seat-note seat-note--error mt-4">
                教室の広さ（{roomLabel}）に収まらない席があります。はみ出した分も表に出しています。
              </p>
            )}

            {/* ── 編集の操作 ───────────────────────────────────── */}
            {editing && (
              <div className="seat-tools mt-4">
                <div className="seat-tools-row">
                  <button type="button" className="control-button primary-button" onClick={handleAutoAssign}>
                    {dayDirty ? '別の案を出す' : 'この曜日を自動で並べる'}
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={handleSave}
                    disabled={!dayDirty || saving}
                  >
                    {saving ? '保存しています...' : 'この曜日を保存'}
                  </button>
                  {dayDirty && (
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => {
                        setDraft((d) => {
                          const next = { ...d };
                          delete next[day];
                          return next;
                        });
                        setPickedId(null);
                        setNotice(null);
                      }}
                    >
                      この曜日を元に戻す
                    </button>
                  )}
                </div>
                <p className="seat-tools-hint">
                  {pickedId
                    ? '「' + pickedName + '」を選んでいます。移したい席を押してください。'
                    : '動かしたい人を押し、次に移したい席を押してください。'}
                </p>
                <div className="seat-tools-row mt-3">
                  <button
                    type="button"
                    className="control-button"
                    aria-expanded={showDraft}
                    onClick={() => setShowDraft((v) => !v)}
                  >
                    {showDraft ? '決まりごとの下書きを閉じる' : '決まりごとの下書きを作る'}
                  </button>
                </div>
              </div>
            )}

            {editing && showDraft && chart && (
              <ConstraintDraft students={chart.students} rows={room.rows} cols={room.cols} />
            )}

            {notice && (
              <div
                className={
                  notice.kind === 'error'
                    ? 'seat-note seat-note--error mt-4'
                    : notice.kind === 'warn'
                      ? 'seat-note seat-note--warn mt-4'
                      : 'seat-note seat-note--ok mt-4'
                }
                role={notice.kind === 'error' ? 'alert' : undefined}
              >
                {notice.lines.map((line, i) => (
                  <span key={i} className={i === 0 ? 'font-bold block' : 'block mt-1'}>
                    {line}
                  </span>
                ))}
              </div>
            )}

            {/* ── 席が決まっていない人 ─────────────────────────── */}
            {grid.unseated.length > 0 && (
              <div className="mt-6">
                <div className="card-title">席が決まっていない人</div>
                <div className="flex flex-wrap gap-2">
                  {grid.unseated.map((s) =>
                    editing ? (
                      <button
                        key={s.student_id}
                        type="button"
                        className={
                          pickedId === s.student_id
                            ? 'control-button primary-button'
                            : 'control-button'
                        }
                        aria-pressed={pickedId === s.student_id}
                        onClick={() => setPickedId(s.student_id)}
                      >
                        {s.name}
                      </button>
                    ) : (
                      <span key={s.student_id} className="control-button">
                        {s.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
