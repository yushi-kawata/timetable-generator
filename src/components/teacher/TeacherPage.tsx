import { useState } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAYS, ROOMS, DAY_ICONS } from '../../types/master';
import type { DayOfWeek } from '../../types/master';

const DAY_HEADERS: Record<DayOfWeek, string> = {
  月: 'bg-[var(--mon)]', 火: 'bg-[var(--tue)]', 水: 'bg-[var(--wed)]', 木: 'bg-[var(--thu)]', 金: 'bg-[var(--fri)]',
};

function weekLabel(key: string): string {
  const mon = new Date(key);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const thisKey = `${thisMon.getFullYear()}-${String(thisMon.getMonth() + 1).padStart(2, '0')}-${String(thisMon.getDate()).padStart(2, '0')}`;
  const suffix = key === thisKey ? '（今週）' : '';
  return `${fmt(mon)}（月）〜 ${fmt(fri)}（金）${suffix}`;
}

export default function TeacherPage() {
  const { records, deleteRecord, clearRecords } = useAppStore();
  const [filterWeek, setFilterWeek] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterRoom, setFilterRoom] = useState('');

  const weeks = [...new Set(records.map((r) => r.week).filter(Boolean))].sort().reverse();

  let filtered = records;
  if (filterWeek) filtered = filtered.filter((r) => r.week === filterWeek);
  if (filterDay) filtered = filtered.filter((r) => r.days.includes(filterDay as DayOfWeek));
  if (filterRoom) filtered = filtered.filter((r) =>
    Object.values(r.sel || {}).some((p) => Object.values(p).includes(filterRoom))
  );

  // 教室別集計
  const summary: Record<string, Record<string, Record<number, string[]>>> = {};
  const targetRecs = filterWeek ? records.filter((r) => r.week === filterWeek) : records;
  for (const day of DAYS) {
    summary[day] = {};
    for (const room of ROOMS) {
      summary[day][room] = {};
      for (let i = 1; i <= 5; i++) {
        summary[day][room][i] = targetRecs
          .filter((r) => r.days.includes(day) && r.sel?.[day]?.[i] === room)
          .map((r) => r.name);
      }
    }
  }

  const exportCSV = () => {
    const header = ['氏名', '学年', '対象週', '申告日時', '曜日', '1限', '2限', '3限', '4限', '5限'];
    const rows = filtered.map((r) => [
      r.name, r.grade, r.week, r.timestamp, r.days.join('・'),
      ...[1, 2, 3, 4, 5].map((i) => {
        const rooms = r.days.map((d) => r.sel?.[d]?.[i]).filter(Boolean);
        return [...new Set(rooms)].join('/');
      }),
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `申告一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* 申告一覧 */}
      <div className="card">
        <div className="card-title">📋 申告一覧・出席管理</div>
        <div className="flex gap-2 flex-wrap items-center mb-4">
          <select value={filterWeek} onChange={(e) => setFilterWeek(e.target.value)} className="sel-ctrl">
            <option value="">全週</option>
            {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
          </select>
          <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="sel-ctrl">
            <option value="">全曜日</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)} className="sel-ctrl">
            <option value="">全教室</option>
            {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={exportCSV} className="btn-sub text-xs">📥 CSV出力</button>
          <button onClick={() => { if (confirm('全データを削除しますか？')) clearRecords(); }} className="btn-danger text-xs">🗑️ 全削除</button>
        </div>

        <div className="overflow-x-auto">
          <table className="mgmt-table">
            <thead>
              <tr>
                <th>氏名</th><th>学年</th><th>対象週</th><th>申告日時</th><th>曜日</th>
                <th>1限</th><th>2限</th><th>3限</th><th>4限</th><th>5限</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-[var(--ink3)] text-sm">申告データがありません</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-bold">{r.name}</td>
                    <td><span className="badge">{r.grade}</span></td>
                    <td className="text-[11px] text-[var(--ink2)] whitespace-nowrap">{r.week ? weekLabel(r.week) : '—'}</td>
                    <td className="text-[11px] text-[var(--ink3)]">{r.timestamp}</td>
                    <td>{r.days.map((d) => <span key={d} className="badge mr-1">{d}</span>)}</td>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const rooms = r.days.map((d) => r.sel?.[d]?.[i]).filter(Boolean);
                      return <td key={i} className="text-[11px]">{[...new Set(rooms)].join(', ') || '—'}</td>;
                    })}
                    <td>
                      <button onClick={() => deleteRecord(r.id)} className="btn-danger text-xs px-2 py-1 rounded">
                        削除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 教室別集計 */}
      <div className="card">
        <div className="card-title">🏫 教室別・時限別 人数集計</div>
        <div className="space-y-4">
          {DAYS.map((day) => (
            <div key={day} className="border border-[var(--border)] rounded-xl overflow-hidden">
              <div className={`${DAY_HEADERS[day]} text-white px-4 py-2 font-bold text-sm flex items-center gap-2`}>
                {DAY_ICONS[day]} {day}曜日
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-[var(--surface2)]">
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-[var(--ink3)] border-b border-[var(--border)]">時限</th>
                      {ROOMS.map((room) => (
                        <th key={room} className="px-3 py-2 text-center text-[11px] font-bold text-[var(--ink3)] border-b border-[var(--border)]">{room}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <tr key={i} className="border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                        <td className="px-3 py-2 font-bold text-[var(--ink2)]">{i}限</td>
                        {ROOMS.map((room) => {
                          const names = summary[day]?.[room]?.[i] || [];
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
          ))}
        </div>
      </div>
    </div>
  );
}
