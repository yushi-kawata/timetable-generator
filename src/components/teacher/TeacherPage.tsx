import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAYS, DAY_ICONS, ROOMS, GRADE_ROOM, SELECTABLE_PERIODS } from '../../types/master';
import type { DayOfWeek } from '../../types/master';

const DAY_HEADERS: Record<DayOfWeek, string> = {
  月: 'bg-[var(--mon)]', 火: 'bg-[var(--tue)]', 水: 'bg-[var(--wed)]', 木: 'bg-[var(--thu)]', 金: 'bg-[var(--fri)]',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayDow(): DayOfWeek | '' {
  const map = ['', '月', '火', '水', '木', '金', ''] as const;
  return (map[new Date().getDay()] || '') as DayOfWeek | '';
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TeacherPage() {
  const { students, attendance, period2, tt, fetchStudents, fetchAttendance, fetchPeriod2 } = useAppStore();
  const [tab, setTab] = useState<'attendance' | 'period2' | 'rooms'>('attendance');
  const [date, setDate] = useState(todayStr());
  const [filterDay, setFilterDay] = useState<DayOfWeek | ''>(todayDow());

  const weekKey = getWeekKey(new Date(date));

  useEffect(() => {
    fetchStudents();
    fetchAttendance(date);
    fetchPeriod2(weekKey);
  }, [date]);

  const handleRefresh = () => {
    fetchStudents();
    fetchAttendance(date);
    fetchPeriod2(weekKey);
  };

  // 今日登校予定の生徒
  const dow = filterDay || todayDow();
  const expectedStudents = dow
    ? students.filter(s => s.days[dow as DayOfWeek])
    : [];

  const checkedInCount = expectedStudents.filter(s =>
    attendance.some(a => a.name === s.name)
  ).length;

  const exportCSV = () => {
    const header = ['氏名', '学年', 'コース', '出席状況', '登校時間', '下校時間'];
    const rows = expectedStudents.map(s => {
      const a = attendance.find(r => r.name === s.name);
      return [
        s.name, s.grade, s.classroom,
        a ? '出席' : '未出席',
        a?.checkinTime || '', a?.checkoutTime || '',
      ];
    });
    const csv = '\uFEFF' + [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `出席一覧_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* タブ切り替え */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'attendance' as const, label: '📋 出席管理' },
          { id: 'period2' as const, label: '📝 2限目選択状況' },
          { id: 'rooms' as const, label: '🏫 教室別人数' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
              tab === t.id
                ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)] font-bold'
                : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink2)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && (
        <div className="card">
          <div className="card-title">📋 出席管理</div>
          <div className="flex gap-2 flex-wrap items-center mb-4">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input !max-w-[180px]" />
            <div className="flex gap-1">
              {DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => setFilterDay(d)}
                  className={`w-9 h-9 rounded-lg border-2 text-xs font-bold transition-all ${
                    filterDay === d
                      ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button onClick={handleRefresh} className="btn-sub text-xs">🔄 更新</button>
            <button onClick={exportCSV} className="btn-sub text-xs">📥 CSV</button>
            <div className="ml-auto flex gap-3">
              <div className="text-center">
                <div className="text-xl font-bold text-[var(--ink)]">{expectedStudents.length}</div>
                <div className="text-[10px] font-bold text-[var(--ink3)]">登校予定</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-[var(--green)]">{checkedInCount}</div>
                <div className="text-[10px] font-bold text-[var(--ink3)]">出席</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-600">{expectedStudents.length - checkedInCount}</div>
                <div className="text-[10px] font-bold text-[var(--ink3)]">未出席</div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th>No.</th><th>氏名</th><th>学年</th><th>所属教室</th>
                  <th>状態</th><th>登校時間</th><th>下校時間</th>
                </tr>
              </thead>
              <tbody>
                {expectedStudents.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-[var(--ink3)] text-sm">該当する生徒がいません</td></tr>
                ) : (
                  expectedStudents.map((s, i) => {
                    const a = attendance.find(r => r.name === s.name);
                    return (
                      <tr key={s.name}>
                        <td className="text-[var(--ink3)]">{i + 1}</td>
                        <td className="font-bold">{s.name}</td>
                        <td><span className="badge">{s.grade}</span></td>
                        <td className="text-xs">{s.classroom}</td>
                        <td>
                          {a ? (
                            <span className="badge !bg-[var(--green-l)] !text-[var(--green)]">✓ 出席</span>
                          ) : (
                            <span className="badge !bg-red-50 !text-red-600">未出席</span>
                          )}
                        </td>
                        <td className="text-sm">{a?.checkinTime || <span className="text-[var(--ink3)]">—</span>}</td>
                        <td className="text-sm">{a?.checkoutTime || <span className="text-[var(--ink3)]">—</span>}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'period2' && (
        <div className="card">
          <div className="card-title">📝 選択科目状況（{weekKey}〜）— 2・4・5限目</div>
          <div className="overflow-x-auto">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th>氏名</th><th>学年</th><th>限</th>
                  {DAYS.map(d => <th key={d} className="text-center">{DAY_ICONS[d]} {d}</th>)}
                </tr>
              </thead>
              <tbody>
                {students.filter(s => DAYS.some(d => s.days[d])).map(s => {
                  const p2 = period2.find(p => p.week === weekKey && p.name === s.name);
                  return [2, 4, 5].map((period, pi) => (
                    <tr key={`${s.name}-${period}`} className={pi === 0 ? 'border-t-2 border-[var(--border)]' : ''}>
                      {pi === 0 && <td className="font-bold" rowSpan={3}>{s.name}</td>}
                      {pi === 0 && <td rowSpan={3}><span className="badge">{s.grade}</span></td>}
                      <td className="text-center font-bold text-xs">{period}限</td>
                      {DAYS.map(d => {
                        if (!s.days[d]) return <td key={d} className="text-center text-[var(--ink3)]">—</td>;
                        const daySel = p2?.selections[d] as Record<number, string> | undefined;
                        const sel = daySel?.[period];
                        const subj = sel ? (tt[d]?.[sel]?.[period] || sel) : '';
                        return (
                          <td key={d} className="text-center text-xs">
                            {sel ? (
                              <span className="badge">{subj}</span>
                            ) : (
                              <span className="text-amber-600 font-bold">未選択</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'rooms' && (
        <div className="card">
          <div className="card-title">🏫 教室別・時限別 人数集計</div>
          <div className="space-y-4">
            {DAYS.map(day => {
              const dayStudents = students.filter(s => s.days[day]);
              return (
                <div key={day} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className={`${DAY_HEADERS[day]} text-white px-4 py-2 font-bold text-sm flex items-center gap-2`}>
                    {DAY_ICONS[day]} {day}曜日（{dayStudents.length}名）
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-[var(--surface2)]">
                          <th className="px-3 py-2 text-left text-[11px] font-bold text-[var(--ink3)] border-b border-[var(--border)]">時限</th>
                          {ROOMS.map(room => (
                            <th key={room} className="px-3 py-2 text-center text-[11px] font-bold text-[var(--ink3)] border-b border-[var(--border)]">{room}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4, 5].map(i => (
                          <tr key={i} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                            <td className="px-3 py-2 font-bold text-[var(--ink2)]">{i}限</td>
                            {ROOMS.map(room => {
                              let names: string[];
                              if (SELECTABLE_PERIODS.includes(i)) {
                                names = dayStudents.filter(s => {
                                  const p2 = period2.find(p => p.week === weekKey && p.name === s.name);
                                  const daySel = p2?.selections[day] as Record<number, string> | undefined;
                                  return daySel?.[i] === room;
                                }).map(s => s.name);
                              } else {
                                names = dayStudents.filter(s => {
                                  if (s.classroom === 'B教室') return room === 'B教室';
                                  return GRADE_ROOM[s.grade] === room;
                                }).map(s => s.name);
                              }
                              return (
                                <td key={room} className="px-3 py-2 text-center relative group">
                                  <span className={`font-bold ${names.length > 0 ? 'text-[var(--accent)]' : 'text-[var(--ink3)]'}`}>
                                    {names.length}名
                                  </span>
                                  {names.length > 0 && (
                                    <div className="hidden group-hover:block absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[var(--ink)] text-white rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">
                                      {names.join('、')}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--ink)]" />
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
