// ============================================================================
// 座席表の「並び」だけを描く（台帳 A4-107）
// ============================================================================
// ★ここは受け取った値を描くだけ。取りに行く・しぼる・置き場所を決めるは
//   親と lib の役目（置き場所の判断は lib/seatAssign.ts に集めてある）。
//
// ★★出してよいのは【氏名】と【座席の位置】だけ。
//   学年・コース・メール・要配慮情報を、あとからここに足さないこと。
//   学籍番号も画面には出しません（突き合わせにしか使わない）。
//
// 意匠（2026-09-18 社長指示）:
//   もとのスプレッドシート版は「全部が同じ太さの黒い四角」で、席も見出しも同じ重み
//   ＝どこを見ればよいか分からない状態でした。ここでは【教室の平面図】として描きます。
//   ・教卓は札ではなく“面”。左上に置いて部屋の向きを図で示す（実物と同じ位置）
//   ・在席と空席は形の重みで分ける（同じ四角にしない）
//   ・前後（行の間＝通路）と左右（隣の席）で余白の意味が違うので、間隔を変える
//   ・色は意味にだけ使う（違反＝赤／名簿に無い＝注意色／固定席＝小さな印）
import { nameLines } from '../../lib/seatChart';
import type { SeatGrid } from '../../lib/seatChart';

/** 氏名を姓と名で行分けして描く（狭い席の枠で名前の途中で切れないように） */
function SeatName({ name }: { name: string }) {
  return (
    <span className="seat-name">
      {nameLines(name).map((line, i) => (
        <span key={i} className="seat-name-line">
          {line}
        </span>
      ))}
    </span>
  );
}

type Props = {
  grid: SeatGrid;
  /** 編集中か（既定は閲覧だけ） */
  editing: boolean;
  /** いま選んでいる生徒（編集中のみ） */
  pickedId: string | null;
  /** 決まりごとに違反しているマス（"row/col"） */
  violatedCells: Set<string>;
  /** 固定席のマス（"row/col"） */
  fixedCells: Set<string>;
  onPickStudent: (studentId: string) => void;
  onPickCell: (row: number, col: number) => void;
};

export default function SeatGridView({
  grid,
  editing,
  pickedId,
  violatedCells,
  fixedCells,
  onPickStudent,
  onPickCell,
}: Props) {
  return (
    <div
      className="seat-plan-body"
      style={{ ['--seat-cols' as string]: String(grid.cols) }}
      role="group"
      aria-label="座席の並び"
    >
      {grid.cells.map((line) => (
        <div className="seat-row" key={line[0].row}>
          {/* 行の番号。平面図の目印（氏名よりずっと弱く） */}
          <span className="seat-row-no" aria-hidden="true">
            {line[0].row}
          </span>
          <div className="seat-row-cells">
            {line.map((cell) => {
              const key = cell.row + '/' + cell.col;
              const pos = cell.row + '列目 ' + cell.col + '番';
              const bad = cell.conflict || violatedCells.has(key);
              const student = cell.student;

              // ── 人がいる席 ───────────────────────────────────────
              if (student) {
                const picked = pickedId === student.student_id;
                const cls = [
                  'seat',
                  'seat--taken',
                  bad ? 'seat--bad' : '',
                  editing ? 'seat--pickable' : '',
                  picked ? 'seat--picked' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                const body = (
                  <>
                    <span className="seat-pos">{pos}</span>
                    <SeatName name={student.name} />
                    {fixedCells.has(key) && <span className="seat-flag">固定席</span>}
                  </>
                );

                if (!editing) {
                  return (
                    <div key={key} className={cls}>
                      {body}
                    </div>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    className={cls}
                    aria-pressed={picked}
                    onClick={() =>
                      picked ? onPickCell(cell.row, cell.col) : onPickStudent(student.student_id)
                    }
                  >
                    {body}
                  </button>
                );
              }

              // ── 名簿に居ない番号の席（★空席と区別して出す）─────────
              if (cell.orphan) {
                return (
                  <div key={key} className="seat seat--orphan" title="名簿に無い学籍番号の席です">
                    <span className="seat-pos">{pos}</span>
                    <span className="seat-name" aria-hidden="true">
                      ？
                    </span>
                    <span className="seat-flag">名簿に無い</span>
                  </div>
                );
              }

              // ── 空いている席 ─────────────────────────────────────
              if (editing && pickedId) {
                return (
                  <button
                    key={key}
                    type="button"
                    className="seat seat--empty seat--target"
                    onClick={() => onPickCell(cell.row, cell.col)}
                  >
                    <span className="seat-pos">{pos}</span>
                    <span className="seat-target-label">ここへ</span>
                  </button>
                );
              }
              return (
                <div key={key} className="seat seat--empty">
                  <span className="seat-pos">{pos}</span>
                  {/* ★空いていても固定席の印は出す。
                      押さえてある席が空席と同じ見た目だと、なぜ空いているのか分からない */}
                  {fixedCells.has(key) && <span className="seat-flag">固定席</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
