import { useState } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAYS, DAY_ICONS, ROOMS, PERIODS } from '../../types/master';
import type { DayOfWeek, StudentRecord } from '../../types/master';

const DAY_STYLES: Record<DayOfWeek, { sel: string; header: string }> = {
  月: { sel: 'border-[var(--mon)] bg-[var(--mon-l)] text-[var(--mon)]', header: 'bg-[var(--mon)]' },
  火: { sel: 'border-[var(--tue)] bg-[var(--tue-l)] text-[var(--tue)]', header: 'bg-[var(--tue)]' },
  水: { sel: 'border-[var(--wed)] bg-[var(--wed-l)] text-[var(--wed)]', header: 'bg-[var(--wed)]' },
  木: { sel: 'border-[var(--thu)] bg-[var(--thu-l)] text-[var(--thu)]', header: 'bg-[var(--thu)]' },
  金: { sel: 'border-[var(--fri)] bg-[var(--fri-l)] text-[var(--fri)]', header: 'bg-[var(--fri)]' },
};

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekLabel(key: string): string {
  const mon = new Date(key);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(mon)}（月）〜 ${fmt(fri)}（金）`;
}

export default function StudentPage() {
  const { tt, addRecord } = useAppStore();

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [selections, setSelections] = useState<Record<string, Record<number, string>>>({});
  const [submitted, setSubmitted] = useState<StudentRecord | null>(null);
  const [error, setError] = useState('');

  const weekKey = getWeekKey(new Date());

  const toggleDay = (day: DayOfWeek) => {
    setSelectedDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      return DAYS.filter((d) => next.includes(d));
    });
  };

  const selectRoom = (day: DayOfWeek, period: number, room: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (!next[day]) next[day] = {};
      next[day] = { ...next[day], [period]: next[day][period] === room ? '' : room };
      return next;
    });
  };

  const handleSubmit = () => {
    setError('');
    if (!name.trim()) { setError('氏名を入力してください'); return; }
    if (!grade) { setError('学年を選択してください'); return; }
    if (selectedDays.length === 0) { setError('登校曜日を選択してください'); return; }

    const missing: string[] = [];
    selectedDays.forEach((d) => {
      [1, 2, 3, 4, 5].forEach((i) => {
        if (!selections[d]?.[i]) missing.push(`${d}曜 ${i}限`);
      });
    });
    if (missing.length > 0) { setError(`教室が未選択です：${missing.join('、')}`); return; }

    const rec = {
      id: Date.now(),
      week: weekKey,
      name: name.trim(),
      grade,
      days: selectedDays,
      sel: selections,
      timestamp: new Date().toLocaleString('ja-JP'),
    };
    addRecord(rec);
    setSubmitted(rec as StudentRecord);
  };

  const handleReset = () => {
    setSubmitted(null);
  };

  // ── 結果表示 ──
  if (submitted) {
    return (
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-xl font-bold">{submitted.name} さんの時間割</div>
            <div className="text-sm text-[var(--ink3)]">
              {weekLabel(submitted.week)}　申告：{submitted.timestamp}　登校日：{submitted.days.join('・')}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-sub">🖨️ 印刷</button>
            <button onClick={handleReset} className="btn-sub">← 修正する</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {submitted.days.map((day) => (
            <div key={day} className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ animationDelay: `${DAYS.indexOf(day) * 0.05}s` }}>
              <div className={`${DAY_STYLES[day].header} text-white px-4 py-2.5 font-bold text-sm flex items-center gap-1.5`}>
                {DAY_ICONS[day]} {day}曜日
              </div>
              {/* SHR */}
              <div className="grid grid-cols-[58px_1fr] border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                <div className="p-1.5 text-center bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-[var(--ink2)]">SHR</span>
                  <span className="font-mono text-[8px] text-[var(--ink3)]">9:20〜9:30</span>
                </div>
                <div className="p-2 flex flex-col justify-center">
                  <div className="text-[13px] font-semibold">ホームルーム</div>
                </div>
              </div>
              {[1, 2, 3, 4, 5].map((i) => {
                const p = PERIODS[i];
                const room = submitted.sel[day]?.[i] || '—';
                const subj = tt[day]?.[room]?.[i] || '—';
                return (
                  <div key={i} className="grid grid-cols-[58px_1fr] border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                    <div className="p-1.5 text-center bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-[var(--ink2)]">{p.label}</span>
                      <span className="font-mono text-[8px] text-[var(--ink3)]">{p.time}</span>
                    </div>
                    <div className="p-2 flex flex-col justify-center">
                      <div className="text-[13px] font-semibold">{room}</div>
                      <div className="text-[10px] text-[var(--ink3)]">{subj}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 入力フォーム ──
  return (
    <div className="card">
      <div className="card-title">📝 今週の登校申告</div>

      {/* 対象週 */}
      <div className="mb-5">
        <div className="form-label">対象週</div>
        <div className="text-sm font-semibold text-[var(--accent)] mt-1">
          ✅ {weekLabel(weekKey)}
        </div>
      </div>

      {/* 氏名 */}
      <div className="mb-5">
        <div className="form-label">氏名</div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：山田 太郎"
          className="form-input"
        />
      </div>

      {/* 学年 */}
      <div className="mb-5">
        <div className="form-label">学年</div>
        <div className="flex gap-2 mt-1">
          {['1年', '2年', '3年'].map((g) => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className={`px-5 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                grade === g
                  ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)] font-bold'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink2)]'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* 登校曜日 */}
      <div className="mb-5">
        <div className="form-label">登校する曜日（複数選択可）</div>
        <div className="flex gap-2 mt-1">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                selectedDays.includes(d)
                  ? DAY_STYLES[d].sel
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink2)]'
              }`}
            >
              {d}曜日
            </button>
          ))}
        </div>
      </div>

      {/* 各曜日・各時限の教室選択 */}
      {selectedDays.length > 0 && (
        <div className="mb-5">
          <div className="form-label mb-2">各曜日・各時限の教室を選んでください</div>
          <div className="space-y-3">
            {selectedDays.map((day) => (
              <div key={day} className="border border-[var(--border)] rounded-xl overflow-hidden animate-[fadeUp_0.3s_ease_both]">
                <div className={`${DAY_STYLES[day].header} text-white px-4 py-2.5 font-bold text-sm flex items-center gap-2`}>
                  {DAY_ICONS[day]} {day}曜日
                </div>
                {[1, 2, 3, 4, 5].map((i) => {
                  const p = PERIODS[i];
                  return (
                    <div key={i} className="grid grid-cols-[90px_1fr] border-t border-[var(--border)] hover:bg-[var(--surface2)]">
                      <div className="p-3 bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col items-center justify-center text-center">
                        <span className="text-[13px] font-bold text-[var(--ink2)]">{p.label}</span>
                        <span className="font-mono text-[9px] text-[var(--ink3)]">{p.time}</span>
                      </div>
                      <div className="p-2.5 flex gap-2 flex-wrap items-center">
                        {ROOMS.map((room) => {
                          const subj = tt[day]?.[room]?.[i] || '—';
                          const isSelected = selections[day]?.[i] === room;
                          return (
                            <button
                              key={room}
                              onClick={() => selectRoom(day, i, room)}
                              className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border-2 transition-all min-w-[110px] text-left leading-tight ${
                                isSelected
                                  ? DAY_STYLES[day].sel
                                  : 'border-[var(--border)] bg-[var(--surface2)]'
                              }`}
                            >
                              <span className={`text-xs font-bold ${isSelected ? '' : 'text-[var(--ink2)]'}`}>
                                {room}
                              </span>
                              <span className={`text-[11px] ${isSelected ? 'opacity-80' : 'text-[var(--ink3)]'}`}>
                                {subj}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="text-sm text-red-600 mb-4">⚠️ {error}</div>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        className="px-7 py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors"
      >
        ✅ 申告して時間割を確認する
      </button>
    </div>
  );
}
