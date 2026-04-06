import { useState } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { DAYS, ROOMS, PERIODS } from '../../types/master';
import type { DayOfWeek } from '../../types/master';

export default function AdminPage({ goTeacher }: { goTeacher: () => void }) {
  const { tt, updateTTCell, saveTT, gasUrl, setGasUrl } = useAppStore();
  const [editDay, setEditDay] = useState<DayOfWeek>('月');
  const [saved, setSaved] = useState(false);
  const [urlInput, setUrlInput] = useState(gasUrl);

  const handleSave = async () => {
    await saveTT();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <button onClick={goTeacher} className="btn-sub text-xs">📋 申告一覧を見る</button>
      </div>

      {/* GAS URL設定 */}
      <div className="card">
        <div className="card-title">🔗 データ共有設定（Google Apps Script）</div>
        <p className="text-xs text-[var(--ink3)] mb-3">
          GASのウェブアプリURLを設定すると、全端末でデータを共有できます。
          未設定の場合はこの端末のみにデータが保存されます。
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
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

      {/* 時間割編集 */}
      <div className="card">
        <div className="card-title">✏️ 時間割の編集</div>
        <div className="flex gap-3 items-center mb-4 flex-wrap">
          <select
            value={editDay}
            onChange={(e) => setEditDay(e.target.value as DayOfWeek)}
            className="sel-ctrl"
          >
            {DAYS.map((d) => <option key={d} value={d}>{d}曜日</option>)}
          </select>
          <button onClick={handleSave} className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-bold text-xs">
            💾 保存する
          </button>
          {saved && (
            <span className="text-sm text-[var(--green)] font-semibold bg-[var(--wed-l)] px-3 py-1.5 rounded-lg">
              ✅ 保存しました
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="mgmt-table">
            <thead>
              <tr>
                <th className="w-20">時限</th>
                {ROOMS.map((r) => <th key={r}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => {
                const p = PERIODS[i];
                return (
                  <tr key={i}>
                    <td className="text-center">
                      <strong>{p.label}</strong>
                      <br />
                      <span className="text-[10px] text-[var(--ink3)]">{p.time}</span>
                    </td>
                    {ROOMS.map((room) => (
                      <td key={room}>
                        <input
                          type="text"
                          value={tt[editDay]?.[room]?.[i] || ''}
                          onChange={(e) => updateTTCell(editDay, room, i, e.target.value)}
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
    </div>
  );
}
