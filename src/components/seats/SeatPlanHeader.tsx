// ============================================================================
// 座席表の見出し帯（台帳 A4-107）
// ============================================================================
// もとのスプレッドシートと同じ3点を、同じ位置関係で置きます。
//   左   … 教卓（実物は A1:B2＝左上の2マス分）
//   中央 … 曜日   ★ここが操作子を兼ねる（見出しを押して曜日を変える）
//   右   … 教室名
//
// ★教卓は「ラベル」ではなく【面】として描きます。
//   部屋の向き（どちらが前か）が図で分かることが、この帯の仕事です。
//
// ★「①②」への備え（2026-09-18）:
//   もとの見出しは「水曜日①」でした。①②は“作り置きした座席表の在庫”で、
//   いまは保存せずその場で作る方針（秘書判断）なので、曜日だけを単位にしています。
//   後から「気に入った案をストックする」に戻せるよう、見出しに枠（slot）を
//   1つ差し込める形だけ残してあります。★使う日が来たらここに札を出すだけ。
import type { DayOfWeek } from '../../types/master';
import { DAYS } from '../../types/master';

type Props = {
  day: DayOfWeek;
  /** 教室名（実物の見出しと同じ位置に出す） */
  room: string;
  /** ★「①」のような枠の札。いまは使っていない（在庫を持たない方針） */
  slot?: string;
  onSelectDay: (day: DayOfWeek) => void;
};

export default function SeatPlanHeader({ day, room, slot, onSelectDay }: Props) {
  return (
    <header className="seat-plan-head">
      {/* 左＝教卓。部屋の前がどちらかを示す面 */}
      <div className="seat-desk" aria-label="教卓（教室の前）">
        <span className="seat-desk-label">教卓</span>
      </div>

      {/* 中央＝曜日。見出しそのものを操作子にする */}
      <div className="seat-days" role="group" aria-label="曜日を選ぶ">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            className="seat-day"
            aria-pressed={d === day}
            onClick={() => onSelectDay(d)}
          >
            <span className="seat-day-ja">{d}</span>
            <span className="seat-day-suffix">曜日</span>
          </button>
        ))}
        {slot && <span className="seat-slot">{slot}</span>}
      </div>

      {/* 右＝教室名 */}
      <div className="seat-room-name">{room}</div>
    </header>
  );
}
