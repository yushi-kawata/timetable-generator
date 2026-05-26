import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAY_ICONS, ROOMS, PERIODS, GRADE_ROOM } from '../../types/master';
import type { DayOfWeek } from '../../types/master';

const DAY_STYLES: Record<DayOfWeek, { sel: string; header: string }> = {
  月: { sel: 'border-[var(--mon)] bg-[var(--mon-l)] text-[var(--mon)]', header: 'bg-[var(--mon)]' },
  火: { sel: 'border-[var(--tue)] bg-[var(--tue-l)] text-[var(--tue)]', header: 'bg-[var(--tue)]' },
  水: { sel: 'border-[var(--wed)] bg-[var(--wed-l)] text-[var(--wed)]', header: 'bg-[var(--wed)]' },
  木: { sel: 'border-[var(--thu)] bg-[var(--thu-l)] text-[var(--thu)]', header: 'bg-[var(--thu)]' },
  金: { sel: 'border-[var(--fri)] bg-[var(--fri-l)] text-[var(--fri)]', header: 'bg-[var(--fri)]' },
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
    tt, students, attendance, period2, qrData,
    fetchStudents, fetchAttendance, fetchPeriod2, fetchQrData,
    checkIn, checkOut, savePeriod2,
  } = useAppStore();

  const [selectedName, setSelectedName] = useState(() => localStorage.getItem('student_name') || '');
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const today = todayStr();
  const dow = todayDow();
  const weekKey = getWeekKey(new Date());

  // 選ばれた生徒
  const student = students.find(s => s.name === selectedName);
  const isSchoolDay = dow && student?.days[dow];

  // 教室の決定
  const getRoom = (period: number): string => {
    if (!student || !dow) return '';
    if (period === 2) {
      // 2限目は選択
      const p2 = period2.find(p => p.week === weekKey && p.name === selectedName);
      return p2?.selections[dow] || '';
    }
    if (student.classroom === 'B教室') return 'B教室';
    return GRADE_ROOM[student.grade] || '';
  };

  // 出席状況
  const myAttendance = attendance.find(a => a.date === today && a.name === selectedName);

  useEffect(() => {
    fetchStudents();
    fetchAttendance(today);
    fetchPeriod2(weekKey);
    fetchQrData();
  }, []);

  useEffect(() => {
    if (myAttendance) {
      setCheckedIn(true);
      if (myAttendance.checkoutTime) setCheckedOut(true);
    }
  }, [myAttendance]);

  const handleNameChange = (name: string) => {
    setSelectedName(name);
    localStorage.setItem('student_name', name);
    setCheckedIn(!!attendance.find(a => a.date === today && a.name === name));
    setCheckedOut(!!attendance.find(a => a.date === today && a.name === name && a.checkoutTime));
  };

  const handleCheckIn = async () => {
    if (!student || !dow) return;
    await checkIn(selectedName, student.grade, today, nowTime());
    setCheckedIn(true);
    // younetDXの登校ページを自動で開く
    if (qrData?.tokou_url) {
      window.open(qrData.tokou_url, '_blank');
    }
  };

  const handleCheckOut = async () => {
    if (!selectedName) return;
    await checkOut(selectedName, today, nowTime());
    setCheckedOut(true);
    // younetDXの下校ページを自動で開く
    if (qrData?.gekou_url) {
      window.open(qrData.gekou_url, '_blank');
    }
  };

  const handlePeriod2Select = async (room: string) => {
    if (!dow) return;
    const existing = period2.find(p => p.week === weekKey && p.name === selectedName);
    const selections = { ...existing?.selections, [dow]: room };
    await savePeriod2(weekKey, selectedName, selections);
  };

  // 2限目の選択肢
  const period2Options = dow ? ROOMS.map(room => ({
    room,
    subject: tt[dow]?.[room]?.[2] || '',
  })).filter(o => o.subject) : [];

  const currentP2Room = getRoom(2);

  // ── 名前未選択 ──
  if (!selectedName || !student) {
    return (
      <div className="card">
        <div className="card-title">👋 ようこそ</div>
        <div className="text-sm text-[var(--ink2)] mb-4">名前を選んでください</div>
        <select
          value={selectedName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="sel-ctrl text-base w-full max-w-xs"
        >
          <option value="">-- 名前を選択 --</option>
          {students.map(s => (
            <option key={s.name} value={s.name}>{s.name}（{s.grade}{s.classroom === 'B教室' ? '・B教室' : ''}）</option>
          ))}
        </select>
      </div>
    );
  }

  // ── 平日でない or 登校日でない ──
  if (!dow) {
    return (
      <div className="card">
        <StudentHeader name={selectedName} student={student} onChangeName={() => handleNameChange('')} />
        <div className="text-center py-8 text-[var(--ink3)]">
          今日は休日です
        </div>
        <QrSection qrData={qrData} show={showQr} onToggle={() => setShowQr(!showQr)} />
      </div>
    );
  }

  if (!isSchoolDay) {
    return (
      <div className="card">
        <StudentHeader name={selectedName} student={student} onChangeName={() => handleNameChange('')} />
        <div className="text-center py-8 text-[var(--ink3)]">
          {dow}曜日は登校日ではありません
        </div>
        <QrSection qrData={qrData} show={showQr} onToggle={() => setShowQr(!showQr)} />
      </div>
    );
  }

  // ── メイン画面 ──
  return (
    <div className="space-y-4">
      {/* ヘッダー + 出席ボタン */}
      <div className="card">
        <StudentHeader name={selectedName} student={student} onChangeName={() => handleNameChange('')} />

        <div className="flex items-center gap-3 mt-4">
          {!checkedIn ? (
            <button
              onClick={handleCheckIn}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors"
            >
              📍 登校しました
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-[var(--green)] bg-[var(--green-l)] px-4 py-2 rounded-lg">
                ✅ 登校済み {myAttendance?.checkinTime || ''}
              </span>
              {!checkedOut ? (
                <button
                  onClick={handleCheckOut}
                  className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold text-xs hover:bg-red-700 transition-colors"
                >
                  🏠 下校する
                </button>
              ) : (
                <span className="text-sm font-bold text-[var(--ink3)] bg-[var(--surface2)] px-4 py-2 rounded-lg">
                  🏠 下校済み {myAttendance?.checkoutTime || ''}
                </span>
              )}
            </div>
          )}
        </div>
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
                      <div className="text-xs font-bold text-amber-600 mb-2">⚠️ 2限目の教室を選んでください</div>
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

      {/* QRコード */}
      <QrSection qrData={qrData} show={showQr} onToggle={() => setShowQr(!showQr)} />
    </div>
  );
}

/* ── サブコンポーネント ── */

function StudentHeader({ name, student, onChangeName }: {
  name: string;
  student: { grade: string; classroom: string };
  onChangeName: () => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <div className="text-lg font-bold">{name}</div>
        <div className="text-xs text-[var(--ink3)]">
          {student.grade} {student.classroom === 'B教室' ? '・B教室' : ''}
        </div>
      </div>
      <button onClick={onChangeName} className="btn-sub text-xs">
        👤 変更
      </button>
    </div>
  );
}

function QrSection({ qrData, show, onToggle }: {
  qrData: { campus: string; date: string; tokou_qr: string; gekou_qr: string; updated_at: string } | null;
  show: boolean;
  onToggle: () => void;
}) {
  if (!qrData || !qrData.tokou_qr) return null;

  return (
    <div className="card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between"
      >
        <span className="card-title !mb-0">📱 younetDX QRコード</span>
        <span className="text-sm text-[var(--ink3)]">{show ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>
      {show && (
        <div className="mt-4">
          <div className="text-xs text-[var(--ink3)] mb-3">
            {qrData.campus} — {qrData.date} （更新: {qrData.updated_at}）
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-sm font-bold text-blue-600 mb-2">登校</div>
              <img src={qrData.tokou_qr} alt="登校QR" className="w-full max-w-[200px] mx-auto rounded-lg" />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-red-600 mb-2">下校</div>
              <img src={qrData.gekou_qr} alt="下校QR" className="w-full max-w-[200px] mx-auto rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
