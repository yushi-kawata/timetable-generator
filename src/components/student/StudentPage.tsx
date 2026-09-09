import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { useAuth } from '../../hooks/auth-context';
import { PERIODS, GRADE_ROOM, SELECTABLE_PERIODS, ROOMS } from '../../types/master';
import type { DayOfWeek, Student } from '../../types/master';
import AttendancePanel from './AttendancePanel';
import PeriodSelect from './PeriodSelect';
import { TodayTimetable, WeekTimetable } from './TimetableRows';
import { dateLabel, getWeekKey, todayDow, todayStr, weekRangeLabel } from './studentDate';

/* ============================================================================
   生徒の「今日」画面（一枚の白い記録票）
   正本＝ ~/yushi-documents/意匠_時間割ツール_20260909_astra_v1.md「4」

   ★並びは 本人と日付 → 出欠 → 今日の時間割 → 授業の選択。
   ★カードで囲わない。深緑を塗るのは登校・下校ボタンだけ。
   ★2026-09-09 の意匠刷新（第1段）で組み直した。認証と通信の呼び方は変えていない。
   ============================================================================ */

/**
 * 「私は誰か」の確認の状態。
 * ★2026-09-09（台帳 A4-41）: 'forbidden' を足した。
 *   権限で断られたときに「ログインし直してください」と出すと、
 *   上の帯（ログインし直しても変わりません）と言うことが割れる。
 */
type MeStatus = 'loading' | 'ok' | 'notEnrolled' | 'forbidden' | 'error';

/** 記録票の中で開いている画面 */
type View = 'today' | 'week' | 'select';

export default function StudentPage() {
  const {
    tt, attendance, period2,
    fetchAttendance, fetchPeriod2, fetchQrData,
    getMe,
  } = useAppStore();
  const { user, logout } = useAuth();

  // ★2026-09-09 の決裁で、younetDX のメール＋パスワード入力は廃止。
  //   ここに入ってくる時点で Google ログインは済んでいる（App の入口で止めている）。
  //   誰なのかは getMe で裏側に聞く。画面はパスワードを持たないし、送らない。
  const [student, setStudent] = useState<Student | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>('loading');
  /** forbidden のときに出す文言（裏側の reason に合わせて裏方が決めたもの） */
  const [meMessage, setMeMessage] = useState('');
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [view, setView] = useState<View>('today');

  const today = todayStr();
  const dow = todayDow();
  const weekKey = getWeekKey(new Date());
  const [weekDay, setWeekDay] = useState<DayOfWeek>(dow || '月');

  useEffect(() => {
    let alive = true;

    (async () => {
      setMeStatus('loading');
      setAttendanceLoading(true);
      const me = await getMe();
      if (!alive) return;
      if (me.ok) {
        setStudent(me.student);
        setMeStatus('ok');
        setMeMessage('');
      } else {
        setStudent(null);
        setMeMessage(me.message || '');
        if (me.reason === 'notEnrolled') setMeStatus('notEnrolled');
        else if (me.reason === 'forbidden') setMeStatus('forbidden');
        else setMeStatus('error');
      }
    })();

    Promise.all([
      fetchAttendance(today),
      fetchPeriod2(weekKey),
      fetchQrData(),
    ]).finally(() => { if (alive) setAttendanceLoading(false); });

    return () => { alive = false; };
    // user が変わったら（＝別の人が入り直したら）もう一度確認する
  }, [user, getMe, fetchAttendance, fetchPeriod2, fetchQrData, today, weekKey]);

  const myAttendance = student
    ? attendance.find(a => a.date === today && a.name === student.name)
    : null;
  const isSchoolDay = !!(dow && student?.days[dow]);
  const mySelections = student
    ? (period2.find(p => p.week === weekKey && p.name === student.name)?.selections || {})
    : {};

  /** その曜日・その時限に、自分がいる教室。選択式で未選択なら '' */
  const roomOf = (day: DayOfWeek, period: number): string => {
    if (!student) return '';
    if (SELECTABLE_PERIODS.includes(period)) {
      const daySelections = mySelections[day] as Record<number, string> | undefined;
      return daySelections?.[period] || '';
    }
    if (student.classroom === 'B教室') return 'B教室';
    return GRADE_ROOM[student.grade] || '';
  };

  // ══════════════════════════════════
  // ── 私が誰かを確認している ──
  // ══════════════════════════════════
  if (meStatus === 'loading') {
    return (
      <div className="student-shell">
        <div className="sheet">
          <p role="status" className="text-[1rem] leading-6 text-[var(--ink2)] py-6 text-center">
            確認しています…
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 名簿に載っていない ──
  // ══════════════════════════════════
  if (meStatus === 'notEnrolled') {
    return (
      <div className="student-shell">
        <div className="sheet">
          <div className="sheet-heading">
            <h1 className="page-title">名簿に登録がありません</h1>
          </div>
          <div className="sheet-section">
            <p className="text-[1rem] leading-6">担当の先生にお伝えください。</p>
            <p className="mt-3 text-[0.8125rem] leading-5 text-[var(--ink2)] break-all">
              いまログインしているアカウント：{user?.email}
            </p>
            <button type="button" onClick={logout} className="control-button w-full mt-4">
              別のアカウントでログインし直す
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 権限で断られた（ログインは有効）──
  // ══════════════════════════════════
  // ★ログインし直させないこと。入り直しても結果は変わらない。
  //   ログアウトのボタンもここには置かない（ヘッダーにはある）。
  if (meStatus === 'forbidden') {
    return (
      <div className="student-shell">
        <div className="sheet">
          <div className="sheet-heading">
            <h1 className="page-title">
              {meMessage || 'このアカウントでは利用できません。先生にご連絡ください'}
            </h1>
          </div>
          <div className="sheet-section">
            <p className="text-[1rem] leading-6">
              ログインし直しても変わりません。担当の先生にお伝えください。
            </p>
            <p className="mt-3 text-[0.8125rem] leading-5 text-[var(--ink2)] break-all">
              いまログインしているアカウント：{user?.email}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 確認できなかった（ログインが切れた・通信の失敗）──
  // ══════════════════════════════════
  if (meStatus === 'error' || !student) {
    return (
      <div className="student-shell">
        <div className="sheet">
          <div className="sheet-heading">
            <h1 className="page-title">ログインし直してください</h1>
          </div>
          <div className="sheet-section">
            <p className="text-[1rem] leading-6">
              確認できませんでした。一度ログアウトして、学校のアカウントで入り直してください。
            </p>
            <button
              type="button"
              onClick={logout}
              className="control-button primary-button w-full mt-4"
            >
              ログアウトする
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 週の時間割 ──
  // ══════════════════════════════════
  if (view === 'week') {
    return (
      <div className="student-shell">
        <WeekTimetable
          tt={tt}
          selectedDay={weekDay}
          todayDow={dow}
          roomOf={roomOf}
          onSelectDay={setWeekDay}
          onBack={() => setView('today')}
        />
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 授業の選択 ──
  // ══════════════════════════════════
  if (view === 'select' && dow) {
    return (
      <div className="student-shell">
        <PeriodSelect
          tt={tt}
          day={dow}
          weekKey={weekKey}
          studentName={student.name}
          saved={mySelections}
          onBack={() => setView('today')}
        />
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 今日 ──
  // ══════════════════════════════════
  return (
    <div className="student-shell">
      <div className="sheet">
        <StudentIdentity student={student} />

        {isSchoolDay && dow ? (
          <>
            <AttendancePanel
              studentName={student.name}
              grade={student.grade}
              dxEmail={student.dx_email}
              today={today}
              loading={attendanceLoading}
              checkinTime={myAttendance?.checkinTime || ''}
              checkoutTime={myAttendance?.checkoutTime || ''}
            />
            <TodayTimetable
              tt={tt}
              day={dow}
              roomOf={roomOf}
              onOpenWeek={() => { setWeekDay(dow); setView('week'); }}
              onOpenSelect={() => setView('select')}
            />
            <SelectionSummary
              day={dow}
              weekKey={weekKey}
              roomOf={roomOf}
              subjectOf={(day, period) => {
                const room = roomOf(day, period);
                return room ? (tt[day]?.[room]?.[period] || '') : '';
              }}
              hasOptions={(day, period) => ROOMS.some(r => tt[day]?.[r]?.[period])}
              onOpenSelect={() => setView('select')}
            />
          </>
        ) : (
          <section className="sheet-section">
            <h2 className="section-title">今日は登校日ではありません</h2>
            <p className="mt-2 text-[1rem] leading-6 text-[var(--ink2)]">
              {dow ? `${dow}曜日は通学の予定がありません。` : '土曜日・日曜日は授業がありません。'}
            </p>
            <button
              type="button"
              className="control-button w-full mt-4"
              onClick={() => { setWeekDay(dow || '月'); setView('week'); }}
            >
              週の時間割を見る
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── 本人と日付 ─────────────────────────────────────────────────────── */

function StudentIdentity({ student }: { student: Student }) {
  return (
    <div className="sheet-heading">
      <p className="text-[0.75rem] leading-[1.125rem] text-[var(--ink2)]">
        勇志国際高等学校 福岡学習センター
      </p>
      <p className="mt-2 text-[1.125rem] leading-[1.625rem] font-bold text-[var(--ink)] break-words">
        {student.name}さん
        <span className="ml-2 text-[1rem] leading-6 font-normal text-[var(--ink2)] whitespace-nowrap">
          {student.grade}{student.classroom === 'B教室' ? '・B教室' : ''}
        </span>
      </p>
      <h1 className="page-title numeric mt-1">{dateLabel()}</h1>
    </div>
  );
}

/* ── 授業の選択（今日ぶんのまとめ）───────────────────────────────────── */

function SelectionSummary({ day, weekKey, roomOf, subjectOf, hasOptions, onOpenSelect }: {
  day: DayOfWeek;
  weekKey: string;
  roomOf: (day: DayOfWeek, period: number) => string;
  subjectOf: (day: DayOfWeek, period: number) => string;
  hasOptions: (day: DayOfWeek, period: number) => boolean;
  onOpenSelect: () => void;
}) {
  const targets = SELECTABLE_PERIODS.filter(p => hasOptions(day, p));
  if (targets.length === 0) return null;
  const unselected = targets.filter(p => !roomOf(day, p));

  return (
    <section className="sheet-section" aria-labelledby="selection-heading">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="selection-heading" className="section-title">授業の選択</h2>
        <button
          type="button"
          onClick={onOpenSelect}
          className="text-[0.875rem] leading-5 font-bold text-[var(--accent)] underline underline-offset-2"
        >
          {unselected.length > 0 ? '選ぶ →' : '変更する →'}
        </button>
      </div>
      <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--ink2)]">
        対象週：<span className="numeric">{weekRangeLabel(weekKey)}</span>（{day}曜日）
      </p>
      {unselected.length > 0 && (
        <p className="mt-2 text-[0.875rem] leading-5 font-bold text-[var(--warning)]">
          {unselected.map(p => PERIODS[p].label).join('・')}が未選択です
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {targets.map(p => {
          const room = roomOf(day, p);
          return (
            <li key={p} className="text-[0.875rem] leading-5 text-[var(--ink)] break-words">
              <span className="text-[var(--ink2)]">{PERIODS[p].label}：</span>
              {room ? `${subjectOf(day, p)}（${room}）` : '未選択'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
