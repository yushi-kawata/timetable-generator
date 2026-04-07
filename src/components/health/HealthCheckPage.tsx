import { useState, useEffect, useCallback } from 'react';
import { DAYS, DAY_ICONS } from '../../types/master';
import type { DayOfWeek } from '../../types/master';

/* ── 型定義 ── */
type RosterEntry = { name: string; days: Record<DayOfWeek, boolean> };
type HealthRecord = {
  date: string;
  name: string;
  condition: string;
  attendance: string;
  arrivalTime: string;
  recorder: string;
  recordedAt: string;
};

/* ── GAS API ── */
const HEALTH_GAS_URL = 'https://script.google.com/macros/s/AKfycbxqGHhfXk8BxUYn4SuD8Jr7yRstqaPgnwDaykwKUxP7cK6gpSZ6kdgrlIOz9SMsHmzF/exec';

async function gasGet(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${HEALTH_GAS_URL}?${qs}`, { redirect: 'follow' });
  return res.json();
}

async function gasPost(body: unknown) {
  await fetch(HEALTH_GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
}

/* ── フォールバック名簿 ── */
const NO_DAYS = { 月: false, 火: false, 水: false, 木: false, 金: false } as const;
const FALLBACK_ROSTER: RosterEntry[] = [
  '村上 茉咲', '栗木 柊斗', '鹿毛 心望', '七種 花子', '水田 美咲',
  '和田 蒼衣', '成本 恵麗菜', '畠中 希実', '生島 多海', '濵﨑 宗一郎',
  '中尾 日向', '山内 陸翔', '若菜 宮樹', '宮路 裕太', '葉山 純真',
  '新谷 諒羽', '奥田 梨里子', '中川 雄満', '工藤 奈々', '小関 穂乃華',
  '緒方 優稀', '泉 槙茉', '平川 稀叶', '内原 結希乃', '相馬 佳音',
].map((name) => ({ name, days: { ...NO_DAYS } }));

const CONDITIONS = ['良好', '不良', 'その他'] as const;
const ATTENDANCES = ['出席', '欠席', '遅刻', '早退'] as const;
const WEEKDAYS = DAYS;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayDow(): DayOfWeek | '' {
  const map = ['', '月', '火', '水', '木', '金', ''] as const;
  return (map[new Date().getDay()] || '') as DayOfWeek | '';
}

const DAY_SEL: Record<DayOfWeek, string> = {
  月: 'border-[var(--mon)] bg-[var(--mon-l)] text-[var(--mon)]',
  火: 'border-[var(--tue)] bg-[var(--tue-l)] text-[var(--tue)]',
  水: 'border-[var(--wed)] bg-[var(--wed-l)] text-[var(--wed)]',
  木: 'border-[var(--thu)] bg-[var(--thu-l)] text-[var(--thu)]',
  金: 'border-[var(--fri)] bg-[var(--fri-l)] text-[var(--fri)]',
};

/* ================================================================ */
export default function HealthCheckPage({ isTeacher }: { isTeacher: boolean }) {
  const [tab, setTab] = useState<'input' | 'list' | 'roster'>(isTeacher ? 'list' : 'input');
  const [authed, setAuthed] = useState(isTeacher);
  const [showPw, setShowPw] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const adminPw = localStorage.getItem('admin_pw') || 'teacher1234';

  const handleTabClick = (id: 'input' | 'list' | 'roster') => {
    if (id === 'input') {
      setTab(id);
    } else if (authed) {
      setTab(id);
    } else {
      setShowPw(true);
      setPwInput('');
      setPwError('');
      setPendingTab(id);
    }
  };

  const [pendingTab, setPendingTab] = useState<'list' | 'roster'>('list');

  const checkPw = () => {
    if (pwInput === adminPw) {
      setAuthed(true);
      setShowPw(false);
      setTab(pendingTab);
    } else {
      setPwError('パスワードが正しくありません');
      setPwInput('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-title">🏥 健康観察</div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'input' as const, label: '📝 記録入力', locked: false },
            { id: 'list' as const, label: '📋 教員確認', locked: !authed },
            { id: 'roster' as const, label: '👥 名簿管理', locked: !authed },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              className={`px-5 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                tab === t.id
                  ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)] font-bold'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink2)]'
              }`}
            >
              {t.locked ? '🔒 ' : ''}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* パスワードモーダル */}
      {showPw && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowPw(false)}
        >
          <div
            className="bg-[var(--surface)] rounded-2xl p-10 w-full max-w-sm shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1">🔐 教員用ページ</h2>
            <p className="text-sm text-[var(--ink3)] mb-6">パスワードを入力してください</p>
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkPw()}
              placeholder="••••••••"
              className="w-full text-center text-base px-4 py-3 border-2 border-[var(--border)] rounded-xl bg-[var(--surface2)] tracking-widest mb-2 focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            {pwError && (
              <p className="text-sm text-red-600 mb-3">❌ {pwError}</p>
            )}
            <button
              onClick={checkPw}
              className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 mt-2"
            >
              ログイン
            </button>
            <button
              onClick={() => setShowPw(false)}
              className="w-full py-2 text-sm text-[var(--ink3)] mt-3 hover:text-[var(--ink)]"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {tab === 'input' && <InputTab />}
      {tab === 'list' && <ListTab />}
      {tab === 'roster' && <RosterTab />}
    </div>
  );
}

/* ========== 記録入力 ========== */
function InputTab() {
  const [day, setDay] = useState<DayOfWeek>(() => {
    const d = todayDow();
    return (d && WEEKDAYS.includes(d)) ? d : '月';
  });
  const [date] = useState(todayStr);
  const [students, setStudents] = useState<string[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [form, setForm] = useState<Record<string, { condition: string; attendance: string; arrivalTime: string }>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // GASから生徒一覧を取得
  const fetchStudents = useCallback((d: DayOfWeek) => {
    setLoading(true);
    gasGet('roster', { day: d })
      .then((data) => setStudents(data.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  // GASから記録を取得
  const fetchRecords = useCallback((d: string) => {
    gasGet('records', { date: d })
      .then((data) => setRecords(data.records || []))
      .catch(() => setRecords([]));
  }, []);

  useEffect(() => { fetchStudents(day); }, [day, fetchStudents]);
  useEffect(() => { fetchRecords(date); }, [date, fetchRecords]);

  // Init form when students/records change
  useEffect(() => {
    const init: typeof form = {};
    students.forEach((name) => {
      const existing = records.find((r) => r.name === name);
      init[name] = existing
        ? { condition: existing.condition, attendance: existing.attendance, arrivalTime: existing.arrivalTime }
        : { condition: '良好', attendance: '出席', arrivalTime: '' };
    });
    setForm(init);
    setSaved(false);
  }, [students, records]);

  const update = (name: string, field: string, value: string) => {
    setForm((p) => ({ ...p, [name]: { ...p[name], [field]: value } }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const recordsData = Object.entries(form).map(([name, data]) => ({
      name,
      condition: data.condition,
      attendance: data.attendance,
      arrivalTime: data.arrivalTime,
    }));
    await gasPost({ action: 'submit', date, records: recordsData, recorder: '保健委員' });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    setSubmitting(false);
    // no-corsなのでレスポンスは取れない → 少し待ってから再取得
    setTimeout(() => fetchRecords(date), 1500);
  };

  return (
    <>
      {/* 日付・曜日 */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-base font-bold">{date}（{todayDow() || '—'}）</div>
            <div className="text-xs text-[var(--ink3)]">登校予定: {students.length}名</div>
          </div>
          <div className="flex gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={`w-10 h-10 rounded-lg border-2 text-sm font-bold transition-all ${
                  day === d ? DAY_SEL[d] : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {saved && (
        <div className="text-sm text-[var(--green)] font-semibold bg-[var(--green-l)] px-4 py-3 rounded-xl">
          ✅ 記録を保存しました
        </div>
      )}

      {loading ? (
        <div className="card text-center text-[var(--ink3)] py-10">読み込み中...</div>
      ) : students.length === 0 ? (
        <div className="card text-center text-[var(--ink3)] py-10">
          この曜日に登校する生徒はいません
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {students.map((name, i) => {
              const d = form[name] || { condition: '良好', attendance: '出席', arrivalTime: '' };
              const hasRecord = records.some((r) => r.name === name);
              return (
                <div
                  key={name}
                  className={`card !mb-0 !py-4 ${hasRecord ? 'border-[var(--green)] bg-[var(--green-l)]' : ''}`}
                  style={{ animationDelay: `${i * 0.03}s`, animation: 'fadeUp 0.3s ease both' }}
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* 番号・氏名 */}
                    <div className="flex items-center gap-2 min-w-[110px]">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent)] text-white text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="font-bold text-sm">{name}</span>
                      {hasRecord && <span className="text-[var(--green)] text-xs font-bold">✓</span>}
                    </div>

                    {/* 体調 */}
                    <div className="flex gap-1">
                      {CONDITIONS.map((c) => (
                        <button
                          key={c}
                          onClick={() => update(name, 'condition', c)}
                          className={`px-3 py-1.5 rounded-md border-2 text-xs font-bold transition-all ${
                            d.condition === c
                              ? c === '良好' ? 'border-[var(--green)] bg-[var(--green-l)] text-[var(--green)]'
                                : c === '不良' ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-amber-500 bg-amber-50 text-amber-700'
                              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>

                    {/* 出欠 */}
                    <div className="flex gap-1">
                      {ATTENDANCES.map((a) => (
                        <button
                          key={a}
                          onClick={() => update(name, 'attendance', a)}
                          className={`px-3 py-1.5 rounded-md border-2 text-xs font-bold transition-all ${
                            d.attendance === a
                              ? a === '出席' ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)]'
                                : a === '欠席' ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-amber-500 bg-amber-50 text-amber-700'
                              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>

                    {/* 登校時間 */}
                    <input
                      type="time"
                      value={d.arrivalTime}
                      onChange={(e) => update(name, 'arrivalTime', e.target.value)}
                      className="form-input !max-w-[130px] !py-1.5 text-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-7 py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              {submitting ? '保存中...' : '✅ 記録を保存'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ========== 教員確認（一覧表） ========== */
function ListTab() {
  const [day, setDay] = useState<DayOfWeek>(() => {
    const d = todayDow();
    return (d && WEEKDAYS.includes(d)) ? d : '月';
  });
  const [date, setDate] = useState(todayStr);
  const [students, setStudents] = useState<string[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStudents = useCallback((d: DayOfWeek) => {
    setLoading(true);
    gasGet('roster', { day: d })
      .then((data) => setStudents(data.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  const fetchRecords = useCallback((d: string) => {
    gasGet('records', { date: d })
      .then((data) => setRecords(data.records || []))
      .catch(() => setRecords([]));
  }, []);

  useEffect(() => { fetchStudents(day); }, [day, fetchStudents]);
  useEffect(() => { fetchRecords(date); }, [date, fetchRecords]);

  const dayRecords = records;
  const recorded = dayRecords.length;
  const unrecorded = Math.max(0, students.length - recorded);

  return (
    <>
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="form-label">日付</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-input !max-w-[180px] ml-2"
            />
          </div>
          <div>
            <span className="form-label">曜日</span>
            <div className="flex gap-1 ml-2 inline-flex">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  className={`w-9 h-9 rounded-lg border-2 text-xs font-bold transition-all ${
                    day === d ? DAY_SEL[d] : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { fetchStudents(day); fetchRecords(date); }}
            className="btn-sub text-xs"
          >
            🔄 更新
          </button>
          <div className="ml-auto flex gap-3">
            <div className="text-center">
              <div className="text-xl font-bold text-[var(--ink)]">{students.length}</div>
              <div className="text-[10px] font-bold text-[var(--ink3)]">登校予定</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-[var(--green)]">{recorded}</div>
              <div className="text-[10px] font-bold text-[var(--ink3)]">記録済</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-600">{unrecorded}</div>
              <div className="text-[10px] font-bold text-[var(--ink3)]">未記録</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center text-[var(--ink3)] py-10">読み込み中...</div>
        ) : students.length === 0 ? (
          <div className="text-center text-[var(--ink3)] py-10">データがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th>No.</th><th>生徒名</th><th>体調</th><th>出欠</th>
                  <th>登校時間</th><th>記録者</th><th>状態</th>
                </tr>
              </thead>
              <tbody>
                {students.map((name, i) => {
                  const rec = dayRecords.find((r) => r.name === name);
                  return (
                    <tr key={name}>
                      <td className="text-[var(--ink3)]">{i + 1}</td>
                      <td className="font-bold">{name}</td>
                      <td>
                        {rec ? (
                          <span className={`badge ${
                            rec.condition === '良好' ? '!bg-[var(--green-l)] !text-[var(--green)]'
                              : rec.condition === '不良' ? '!bg-red-50 !text-red-700'
                              : '!bg-amber-50 !text-amber-700'
                          }`}>{rec.condition}</span>
                        ) : <span className="text-[var(--ink3)]">—</span>}
                      </td>
                      <td>
                        {rec ? (
                          <span className={`badge ${
                            rec.attendance === '出席' ? ''
                              : rec.attendance === '欠席' ? '!bg-red-50 !text-red-700'
                              : '!bg-amber-50 !text-amber-700'
                          }`}>{rec.attendance}</span>
                        ) : <span className="text-[var(--ink3)]">—</span>}
                      </td>
                      <td className="text-sm">{rec?.arrivalTime || <span className="text-[var(--ink3)]">—</span>}</td>
                      <td className="text-[11px] text-[var(--ink3)]">{rec?.recorder || '—'}</td>
                      <td>
                        {rec ? (
                          <span className="badge !bg-[var(--green-l)] !text-[var(--green)]">✓ 記録済</span>
                        ) : (
                          <span className="badge !bg-red-50 !text-red-600">未記録</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ========== 名簿管理 ========== */
function RosterTab() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [newName, setNewName] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // GASから名簿を取得
  useEffect(() => {
    gasGet('allRoster')
      .then((data) => {
        const r = data.roster || [];
        setRoster(r.length > 0 ? r : FALLBACK_ROSTER);
      })
      .catch(() => setRoster(FALLBACK_ROSTER))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (idx: number, day: DayOfWeek) => {
    setRoster((prev) =>
      prev.map((e, i) =>
        i === idx ? { ...e, days: { ...e.days, [day]: !e.days[day] } } : e
      )
    );
  };

  const addStudent = () => {
    if (!newName.trim()) return;
    setRoster((prev) => [...prev, {
      name: newName.trim(),
      days: { 月: false, 火: false, 水: false, 木: false, 金: false },
    }]);
    setNewName('');
  };

  const remove = (idx: number) => {
    setRoster((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    await gasPost({ action: 'updateRoster', roster });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-sm font-bold">2年生 名簿</div>
          <div className="text-xs text-[var(--ink3)]">曜日ごとの登校スケジュールを管理</div>
        </div>
        <div className="flex gap-2 items-center">
          {saved && (
            <span className="text-sm text-[var(--green)] font-semibold bg-[var(--green-l)] px-3 py-1.5 rounded-lg">
              ✅ 保存しました
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-[var(--accent)] text-white rounded-lg font-bold text-xs disabled:opacity-50"
          >
            {saving ? '保存中...' : '💾 保存'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-[var(--ink3)] py-10">読み込み中...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="mgmt-table">
            <thead>
              <tr>
                <th className="w-12">No.</th>
                <th>生徒名</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="text-center w-14">
                    {DAY_ICONS[d]} {d}
                  </th>
                ))}
                <th className="w-14"></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((entry, i) => (
                <tr key={i}>
                  <td className="text-[var(--ink3)]">{i + 1}</td>
                  <td className="font-bold">{entry.name}</td>
                  {WEEKDAYS.map((d) => (
                    <td key={d} className="text-center">
                      <button
                        onClick={() => toggleDay(i, d)}
                        className={`w-8 h-8 rounded-lg border-2 text-xs font-bold transition-all ${
                          entry.days[d]
                            ? DAY_SEL[d]
                            : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                        }`}
                      >
                        {entry.days[d] ? '○' : ''}
                      </button>
                    </td>
                  ))}
                  <td>
                    <button onClick={() => remove(i)} className="btn-danger text-xs px-2 py-1 rounded">
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 生徒追加 */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
        <input
          type="text"
          placeholder="生徒名を入力"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStudent()}
          className="form-input flex-1 !max-w-none"
        />
        <button
          onClick={addStudent}
          className="px-5 py-2 bg-[var(--ink)] text-white rounded-lg font-bold text-xs"
        >
          ＋ 追加
        </button>
      </div>
    </div>
  );
}
