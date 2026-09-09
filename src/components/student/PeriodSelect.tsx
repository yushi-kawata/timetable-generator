import { useState } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { PERIODS, ROOMS, SELECTABLE_PERIODS } from '../../types/master';
import type { DayOfWeek, TimetableTemplate } from '../../types/master';
import { weekRangeLabel } from './studentDate';

/* ============================================================================
   授業の選択（2・4・5限。裏側では period2 と呼ばれている記録）
   正本「4」の決めごと：
   ・対象週を見出し直下に明記する
   ・授業名と教室を付けたラジオ項目を並べる。項目全体を押せて、最小48px
   ・★選んだだけでは保存しない。「この内容で保存する」で確定する
   ・保存後は対象週と保存した内容を表示する
   ★選べる時限は SELECTABLE_PERIODS（＝2・4・5限）。原典の見出しは「2限の選択」だが、
     実物は3つの時限が対象なので、生徒に嘘にならない言い方にしてある。
   ============================================================================ */

type Save =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed' }
  /** 保存できたか分からない（通信が切れた等）。勝手に「保存しました」と書かない */
  | { kind: 'unknown' };

type Props = {
  tt: TimetableTemplate;
  day: DayOfWeek;
  /** 週キー（月曜日の日付） */
  weekKey: string;
  studentName: string;
  /** いまこの週に保存されている選択（全曜日ぶん） */
  saved: Partial<Record<DayOfWeek, Record<number, string>>>;
  onBack: () => void;
};

export default function PeriodSelect({ tt, day, weekKey, studentName, saved, onBack }: Props) {
  const savePeriod2 = useAppStore(s => s.savePeriod2);
  const fetchPeriod2 = useAppStore(s => s.fetchPeriod2);

  const savedToday = saved[day] || {};
  const [draft, setDraft] = useState<Record<number, string>>({ ...savedToday });
  const [state, setState] = useState<Save>({ kind: 'idle' });

  /** その時限に、実際に授業のある教室（＝選べるもの）だけを並べる */
  const optionsOf = (period: number) =>
    ROOMS
      .map(room => ({ room, subject: tt[day]?.[room]?.[period] || '' }))
      .filter(o => o.subject);

  const targets = SELECTABLE_PERIODS
    .map(p => ({ period: p, options: optionsOf(p) }))
    .filter(t => t.options.length > 0);

  const save = async () => {
    setState({ kind: 'saving' });
    const selections = { ...saved, [day]: draft };
    const ok = await savePeriod2(weekKey, studentName, selections);
    if (!ok) {
      const kind = useAppStore.getState().gasErrorKind;
      setState(kind === 'forbidden' || kind === 'signin' ? { kind: 'failed' } : { kind: 'unknown' });
      return;
    }
    // ★保存できたことを取り直して確かめてから「保存しました」を出す
    await fetchPeriod2(weekKey);
    const st = useAppStore.getState();
    if (st.gasError) { setState({ kind: 'unknown' }); return; }
    const mine = st.period2.find(p => p.week === weekKey && p.name === studentName);
    const stored = (mine?.selections[day] || {}) as Record<number, string>;
    const same = targets.every(t => (stored[t.period] || '') === (draft[t.period] || ''));
    setState(same ? { kind: 'saved' } : { kind: 'unknown' });
  };

  const busy = state.kind === 'saving';

  return (
    <div className="sheet">
      <div className="sheet-heading">
        <h1 className="page-title">授業の選択</h1>
        <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--ink2)]">
          対象週：<span className="numeric">{weekRangeLabel(weekKey)}</span>（{day}曜日）
        </p>
      </div>

      {targets.map(t => (
        <div key={t.period} className="sheet-section">
          {/* ★fieldset に罫線を付けない（legend が線を切って見た目が割れる）。
              罫線は外側の .sheet-section が持つ */}
          <fieldset disabled={busy} className="min-w-0">
            <legend className="section-title">{PERIODS[t.period].label}</legend>
            <p className="text-[0.8125rem] leading-5 text-[var(--ink2)]">
              <span className="numeric">{PERIODS[t.period].time}</span>
            </p>
            <div className="mt-3 space-y-2">
            {t.options.map(o => {
              const checked = draft[t.period] === o.room;
              return (
                <label key={o.room} className="choice-row" data-checked={checked}>
                  <input
                    type="radio"
                    name={`period-${t.period}`}
                    className="mt-1 w-5 h-5 shrink-0 accent-[var(--accent)]"
                    checked={checked}
                    onChange={() => {
                      setDraft(prev => ({ ...prev, [t.period]: o.room }));
                      setState({ kind: 'idle' });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[1rem] leading-6 font-bold break-words">{o.subject}</span>
                    <span className="block text-[0.8125rem] leading-5 text-[var(--ink2)] break-words">{o.room}</span>
                  </span>
                </label>
              );
            })}
            </div>
          </fieldset>
        </div>
      ))}

      <div className="sheet-section">
        <div role="status" className="min-h-[3rem]">
          {state.kind === 'saved' && (
            <div className="feedback-enter rounded-[var(--radius-control)] border border-[var(--success)] bg-[var(--success-bg)] p-3">
              <p className="text-[1rem] leading-6 font-bold text-[var(--success)]">✓ 保存しました</p>
              <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--ink2)]">
                対象週：<span className="numeric">{weekRangeLabel(weekKey)}</span>（{day}曜日）
              </p>
              <ul className="mt-2 space-y-1">
                {targets.map(t => (
                  <li key={t.period} className="text-[0.875rem] leading-5 text-[var(--ink)]">
                    {PERIODS[t.period].label}：{draft[t.period]
                      ? `${tt[day]?.[draft[t.period]]?.[t.period] || ''}（${draft[t.period]}）`
                      : '未選択'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.kind === 'failed' && (
            <p className="rounded-[var(--radius-control)] border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-[0.875rem] leading-5 text-[var(--danger)]">
              保存できませんでした。もう一度お試しください。何度も同じ表示が出るときは、先生にお伝えください。
            </p>
          )}
          {state.kind === 'unknown' && (
            <p className="rounded-[var(--radius-control)] border border-[var(--warning)] bg-[var(--warning-bg)] p-3 text-[0.875rem] leading-5 text-[var(--warning)]">
              保存できたかどうかを確認できませんでした。時間を置いて、この画面をもう一度開いて確かめてください。
            </p>
          )}
        </div>

        <button
          type="button"
          className="control-button primary-button w-full mt-3"
          onClick={save}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? '保存しています…' : 'この内容で保存する'}
        </button>

        <button type="button" className="control-button w-full mt-2" onClick={onBack}>
          ← 今日に戻る
        </button>
      </div>
    </div>
  );
}
