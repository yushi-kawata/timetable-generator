import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAYS, DAY_ICONS, ROOMS, PERIODS } from '../../types/master';
import type { DayOfWeek, Student } from '../../types/master';

const DAY_SEL: Record<DayOfWeek, string> = {
  月: 'border-[var(--mon)] bg-[var(--mon-l)] text-[var(--mon)]',
  火: 'border-[var(--tue)] bg-[var(--tue-l)] text-[var(--tue)]',
  水: 'border-[var(--wed)] bg-[var(--wed-l)] text-[var(--wed)]',
  木: 'border-[var(--thu)] bg-[var(--thu-l)] text-[var(--thu)]',
  金: 'border-[var(--fri)] bg-[var(--fri-l)] text-[var(--fri)]',
};

export default function AdminPage({ goTeacher }: { goTeacher: () => void }) {
  const { students, saveStudents, tt, updateTTCell, saveTT, gasUrl, setGasUrl, fetchStudents } = useAppStore();
  const [tab, setTab] = useState<'students' | 'timetable' | 'settings'>('students');
  const [localStudents, setLocalStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('2年');
  const [newClassroom, setNewClassroom] = useState('学年教室');
  const [newDxEmail, setNewDxEmail] = useState('');
  const [newDxPassword, setNewDxPassword] = useState('');
  // 保存の結果。★「保存しました」だけでなく、断られた理由も必ず画面に出す
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  // 名簿の全消しを一度断られた状態（もう一度押せば消せる）
  const [wipeArmed, setWipeArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDay, setEditDay] = useState<DayOfWeek>('月');
  const [ttMsg, setTtMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [urlInput, setUrlInput] = useState(gasUrl);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    setLocalStudents([...students]);
  }, [students]);

  const toggleDay = (idx: number, day: DayOfWeek) => {
    setLocalStudents(prev =>
      prev.map((s, i) =>
        i === idx ? { ...s, days: { ...s.days, [day]: !s.days[day] } } : s
      )
    );
  };

  const updateStudent = (idx: number, field: string, value: string) => {
    setLocalStudents(prev =>
      prev.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    );
  };

  const addStudent = () => {
    if (!newName.trim()) return;
    setLocalStudents(prev => [...prev, {
      name: newName.trim(),
      grade: newGrade,
      classroom: newClassroom,
      dx_email: newDxEmail.trim(),
      dx_password: newDxPassword,
      days: { 月: false, 火: false, 水: false, 木: false, 金: false },
    }]);
    setNewName('');
    setNewDxEmail('');
    setNewDxPassword('');
  };

  const removeStudent = (idx: number) => {
    setLocalStudents(prev => prev.filter((_, i) => i !== idx));
  };

  // ★空の名簿で保存しようとしたときだけ「全消し」の確認が要る
  const isWipe = localStudents.length === 0;
  const wipeConfirmReady = wipeArmed && isWipe;

  const handleSaveStudents = async () => {
    if (saving) return;
    setSaving(true);
    setSaveMsg(null);
    // 一度断られたあとの2回目だけ confirmEmpty を送る
    const res = await saveStudents(localStudents, wipeConfirmReady);
    setSaving(false);

    if (res.ok) {
      setWipeArmed(false);
      setSaveMsg({ kind: 'ok', text: '保存しました' });
      setTimeout(() => setSaveMsg(null), 3000);
      return;
    }
    if (res.needsWipeConfirm) {
      // refuseWipe。★裏側はまだ何も消していない
      setWipeArmed(true);
      setSaveMsg({ kind: 'warn', text: res.message });
      return;
    }
    // badPayload / 拒否 / 通信の失敗
    setWipeArmed(false);
    setSaveMsg({ kind: 'error', text: res.message });
  };

  const handleSaveTT = async () => {
    setTtMsg(null);
    const ok = await saveTT();
    if (ok) {
      setTtMsg({ kind: 'ok', text: '保存しました' });
      setTimeout(() => setTtMsg(null), 3000);
    } else {
      setTtMsg({ kind: 'error', text: '保存できませんでした。もう一度お試しください' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <button onClick={goTeacher} className="btn-sub text-xs">📋 出席管理を見る</button>
      </div>

      {/* タブ */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'students' as const, label: '👥 生徒マスター' },
          { id: 'timetable' as const, label: '✏️ 時間割編集' },
          { id: 'settings' as const, label: '⚙️ 設定' },
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

      {/* 生徒マスター */}
      {tab === 'students' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="card-title !mb-0">👥 生徒マスター</div>
              <div className="text-xs text-[var(--ink3)]">名前・学年・所属教室・登校曜日を管理</div>
            </div>
            <div className="flex gap-2 items-center">
              {saveMsg?.kind === 'ok' && (
                <span className="text-sm text-[var(--green)] font-semibold bg-[var(--green-l)] px-3 py-1.5 rounded-lg">
                  ✅ {saveMsg.text}
                </span>
              )}
              <button
                onClick={handleSaveStudents}
                disabled={saving}
                className={`px-5 py-2 rounded-lg font-bold text-xs text-white disabled:opacity-60 ${
                  wipeConfirmReady ? 'bg-[var(--red,#b91c1c)] bg-red-700 hover:bg-red-800' : 'bg-[var(--accent)] hover:bg-blue-800'
                }`}
              >
                {saving ? '保存中...' : wipeConfirmReady ? '全員を消して保存' : '💾 保存'}
              </button>
            </div>
          </div>

          {/* ★断られたときの理由。ここを出さないと「押したのに何も起きない」になる */}
          {saveMsg && saveMsg.kind !== 'ok' && (
            <div
              role="alert"
              className={`mb-4 px-4 py-3 rounded-lg text-sm leading-relaxed border ${
                saveMsg.kind === 'warn'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <span className="font-bold">{saveMsg.kind === 'warn' ? '⚠️ ' : '❌ '}</span>
              {saveMsg.text}
              {saveMsg.kind === 'warn' && (
                <button
                  onClick={() => { setWipeArmed(false); setSaveMsg(null); }}
                  className="ml-3 underline font-bold hover:no-underline"
                >
                  やめる
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th className="w-12">No.</th>
                  <th>生徒名</th>
                  <th>学年</th>
                  <th>所属教室</th>
                  <th>DXメール</th>
                  <th>DXパスワード</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-center w-14">{DAY_ICONS[d]} {d}</th>
                  ))}
                  <th className="w-14"></th>
                </tr>
              </thead>
              <tbody>
                {localStudents.map((s, i) => (
                  <tr key={i}>
                    <td className="text-[var(--ink3)]">{i + 1}</td>
                    <td className="font-bold">{s.name}</td>
                    <td>
                      <select
                        value={s.grade}
                        onChange={e => updateStudent(i, 'grade', e.target.value)}
                        className="sel-ctrl text-xs"
                      >
                        <option value="1年">1年</option>
                        <option value="2年">2年</option>
                        <option value="3年">3年</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={s.classroom}
                        onChange={e => updateStudent(i, 'classroom', e.target.value)}
                        className="sel-ctrl text-xs"
                      >
                        <option value="通常">通常</option>
                        <option value="Growth">Growth</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={(s as any).dx_email || s.dx_email || ''}
                        onChange={e => updateStudent(i, 'dx_email', e.target.value)}
                        placeholder="email"
                        className="tbl-input text-xs"
                      />
                    </td>
                    <td>
                      {/* ★2026-09-02（台帳A4-41）: 既存のパスワードは表示しない。
                          空のまま保存すると裏側が既存を据え置く＝消えない。 */}
                      <input
                        type="password"
                        value={(s as any).dx_password || ''}
                        onChange={e => updateStudent(i, 'dx_password', e.target.value)}
                        placeholder={(s as any).has_password ? '設定済み（変更時のみ入力）' : '未設定'}
                        title={(s as any).has_password
                          ? 'パスワードは設定済みです。空のままにすると今の値がそのまま残ります。変えたいときだけ入力してください。'
                          : 'まだ設定されていません。'}
                        className="tbl-input text-xs"
                      />
                    </td>
                    {DAYS.map(d => (
                      <td key={d} className="text-center">
                        <button
                          onClick={() => toggleDay(i, d)}
                          className={`w-8 h-8 rounded-lg border-2 text-xs font-bold transition-all ${
                            s.days[d]
                              ? DAY_SEL[d]
                              : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--ink3)]'
                          }`}
                        >
                          {s.days[d] ? '○' : ''}
                        </button>
                      </td>
                    ))}
                    <td>
                      <button onClick={() => removeStudent(i)} className="btn-danger text-xs px-2 py-1 rounded">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 生徒追加 */}
          <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)] items-center flex-wrap">
            <input
              type="text"
              placeholder="生徒名"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStudent()}
              className="form-input flex-1 !max-w-none"
            />
            <select value={newGrade} onChange={e => setNewGrade(e.target.value)} className="sel-ctrl text-xs">
              <option value="1年">1年</option>
              <option value="2年">2年</option>
              <option value="3年">3年</option>
            </select>
            <select value={newClassroom} onChange={e => setNewClassroom(e.target.value)} className="sel-ctrl text-xs">
              <option value="学年教室">学年教室</option>
              <option value="B教室">B教室</option>
            </select>
            <input
              type="text"
              placeholder="DXメール"
              value={newDxEmail}
              onChange={e => setNewDxEmail(e.target.value)}
              className="form-input !max-w-[180px] text-xs"
            />
            <input
              type="text"
              placeholder="DXパスワード"
              value={newDxPassword}
              onChange={e => setNewDxPassword(e.target.value)}
              className="form-input !max-w-[140px] text-xs"
            />
            <button onClick={addStudent} className="px-5 py-2 bg-[var(--ink)] text-white rounded-lg font-bold text-xs">
              ＋ 追加
            </button>
          </div>
        </div>
      )}

      {/* 時間割編集 */}
      {tab === 'timetable' && (
        <div className="card">
          <div className="card-title">✏️ 時間割の編集</div>
          <div className="flex gap-3 items-center mb-4 flex-wrap">
            <select
              value={editDay}
              onChange={e => setEditDay(e.target.value as DayOfWeek)}
              className="sel-ctrl"
            >
              {DAYS.map(d => <option key={d} value={d}>{d}曜日</option>)}
            </select>
            <button onClick={handleSaveTT} className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-bold text-xs">
              💾 保存する
            </button>
            {ttMsg?.kind === 'ok' && (
              <span className="text-sm text-[var(--green)] font-semibold bg-[var(--green-l)] px-3 py-1.5 rounded-lg">
                ✅ {ttMsg.text}
              </span>
            )}
            {ttMsg?.kind === 'error' && (
              <span role="alert" className="text-sm text-red-700 font-semibold bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                ❌ {ttMsg.text}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="mgmt-table">
              <thead>
                <tr>
                  <th className="w-20">時限</th>
                  {ROOMS.map(r => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => {
                  const p = PERIODS[i];
                  return (
                    <tr key={i}>
                      <td className="text-center">
                        <strong>{p.label}</strong>
                        <br />
                        <span className="text-[10px] text-[var(--ink3)]">{p.time}</span>
                      </td>
                      {ROOMS.map(room => (
                        <td key={room}>
                          <input
                            type="text"
                            value={tt[editDay]?.[room]?.[i] || ''}
                            onChange={e => updateTTCell(editDay, room, i, e.target.value)}
                            placeholder="授業名"
                            className="tbl-input"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 設定 */}
      {tab === 'settings' && (
        <div className="card">
          <div className="card-title">🔗 データ共有設定（Google Apps Script）</div>
          <p className="text-xs text-[var(--ink3)] mb-3">
            GASのウェブアプリURLを設定すると、全端末でデータを共有できます。
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/xxxxx/exec"
              className="form-input flex-1 !max-w-none text-xs"
            />
            <button
              onClick={() => setGasUrl(urlInput.trim())}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-bold text-xs"
            >
              保存
            </button>
          </div>
          {gasUrl && (
            <div className="text-xs text-[var(--green)] mt-2 font-semibold">✅ GAS連携中</div>
          )}
        </div>
      )}
    </div>
  );
}
