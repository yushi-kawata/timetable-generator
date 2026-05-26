import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAY_ICONS, ROOMS, PERIODS, GRADE_ROOM, SELECTABLE_PERIODS } from '../../types/master';
import type { DayOfWeek, Student } from '../../types/master';

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

export default function StudentPage() {
  const {
    tt, attendance, period2, qrData,
    fetchAttendance, fetchPeriod2, fetchQrData,
    checkIn, checkOut, savePeriod2,
    authStudent, dxCheckIn,
  } = useAppStore();

  const [loggedIn, setLoggedIn] = useState<Student | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [dxStatus, setDxStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const today = todayStr();
  const dow = todayDow();
  const weekKey = getWeekKey(new Date());

  useEffect(() => {
    const saved = sessionStorage.getItem('student_session');
    if (saved) {
      try { setLoggedIn(JSON.parse(saved)); } catch { /* */ }
    }
    Promise.all([
      fetchAttendance(today),
      fetchPeriod2(weekKey),
      fetchQrData(),
    ]).finally(() => setAttendanceLoading(false));
  }, []);

  const myAttendance = loggedIn ? attendance.find(a => a.date === today && a.name === loggedIn.name) : null;
  const checkedIn = !!myAttendance;
  const checkedOut = !!(myAttendance?.checkoutTime);
  // DXステータスをリセット（リロード後）
  useEffect(() => {
    if (checkedIn && dxStatus === 'idle') setDxStatus('ok');
  }, [checkedIn]);

  const student = loggedIn;
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

  const handleLogin = async () => {
    setLoginError('');
    setLoginLoading(true);
    const result = await authStudent(email.trim(), password);
    setLoginLoading(false);
    if (result) {
      setLoggedIn(result);
      sessionStorage.setItem('student_session', JSON.stringify(result));
      fetchAttendance(today);
      fetchPeriod2(weekKey);
    } else {
      setLoginError('メールアドレスまたはパスワードが正しくありません');
    }
  };

  const handleLogout = () => {
    setLoggedIn(null);
    sessionStorage.removeItem('student_session');
    setEmail('');
    setPassword('');
    setDxStatus('idle');
  };

  const handleCheckIn = async () => {
    if (!student || !dow) return;
    setDxStatus('loading');
    await checkIn(student.name, student.grade, today, nowTime());
    if (qrData?.tokou_url && student.dx_email) {
      const ok = await dxCheckIn(student.dx_email, qrData.tokou_url);
      setDxStatus(ok ? 'ok' : 'fail');
    } else {
      setDxStatus('ok');
    }
  };

  const handleCheckOut = async () => {
    if (!student) return;
    setDxStatus('loading');
    await checkOut(student.name, today, nowTime());
    if (qrData?.gekou_url && student.dx_email) {
      const ok = await dxCheckIn(student.dx_email, qrData.gekou_url);
      setDxStatus(ok ? 'ok' : 'fail');
    } else {
      setDxStatus('ok');
    }
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
  // ── ログイン画面 ──
  // ══════════════════════════════════
  if (!loggedIn) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-sm">
          {/* ロゴ・タイトル */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-2xl mb-4 shadow-lg shadow-blue-200">
              Y
            </div>
            <h1 className="text-2xl font-bold text-[var(--ink)]">通学生ポータル</h1>
            <p className="text-sm text-[var(--ink3)] mt-1">勇志国際高等学校 福岡学習センター</p>
          </div>

          {/* 手順ガイド */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-6 border border-blue-100">
            <div className="text-xs font-bold text-blue-700 mb-2">ご利用手順</div>
            <div className="space-y-1.5 text-xs text-blue-600">
              <div className="flex items-start gap-2"><span className="font-bold min-w-[18px]">1.</span>younetDXのID・パスワードでログイン</div>
              <div className="flex items-start gap-2"><span className="font-bold min-w-[18px]">2.</span>「登校しました」ボタンを押す</div>
              <div className="flex items-start gap-2"><span className="font-bold min-w-[18px]">3.</span>younetDXの出席も自動で登録されます</div>
              <div className="flex items-start gap-2"><span className="font-bold min-w-[18px]">4.</span>時間割を確認してください</div>
            </div>
          </div>

          {/* ログインフォーム */}
          <div className="card !mb-0 shadow-lg shadow-stone-200/50">
            <div className="mb-4">
              <div className="form-label">メールアドレス</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="example@yushi-kokusai.jp"
                className="form-input w-full !max-w-none"
                autoFocus
              />
            </div>
            <div className="mb-5">
              <div className="form-label">パスワード</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="パスワード"
                className="form-input w-full !max-w-none"
              />
            </div>
            {loginError && (
              <div className="text-sm text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg">{loginError}</div>
            )}
            <button
              onClick={handleLogin}
              disabled={loginLoading || !email || !password}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 shadow-md shadow-blue-200"
            >
              {loginLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ログイン中...
                </span>
              ) : 'ログイン'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 休日 / 登校日でない ──
  // ══════════════════════════════════
  if (!dow) {
    return (
      <div className="card shadow-lg shadow-stone-200/50">
        <StudentHeader student={student!} onLogout={handleLogout} />
        <div className="text-center py-10 text-[var(--ink3)]">
          <div className="text-4xl mb-3">🌙</div>
          <div className="font-bold">今日は休日です</div>
          <div className="text-xs mt-1">ゆっくり休んでください</div>
        </div>
      </div>
    );
  }

  if (!isSchoolDay) {
    return (
      <div className="card shadow-lg shadow-stone-200/50">
        <StudentHeader student={student!} onLogout={handleLogout} />
        <div className="text-center py-10 text-[var(--ink3)]">
          <div className="text-4xl mb-3">🏠</div>
          <div className="font-bold">{dow}曜日は登校日ではありません</div>
        </div>
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
        <StudentHeader student={student!} onLogout={handleLogout} />

        {/* 出席アクション */}
        <div className="mt-5 space-y-3">
          {attendanceLoading ? (
            <div className="text-center py-4 text-[var(--ink3)] text-sm">出席状況を確認中...</div>
          ) : (
            <>
              {/* 登校ボタン / 登校済み表示 */}
              {!checkedIn ? (
                <button
                  onClick={handleCheckIn}
                  disabled={dxStatus === 'loading'}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-base hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-60 shadow-md shadow-blue-200"
                >
                  {dxStatus === 'loading' ? (
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

              {/* 下校ボタン / 下校済み表示 */}
              {!checkedOut ? (
                <button
                  onClick={checkedIn ? handleCheckOut : undefined}
                  disabled={dxStatus === 'loading' || !checkedIn}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-md ${checkedIn ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 shadow-rose-200 disabled:opacity-60' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}
                >
                  {dxStatus === 'loading' ? (
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
        {dxStatus === 'ok' && (
          <div className="mt-3 text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
            younetDXにも出席を登録しました
          </div>
        )}
        {dxStatus === 'fail' && (
          <div className="mt-3 text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            younetDXの出席登録に失敗しました（手動で登録してください）
          </div>
        )}
      </div>

      {/* 今日の時間割 */}
      <div className="card shadow-lg shadow-stone-200/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="card-title !mb-0">今日の時間割</div>
            <div className="text-sm font-bold text-[var(--ink)] mt-1">{todayLabel()}</div>
          </div>
          <div className={`text-xs font-bold text-white px-3 py-1 rounded-full ${DAY_STYLES[dow].header}`}>
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
                <div className="p-3 flex flex-col justify-center">
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
                      <div className="text-sm font-bold">{subj}</div>
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

function StudentHeader({ student, onLogout }: {
  student: Student;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-200">
          {student.name.charAt(0)}
        </div>
        <div>
          <div className="text-base font-bold">{student.name}</div>
          <div className="text-xs text-[var(--ink3)]">
            {student.grade}{student.classroom === 'B教室' ? ' / B教室' : ''}
          </div>
        </div>
      </div>
      <button onClick={onLogout} className="text-xs text-[var(--ink3)] hover:text-[var(--ink)] transition-colors px-3 py-1.5 rounded-lg hover:bg-[var(--surface2)]">
        ログアウト
      </button>
    </div>
  );
}
