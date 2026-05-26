import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAY_ICONS, ROOMS, PERIODS, GRADE_ROOM } from '../../types/master';
import type { DayOfWeek, Student } from '../../types/master';

const DAY_STYLES: Record<DayOfWeek, { header: string }> = {
  月: { header: 'bg-[var(--mon)]' },
  火: { header: 'bg-[var(--tue)]' },
  水: { header: 'bg-[var(--wed)]' },
  木: { header: 'bg-[var(--thu)]' },
  金: { header: 'bg-[var(--fri)]' },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDow(): DayOfWeek | null {
  const map: (DayOfWeek | null)[] = [null, '月', '火', '水', '木', '金', null];
  return map[new Date().getDay()];
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

  // ログイン状態（sessionStorage: タブ閉じたらリセット）
  const [loggedIn, setLoggedIn] = useState<Student | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [dxStatus, setDxStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');

  const today = todayStr();
  const dow = todayDow();
  const weekKey = getWeekKey(new Date());

  // セッション復元
  useEffect(() => {
    const saved = sessionStorage.getItem('student_session');
    if (saved) {
      try {
        setLoggedIn(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    fetchAttendance(today);
    fetchPeriod2(weekKey);
    fetchQrData();
  }, []);

  // 出席状況チェック
  const myAttendance = loggedIn ? attendance.find(a => a.date === today && a.name === loggedIn.name) : null;
  useEffect(() => {
    if (myAttendance) {
      setCheckedIn(true);
      if (myAttendance.checkoutTime) setCheckedOut(true);
    }
  }, [myAttendance]);

  const student = loggedIn;
  const isSchoolDay = dow && student?.days[dow];

  const getRoom = (period: number): string => {
    if (!student || !dow) return '';
    if (period === 2) {
      const p2 = period2.find(p => p.week === weekKey && p.name === student.name);
      return p2?.selections[dow] || '';
    }
    if (student.classroom === 'B教室') return 'B教室';
    return GRADE_ROOM[student.grade] || '';
  };

  // ── ログイン処理 ──
  const handleLogin = async () => {
    setLoginError('');
    setLoginLoading(true);
    const result = await authStudent(email.trim(), password);
    setLoginLoading(false);
    if (result) {
      setLoggedIn(result);
      sessionStorage.setItem('student_session', JSON.stringify(result));
      // 出席データ再取得
      fetchAttendance(today);
      fetchPeriod2(weekKey);
    } else {
      setLoginError('メールアドレスまたはパスワードが正しくありません');
    }
  };

  const handleLogout = () => {
    setLoggedIn(null);
    sessionStorage.removeItem('student_session');
    setCheckedIn(false);
    setCheckedOut(false);
    setEmail('');
    setPassword('');
    setDxStatus('idle');
  };

  // ── 登校処理（DX自動出席付き）──
  const handleCheckIn = async () => {
    if (!student || !dow) return;
    // 1. 時間割ツール側の出席記録
    await checkIn(student.name, student.grade, today, nowTime());
    setCheckedIn(true);

    // 2. DX自動出席（裏で）
    if (qrData?.tokou_url && student.dx_email) {
      setDxStatus('loading');
      const ok = await dxCheckIn(student.dx_email, qrData.tokou_url);
      setDxStatus(ok ? 'ok' : 'fail');
    }
  };

  // ── 下校処理 ──
  const handleCheckOut = async () => {
    if (!student) return;
    await checkOut(student.name, today, nowTime());
    setCheckedOut(true);

    if (qrData?.gekou_url && student.dx_email) {
      setDxStatus('loading');
      const ok = await dxCheckIn(student.dx_email, qrData.gekou_url);
      setDxStatus(ok ? 'ok' : 'fail');
    }
  };

  const handlePeriod2Select = async (room: string) => {
    if (!dow || !student) return;
    const existing = period2.find(p => p.week === weekKey && p.name === student.name);
    const selections = { ...existing?.selections, [dow]: room };
    await savePeriod2(weekKey, student.name, selections);
  };

  const period2Options = dow ? ROOMS.map(room => ({
    room,
    subject: tt[dow]?.[room]?.[2] || '',
  })).filter(o => o.subject) : [];

  const currentP2Room = getRoom(2);

  // ══════════════════════════════════
  // ── ログイン画面 ──
  // ══════════════════════════════════
  if (!loggedIn) {
    return (
      <div className="card max-w-sm mx-auto">
        <div className="text-center mb-6">
          <div className="text-2xl font-bold mb-1">📅 通学生ポータル</div>
          <div className="text-sm text-[var(--ink3)]">younetDXのID・パスワードでログイン</div>
        </div>

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

        <div className="mb-4">
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
          <div className="text-sm text-red-600 mb-4">
            {loginError}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loginLoading || !email || !password}
          className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          {loginLoading ? 'ログイン中...' : 'ログイン'}
        </button>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── 休日 / 登校日でない ──
  // ══════════════════════════════════
  if (!dow) {
    return (
      <div className="card">
        <StudentHeader student={student!} onLogout={handleLogout} />
        <div className="text-center py-8 text-[var(--ink3)]">今日は休日です</div>
      </div>
    );
  }

  if (!isSchoolDay) {
    return (
      <div className="card">
        <StudentHeader student={student!} onLogout={handleLogout} />
        <div className="text-center py-8 text-[var(--ink3)]">{dow}曜日は登校日ではありません</div>
      </div>
    );
  }

  // ══════════════════════════════════
  // ── メイン画面 ──
  // ══════════════════════════════════
  return (
    <div className="space-y-4">
      {/* ヘッダー + 出席ボタン */}
      <div className="card">
        <StudentHeader student={student!} onLogout={handleLogout} />

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {!checkedIn ? (
            <button
              onClick={handleCheckIn}
              disabled={dxStatus === 'loading'}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              {dxStatus === 'loading' ? '処理中...' : '📍 登校しました'}
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-[var(--green)] bg-[var(--green-l)] px-4 py-2 rounded-lg">
                ✅ 登校済み {myAttendance?.checkinTime || ''}
              </span>
              {!checkedOut ? (
                <button
                  onClick={handleCheckOut}
                  disabled={dxStatus === 'loading'}
                  className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold text-xs hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {dxStatus === 'loading' ? '処理中...' : '🏠 下校する'}
                </button>
              ) : (
                <span className="text-sm font-bold text-[var(--ink3)] bg-[var(--surface2)] px-4 py-2 rounded-lg">
                  🏠 下校済み {myAttendance?.checkoutTime || ''}
                </span>
              )}
            </div>
          )}
        </div>

        {/* DXステータス */}
        {dxStatus === 'ok' && (
          <div className="mt-2 text-xs text-[var(--green)] font-semibold">younetDXにも出席登録しました</div>
        )}
        {dxStatus === 'fail' && (
          <div className="mt-2 text-xs text-red-600 font-semibold">younetDXの出席登録に失敗しました（手動で登録してください）</div>
        )}
      </div>

      {/* 今日の時間割 */}
      <div className="card">
        <div className="card-title">📅 今日の時間割（{dow}曜日）</div>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className={`${DAY_STYLES[dow].header} text-white px-4 py-2.5 font-bold text-sm flex items-center gap-1.5`}>
            {DAY_ICONS[dow]} {dow}曜日 — {today}
          </div>
          {/* SHR */}
          <div className="grid grid-cols-[70px_1fr] border-t border-[var(--border)] hover:bg-[var(--surface2)]">
            <div className="p-2 text-center bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-[var(--ink2)]">SHR</span>
              <span className="font-mono text-[9px] text-[var(--ink3)]">9:20〜9:30</span>
            </div>
            <div className="p-3 flex flex-col justify-center">
              <div className="text-sm font-semibold">ホームルーム</div>
            </div>
          </div>
          {/* 1〜5限 */}
          {[1, 2, 3, 4, 5].map((i) => {
            const p = PERIODS[i];
            const room = getRoom(i);
            const subj = room ? (tt[dow]?.[room]?.[i] || '—') : '';
            const isPeriod2 = i === 2;
            const needsSelection = isPeriod2 && !currentP2Room;

            return (
              <div key={i} className={`grid grid-cols-[70px_1fr] border-t border-[var(--border)] hover:bg-[var(--surface2)] ${needsSelection ? 'bg-amber-50' : ''}`}>
                <div className="p-2 text-center bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-[var(--ink2)]">{p.label}</span>
                  <span className="font-mono text-[9px] text-[var(--ink3)]">{p.time}</span>
                </div>
                <div className="p-3 flex flex-col justify-center">
                  {needsSelection ? (
                    <div>
                      <div className="text-xs font-bold text-amber-600 mb-2">2限目の教室を選んでください</div>
                      <div className="flex gap-2 flex-wrap">
                        {period2Options.map(o => (
                          <button
                            key={o.room}
                            onClick={() => handlePeriod2Select(o.room)}
                            className="px-3 py-1.5 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] text-xs font-bold hover:border-[var(--accent)] hover:bg-blue-50 transition-all"
                          >
                            {o.room.replace('教室', '').replace('（', '(').replace('）', ')')} {o.subject}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold">{subj}</div>
                      <div className="text-[11px] text-[var(--ink3)]">
                        {room}
                        {isPeriod2 && currentP2Room && (
                          <button
                            onClick={() => handlePeriod2Select('')}
                            className="ml-2 text-[var(--accent)] underline"
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
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <div className="text-lg font-bold">{student.name}</div>
        <div className="text-xs text-[var(--ink3)]">
          {student.grade} {student.classroom === 'B教室' ? '・B教室' : ''}
        </div>
      </div>
      <button onClick={onLogout} className="btn-sub text-xs">
        ログアウト
      </button>
    </div>
  );
}
