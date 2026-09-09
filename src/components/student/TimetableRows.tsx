import { DAYS, PERIODS, SELECTABLE_PERIODS } from '../../types/master';
import type { DayOfWeek, TimetableTemplate } from '../../types/master';

/* ============================================================================
   時間割（罫線で区切った行。★時限ごとにカードを作らない）
   1行の構成は「時限／授業と時間／教室」。
   狭い画面では教室を右端に押し込まず、授業名の下へ折り返す。
   ============================================================================ */

/** 授業のある時限（SHR は 0 番） */
const LESSON_PERIODS = [1, 2, 3, 4, 5];

type RoomOf = (day: DayOfWeek, period: number) => string;

type RowAction = { label: string; onClick: () => void };

function PeriodRow({ label, time, subject, room, unselected, action }: {
  label: string;
  time: string;
  subject: string;
  room: string;
  unselected?: boolean;
  action?: RowAction;
}) {
  return (
    <div className="ruled-row grid grid-cols-[3.25rem_1fr] gap-3 items-start">
      <div className="text-[0.8125rem] leading-5 font-bold text-[var(--ink2)]">{label}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {unselected ? (
            <span className="text-[1rem] leading-6 font-bold text-[var(--warning)]">未選択</span>
          ) : (
            <span className="text-[1rem] leading-6 font-bold text-[var(--ink)] break-words min-w-0">
              {subject || '授業はありません'}
            </span>
          )}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="text-[0.875rem] leading-5 font-bold text-[var(--accent)] underline underline-offset-2"
            >
              {action.label}
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[0.8125rem] leading-5 text-[var(--ink2)]">
          <span className="numeric">{time}</span>
          {room && <span className="break-words">{room}</span>}
        </div>
      </div>
    </div>
  );
}

function DayRows({ tt, day, roomOf, onOpenSelect }: {
  tt: TimetableTemplate;
  day: DayOfWeek;
  roomOf: RoomOf;
  onOpenSelect?: () => void;
}) {
  return (
    <div>
      <PeriodRow
        label={PERIODS[0].label}
        time={PERIODS[0].time}
        subject="ホームルーム"
        room=""
      />
      {LESSON_PERIODS.map(i => {
        const room = roomOf(day, i);
        const selectable = SELECTABLE_PERIODS.includes(i);
        return (
          <PeriodRow
            key={i}
            label={PERIODS[i].label}
            time={PERIODS[i].time}
            subject={room ? (tt[day]?.[room]?.[i] || '') : ''}
            room={room}
            unselected={selectable && !room}
            action={selectable && onOpenSelect
              ? { label: room ? '変更 →' : '選ぶ →', onClick: onOpenSelect }
              : undefined}
          />
        );
      })}
    </div>
  );
}

/** 今日の時間割 */
export function TodayTimetable({ tt, day, roomOf, onOpenWeek, onOpenSelect }: {
  tt: TimetableTemplate;
  day: DayOfWeek;
  roomOf: RoomOf;
  onOpenWeek: () => void;
  onOpenSelect: () => void;
}) {
  return (
    <section className="sheet-section" aria-labelledby="today-timetable-heading">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="today-timetable-heading" className="section-title">今日の時間割</h2>
        <button
          type="button"
          onClick={onOpenWeek}
          className="text-[0.875rem] leading-5 font-bold text-[var(--accent)] underline underline-offset-2"
        >
          週を見る →
        </button>
      </div>
      <div className="mt-2">
        <DayRows tt={tt} day={day} roomOf={roomOf} onOpenSelect={onOpenSelect} />
      </div>
    </section>
  );
}

/**
 * 週の時間割。
 * ★スマートフォンに月〜金の5列表を縮めて出さない。曜日を選んで、その日の行を出す。
 * ★「前週・翌週」は付けていない。この道具の時間割は週ごとに違う中身を持っておらず
 *   （曜日と教室で決まる1枚のひな形）、週を送る操作が指すものが無いため。
 */
export function WeekTimetable({ tt, selectedDay, todayDow, roomOf, onSelectDay, onBack }: {
  tt: TimetableTemplate;
  selectedDay: DayOfWeek;
  todayDow: DayOfWeek | null;
  roomOf: RoomOf;
  onSelectDay: (d: DayOfWeek) => void;
  onBack: () => void;
}) {
  return (
    <div className="sheet">
      <div className="sheet-heading">
        <h1 className="page-title">週の時間割</h1>
      </div>

      <div className="sheet-section">
        <div role="tablist" aria-label="曜日" className="flex gap-1">
          {DAYS.map(d => {
            const selected = d === selectedDay;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectDay(d)}
                className={`flex-1 min-w-0 min-h-[3rem] px-1 py-2 text-[1rem] leading-6 font-bold border-b-2 ${
                  selected
                    ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] text-[var(--ink2)] bg-[var(--surface)]'
                }`}
              >
                <span className="block">{d}</span>
                <span className="block text-[0.75rem] leading-4 font-normal text-[var(--ink2)]">
                  {d === todayDow ? '今日' : ' '}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          <DayRows tt={tt} day={selectedDay} roomOf={roomOf} />
        </div>
      </div>

      <div className="sheet-section">
        <button type="button" className="control-button w-full" onClick={onBack}>
          ← 今日に戻る
        </button>
      </div>
    </div>
  );
}
