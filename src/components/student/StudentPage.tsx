import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { useAuth } from '../../hooks/auth-context';
import { DAYS, DAY_ICONS, ROOMS, PERIODS, GRADE_ROOM, SELECTABLE_PERIODS } from '../../types/master';
import type { DayOfWeek, Student, TimetableTemplate } from '../../types/master';

const DAY_STYLES: Record<DayOfWeek, { header: string; gradient: string }> = {
  月: { header: 'bg-gradient-to-r from-purple-600 to-purple-500', gradient: 'from-purple-50 to-white' },
  火: { header: 'bg-gradient-to-r from-amber-600 to-amber-500', gradient: 'from-amber-50 to-white' },
  水: { header: 'bg-gradient-to-r from-teal-600 to-teal-500', gradient: 'from-teal-50 to-white' },
  木: { header: 'bg-gradient-to-r from-blue-600 to-blue-500', gradient: 'from-blue-50 to-white' },
  金: { header: 'bg-gradient-to-r from-pink-600 to-pink-500', gradient: 'from-pink-50 to-white' },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDow(): DayOfWeek | null {
  const map: (DayOfWeek | null)[] = [null, '月', '火', '水', '木', '金', null];
  return map[new Date().getDay()];
}

function todayLabel(): string {
  const d = new Date();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${dow}）`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 「私は誰か」の確認の状態。
 * ★2026-09-09（台帳 A4-41）: 'forbidden' を足した。
 *   権限で断られたときに「ログインし直してください」と出すと、
 *   上の帯（ログインし直しても変わりません）と言うことが割れる。
 */
type MeStatus = 'loading' | 'ok' | 'notEnrolled' | 'forbidden' | 'error';

export default function StudentPage() {
  const {
    tt, attendance, period2, qrData,
    fetchAttendance, fetchPeriod2, fetchQrData,
    checkIn, checkOut, savePeriod2,
    getMe, dxCheckIn,
  } = useAppStore();
  const { user, logout } = useAuth();

  // ★2026-09-09 の決裁で、younetDX のメール＋パスワード入力は廃止。
  //   ここに入ってくる時点で Google ログインは済んでいる（App の入口で止めている）。
  //   誰なのかは getMe で裏側に聞く。画面はパスワードを持たないし、送らない。
  const [student, setStudent] = useState<Student | null>(null);
  const [meStatus, setMeStatus] = useState<MeStatus>('loading');
  /** forbidden のときに出す文言（裏側の reason に合わせて裏方が決めたもの） */
  const [meMessage, setMeMessage] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState(false);
  const [dxResult, setDxResult] = useState<'none' | 'ok' | 'fail'>('none');
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const today = todayStr();
  const dow = todayDow();
  const weekKey = getWeekKey(new Date());

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

  const myAttendance = student ? attendance.find(a => a.date === today && a.name === student.name) : null;
  const checkedIn = !!myAttendance;
  const checkedOut = !!(myAttendance?.checkoutTime);

  const isSchoolDay = dow && student?.days[dow];

  const getRoom = (period: number): string => {
    if (!student || !dow) return '';
    if (SELECTABLE_PERIODS.includes(period)) {
      const p2 = period2.find(p => p.week === weekKey && p.name === student.name);
      const daySelections = p2?.selections[dow];
      return (daySelections as Record<number, string>)?.[period] || '';
    }
    if (student.classroom === 'B教室') return 'B教室';
    return GRADE_ROOM[student.grade] || '';
  };

  const handleCheckIn = async () => {
    if (!student || !dow || checkInLoading) return;
    setCheckInLoading(true);
    setDxResult('none');
    const saved = await checkIn(student.name, student.grade, today, nowTime());
    if (!saved) {
      // 拒否された。ここで「登校しました」を出すと嘘になる（帯に理由が出ている）
      setDxResult('fail');
      setCheckInLoading(false);
      return;
    }
    if (qrData?.tokou_url && student.dx_email) {
      const ok = await dxCheckIn(student.dx_email, qrData.tokou_url);
      setDxResult(ok ? 'ok' : 'fail');
    } else {
      setDxResult('ok');
    }
    setCheckInLoading(false);
  };

  const handleCheckOut = async () => {
    if (!student || checkOutLoading) return;
    setCheckOutLoading(true);
    setDxResult('none');
    const saved = await checkOut(student.name, today, nowTime());
    if (!saved) {
      setDxResult('fail');
      setCheckOutLoading(false);
      return;
    }
    if (qrData?.gekou_url && student.dx_email) {
      const ok = await dxCheckIn(student.dx_email, qrData.gekou_url);
      setDxResult(ok ? 'ok' : 'fail');
    } else {
      setDxResult('ok');
    }
    setCheckOutLoading(false);
  };

  const handlePeriodSelect = async (period: number, room: string) => {
    if (!dow || !student) return;
    const existing = period2.find(p => p.week === weekKey && p.name === student.name);
    const daySelections = { ...((existing?.selections[dow] || {}) as Record<number, string>), [period]: room };
    if (!room) delete daySelections[period];
    const selections = { ...existing?.selections, [dow]: daySelections };
    await savePeriod2(weekKey, student.name, selections);
  };

  const getPeriodOptions = (period: number) => {
    if (!dow) return [];
    return ROOMS.map(room => ({
      room,
      subject: tt[dow]?.[room]?.[period] || '',
    })).filter(o => o.subject);
  };

  // ══════════════════════════════════
  // ── 私が誰かを確認している ──
  // ══════════════════════════════════
  if (meStatus === 'loading') {
    return (
      <div className="card shadow-lg shadow-stone-200/50">
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--ink3)]">
          <span className="inline-block w-5 h-5 border-2 border-stone-300 border-t-[var(--accent)] rounded-full animate-spin" />
          確認しています...
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 名簿に載っていない ──
  // ══════════════════════════════════
  if (meStatus === 'notEnrolled') {
    return (
      <div className="space-y-5">
        <div className="card shadow-lg shadow-stone-200/50">
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-bold text-[var(--ink)]">名簿に登録がありません。担当の先生にお伝えください</div>
            <div className="text-xs text-[var(--ink3)] mt-3 leading-relaxed break-all">
              いまログインしているアカウント：{user?.email}
            </div>
            <button
              onClick={logout}
              className="mt-6 px-5 py-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--surface2)] text-sm font-bold text-[var(--ink2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
            >
              別のアカウントでログインし直す
            </button>
          </div>
        </div>
        <WeeklyTimetablePreview tt={tt} />
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
      <div className="card shadow-lg shadow-stone-200/50">
        <div className="text-center py-8">
          <div className="text-4xl mb-3" aria-hidden="true">🚫</div>
          <div className="font-bold text-[var(--ink)]">
            {meMessage || 'このアカウントでは利用できません。先生にご連絡ください'}
          </div>
          <div className="text-xs text-[var(--ink3)] mt-2 leading-relaxed">
            ログインし直しても変わりません。担当の先生にお伝えください。
          </div>
          <div className="text-xs text-[var(--ink3)] mt-3 leading-relaxed break-all">
            いまログインしているアカウント：{user?.email}
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
      <div className="card shadow-lg shadow-stone-200/50">
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🔑</div>
          <div className="font-bold text-[var(--ink)]">ログインし直してください</div>
          <div className="text-xs text-[var(--ink3)] mt-2 leading-relaxed">
            確認できませんでした。一度ログアウトして、学校のアカウントで入り直してください。
          </div>
          <button
            onClick={logout}
            className="mt-6 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-blue-800 transition-all"
          >
            ログアウトする
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 休日 / 登校日でない ──
  // ══════════════════════════════════
  if (!dow) {
    return (
      <div className="space-y-5">
        <div className="card shadow-lg shadow-stone-200/50">
          <StudentHeader student={student} onLogout={logout} />
          <div className="text-center py-10 text-[var(--ink3)]">
            <div className="text-4xl mb-3">🌙</div>
            <div className="font-bold">今日は休日です</div>
            <div className="text-xs mt-1">ゆっくり休んでください</div>
          </div>
        </div>
        <WeeklyTimetablePreview tt={tt} />
      </div>
    );
  }

  if (!isSchoolDay) {
    return (
      <div className="space-y-5">
        <div className="card shadow-lg shadow-stone-200/50">
          <StudentHeader student={student} onLogout={logout} />
          <div className="text-center py-10 text-[var(--ink3)]">
            <div className="text-4xl mb-3">🏠</div>
            <div className="font-bold">{dow}曜日は登校日ではありません</div>
          </div>
        </div>
        <WeeklyTimetablePreview tt={tt} />
      </div>
    );
  }

  // ══════════════════════════════════
  // ── メイン画面 ──
  // ══════════════════════════════════
  return (
    <div className="space-y-5">
      {/* ヘッダーカード */}
      <div className="card shadow-lg shadow-stone-200/50 !pb-5">
        <StudentHeader student={student} onLogout={logout} />

        {/* 出席アクション */}
        <div className="mt-5 space-y-3">
          {attendanceLoading ? (
            <div className="text-center py-4 text-[var(--ink3)] text-sm">出席状況を確認中...</div>
          ) : (
            <>
              {/* 登校 */}
              {!checkedIn ? (
                <button
                  onClick={handleCheckIn}
                  disabled={checkInLoading}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-base hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-60 shadow-md shadow-blue-200"
                >
                  {checkInLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      younetDXに出席登録中...
                    </span>
                  ) : '登校しました'}
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 rounded-xl border border-emerald-200">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm shrink-0">✓</div>
                  <div>
                    <div className="text-sm font-bold text-emerald-700">登校済み</div>
                    <div className="text-xs text-emerald-600">{myAttendance?.checkinTime || ''} に登校を記録しました</div>
                  </div>
                </div>
              )}

              {/* 下校 */}
              {!checkedOut ? (
                <button
                  onClick={handleCheckOut}
                  disabled={checkOutLoading}
                  className="w-full py-3 bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-xl font-bold text-sm hover:from-rose-600 hover:to-red-600 transition-all disabled:opacity-60 shadow-md shadow-rose-200"
                >
                  {checkOutLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      younetDXに下校登録中...
                    </span>
                  ) : '下校する'}
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-[var(--surface2)] px-4 py-3 rounded-xl border border-[var(--border)]">
                  <div className="w-8 h-8 rounded-full bg-[var(--ink3)] flex items-center justify-center text-white text-sm shrink-0">✓</div>
                  <div>
                    <div className="text-sm font-bold text-[var(--ink2)]">下校済み</div>
                    <div className="text-xs text-[var(--ink3)]">{myAttendance?.checkoutTime || ''} に下校を記録しました</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* DXステータス */}
        {dxResult === 'ok' && (
          <div className="mt-3 text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
            younetDXにも出席を登録しました
          </div>
        )}
        {dxResult === 'fail' && (
          <div className="mt-3 text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            younetDXの出席登録に失敗しました（手動で登録してください）
          </div>
        )}
      </div>

      {/* 今日の時間割 */}
      <div className="card shadow-lg shadow-stone-200/50">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="card-title !mb-0">今日の時間割</div>
            <div className="text-sm font-bold text-[var(--ink)] mt-1">{todayLabel()}</div>
          </div>
          <div className={`text-xs font-bold text-white px-3 py-1 rounded-full whitespace-nowrap ${DAY_STYLES[dow].header}`}>
            {DAY_ICONS[dow]} {dow}曜日
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
          {/* SHR */}
          <div className={`grid grid-cols-[72px_1fr] bg-gradient-to-r ${DAY_STYLES[dow].gradient}`}>
            <div className="p-2.5 text-center border-r border-[var(--border)] flex flex-col items-center justify-center bg-white/50">
              <span className="text-xs font-bold text-[var(--ink2)]">SHR</span>
              <span className="font-mono text-[9px] text-[var(--ink3)]">9:20</span>
            </div>
            <div className="p-3 flex items-center">
              <div className="text-sm font-semibold text-[var(--ink2)]">ホームルーム</div>
            </div>
          </div>
          {/* 1〜5限 */}
          {[1, 2, 3, 4, 5].map((i) => {
            const p = PERIODS[i];
            const room = getRoom(i);
            const subj = room ? (tt[dow]?.[room]?.[i] || '—') : '';
            const isSelectable = SELECTABLE_PERIODS.includes(i);
            const needsSelection = isSelectable && !room;
            const options = isSelectable ? getPeriodOptions(i) : [];

            return (
              <div key={i} className={`grid grid-cols-[72px_1fr] border-t border-[var(--border)] transition-colors ${needsSelection ? 'bg-amber-50' : 'hover:bg-[var(--surface2)]'}`}>
                <div className="p-2.5 text-center border-r border-[var(--border)] flex flex-col items-center justify-center bg-white/50">
                  <span className="text-xs font-bold text-[var(--ink2)]">{p.label}</span>
                  <span className="font-mono text-[9px] text-[var(--ink3)]">{p.time.split('〜')[0]}</span>
                </div>
                <div className="p-3 flex flex-col justify-center min-w-0">
                  {needsSelection ? (
                    <div>
                      <div className="text-xs font-bold text-amber-600 mb-2">{i}限目の教室を選んでください</div>
                      <div className="flex gap-2 flex-wrap">
                        {options.map(o => (
                          <button
                            key={o.room}
                            onClick={() => handlePeriodSelect(i, o.room)}
                            className="px-3 py-1.5 rounded-lg border-2 border-[var(--border)] bg-white text-xs font-bold hover:border-[var(--accent)] hover:bg-blue-50 hover:shadow-sm transition-all"
                          >
                            {o.room.replace('教室', '').replace('（', '(').replace('）', ')')} {o.subject}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold break-words">{subj}</div>
                      <div className="text-[11px] text-[var(--ink3)]">
                        {room}
                        {isSelectable && room && (
                          <button
                            onClick={() => handlePeriodSelect(i, '')}
                            className="ml-2 text-[var(--accent)] hover:underline"
                          >
                            変更
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── サブコンポーネント ── */

const DAY_BG: Record<DayOfWeek, string> = {
  月: 'bg-purple-700',
  火: 'bg-amber-700',
  水: 'bg-teal-700',
  木: 'bg-blue-700',
  金: 'bg-pink-700',
};

const ROOM_SHORT: Record<string, string> = {
  'A教室（2年）': 'A(2年)',
  'C教室（3年）': 'C(3年)',
  'D教室（1年）': 'D(1年)',
  'B教室': 'B教室',
};

function WeeklyTimetablePreview({ tt }: { tt: TimetableTemplate }) {
  return (
    <div className="card shadow-lg shadow-stone-200/50">
      <div className="card-title text-center">1週間の時間割</div>
      <div className="overflow-x-auto -mx-2">
        <table className="text-[10px] border-collapse min-w-[700px] w-full">
          <thead>
            {/* 曜日ヘッダー */}
            <tr>
              <th className="p-1 border border-[var(--border)]" rowSpan={2}></th>
              {DAYS.map(d => (
                <th
                  key={d}
                  colSpan={ROOMS.length}
                  className={`p-1.5 text-center text-white font-bold border border-[var(--border)] ${DAY_BG[d]}`}
                >
                  {DAY_ICONS[d]} {d}
                </th>
              ))}
            </tr>
            {/* 教室ヘッダー */}
            <tr>
              {DAYS.map(d =>
                ROOMS.map(room => (
                  <th
                    key={`${d}-${room}`}
                    className="p-1 text-center font-bold text-[var(--ink2)] border border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap"
                  >
                    {ROOM_SHORT[room] || room}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(i => (
              <tr key={i}>
                <td className="p-1 text-center font-bold text-[var(--ink3)] border border-[var(--border)] bg-[var(--surface2)] whitespace-nowrap">
                  {i}限
                </td>
                {DAYS.map(d =>
                  ROOMS.map(room => {
                    const subj = tt[d]?.[room]?.[i] || '';
                    return (
                      <td
                        key={`${d}-${room}-${i}`}
                        className={`p-1 text-center border border-[var(--border)] ${subj ? 'text-[var(--ink)]' : 'text-[var(--ink3)]'}`}
                      >
                        {subj || ''}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-[var(--ink3)] text-center mt-2">
        横スクロールで全曜日を確認できます
      </div>
    </div>
  );
}

function StudentHeader({ student, onLogout }: {
  student: Student;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-200 shrink-0">
          {student.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold truncate">{student.name}</div>
          <div className="text-xs text-[var(--ink3)]">
            {student.grade}{student.classroom === 'B教室' ? ' / B教室' : ''}
          </div>
        </div>
      </div>
      <button onClick={onLogout} className="text-xs text-[var(--ink3)] hover:text-[var(--ink)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--surface2)] whitespace-nowrap shrink-0">
        ログアウト
      </button>
    </div>
  );
}
