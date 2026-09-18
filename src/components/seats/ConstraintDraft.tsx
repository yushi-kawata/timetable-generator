// ============================================================================
// 決まりごとの下書き補助（台帳 A4-107）
// ============================================================================
// なぜ要るか:
//   先生は【氏名】でしか決まりごとを把握していません。いっぽう決まりごとの台帳は
//   【学籍番号】で持ちます（氏名だと同姓同名で黙って消えるため）。
//   26名ぶんの番号を名簿から引くのは手間なので、
//   「氏名を選ぶ → 貼り付けられる行ができる」だけを用意します。
//
// ★書き込みはしません。貼り付け用の文字を出すだけです（今日の範囲を広げないため）。
// ★学籍番号がここに出ます。座席表そのものには出しません。
//   この補助は先生用の画面で、編集に切り替えたときだけ開きます。
//
// ★★「制約」タブの形（2026-09-18 に裏側の実物 v4 で確認済み）:
//     A=種別  B=学籍番号  C=学籍番号2  D=行  E=列 （F=メモは裏側が読みません）
//   ・種別は【日本語】で書きます＝固定席 / 禁止席 / 引き離し / 近づけたい / 右寄せ
//     （英語で書くと裏側が拒否します。英語になるのは裏側が返すときだけ）
//   ・引き離し・近づけたい … B と C の2人ぶん。★D・E は空でないと拒否されます
//   ・右寄せ             … B だけ。★C・D・E は空でないと拒否されます
//   ・固定席・禁止席       … B と D・E
// ★見出し行は出しません。台帳にそのまま貼れる【中身の行だけ】にしてあります
//   （見出しを貼ると、その行が種別「種別」の決まりごととして拒否されるため）。
import { useMemo, useState } from 'react';
import type { SeatStudent } from '../../lib/seatChart';

/** ★台帳に書く種別は日本語。これがそのままA列に入る */
type Kind = '固定席' | '禁止席' | '引き離し' | '近づけたい' | '右寄せ';

const KINDS: { key: Kind; note: string }[] = [
  { key: '固定席', note: 'この人はこの席（絶対）' },
  { key: '禁止席', note: 'この人はこの席はだめ（絶対）' },
  { key: '引き離し', note: 'この2人は近いとだめ（絶対）' },
  { key: '近づけたい', note: 'できる限り近くに（希望）' },
  { key: '右寄せ', note: 'できる限り右の列へ（弱い希望）' },
];

/** 2人組の作り方 */
type PairMode = 'all' | 'hub';

type Props = {
  students: SeatStudent[];
  rows: number;
  cols: number;
};

export default function ConstraintDraft({ students, rows, cols }: Props) {
  const [kind, setKind] = useState<Kind>('引き離し');
  const [picked, setPicked] = useState<string[]>([]);
  const [pairMode, setPairMode] = useState<PairMode>('all');
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(1);
  const [copied, setCopied] = useState(false);

  const needsSeat = kind === '固定席' || kind === '禁止席';
  const needsPair = kind === '引き離し' || kind === '近づけたい';

  const toggle = (id: string) => {
    setCopied(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of students) m[s.student_id] = s.name;
    return m;
  }, [students]);

  /**
   * 貼り付け用の行。★台帳の列そのまま（A=種別 B=学籍番号 C=学籍番号2 D=行 E=列）。
   * ★見出し行は出しません（貼ると、その行が種別「種別」の決まりごととして拒否されます）。
   * ★種別ごとに、入れてよい列だけを埋めます。
   *   余計な列を埋めると裏側が【無視ではなく拒否】します（v4 で確認済み）。
   */
  const text = useMemo(() => {
    const TAB = '\t';
    const lines: string[] = [];

    if (needsSeat) {
      // 固定席 / 禁止席 … A=種別 B=学籍番号 C=（空） D=行 E=列
      for (const id of picked) lines.push([kind, id, '', row, col].join(TAB));
    } else if (needsPair) {
      // 引き離し / 近づけたい … A=種別 B=学籍番号 C=学籍番号2（★D・Eは入れない）
      if (pairMode === 'all') {
        // 選んだ全員どうし（3人を選べば3組＝三角の関係になる）
        for (let i = 0; i < picked.length; i++) {
          for (let j = i + 1; j < picked.length; j++) {
            lines.push([kind, picked[i], picked[j]].join(TAB));
          }
        }
      } else {
        // 最初に選んだ1人と、ほかの全員（1人のまわりに集める形）
        const [hub, ...rest] = picked;
        for (const other of rest) lines.push([kind, hub, other].join(TAB));
      }
    } else {
      // 右寄せ … A=種別 B=学籍番号 だけ（★C・D・Eは入れない）
      for (const id of picked) lines.push([kind, id].join(TAB));
    }

    return lines.join('\n');
  }, [kind, picked, pairMode, row, col, needsSeat, needsPair]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // 使えない端末もある。★「写しました」と嘘をつかない
      setCopied(false);
    }
  };

  return (
    <section className="cdraft">
      <h3 className="cdraft-title">決まりごとの下書き（貼り付け用）</h3>
      <p className="cdraft-note">
        氏名を選ぶと、台帳に貼れる行（学籍番号入り）ができます。
        <strong>ここから書き込むことはありません。</strong>
      </p>

      {/* 種別 */}
      <div className="cdraft-kinds">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className="cdraft-kind"
            aria-pressed={k.key === kind}
            onClick={() => {
              setKind(k.key);
              setPicked([]);
              setCopied(false);
            }}
          >
            <span className="cdraft-kind-label">{k.key}</span>
            <span className="cdraft-kind-note">{k.note}</span>
          </button>
        ))}
      </div>

      {/* 席の指定 */}
      {needsSeat && (
        <div className="cdraft-seat">
          <label>
            前から
            <input
              type="number"
              min={1}
              max={rows}
              value={row}
              onChange={(e) => setRow(Number(e.target.value) || 1)}
            />
            列目
          </label>
          <label>
            左から
            <input
              type="number"
              min={1}
              max={cols}
              value={col}
              onChange={(e) => setCol(Number(e.target.value) || 1)}
            />
            番
          </label>
        </div>
      )}

      {/* 組の作り方 */}
      {needsPair && (
        <div className="cdraft-pairmode">
          <button
            type="button"
            className="cdraft-mode"
            aria-pressed={pairMode === 'all'}
            onClick={() => setPairMode('all')}
          >
            選んだ全員どうし
          </button>
          <button
            type="button"
            className="cdraft-mode"
            aria-pressed={pairMode === 'hub'}
            onClick={() => setPairMode('hub')}
          >
            最初の1人と、ほかの全員
          </button>
        </div>
      )}

      {/* 氏名を選ぶ */}
      <div className="cdraft-names">
        {students.map((s) => (
          <button
            key={s.student_id}
            type="button"
            className="cdraft-name"
            aria-pressed={picked.includes(s.student_id)}
            onClick={() => toggle(s.student_id)}
          >
            {picked.includes(s.student_id) && needsPair && pairMode === 'hub' && (
              <span className="cdraft-order">{picked.indexOf(s.student_id) + 1}</span>
            )}
            {s.name}
          </button>
        ))}
      </div>

      {/* 出来上がり */}
      <div className="cdraft-out">
        <div className="cdraft-out-head">
          <span>
            選んだ人：{picked.length} 人
            {picked.length > 0 && (
              <span className="cdraft-picked">
                （{picked.map((id) => nameOf[id]).join('・')}）
              </span>
            )}
          </span>
          <div className="cdraft-out-buttons">
            <button type="button" className="control-button" onClick={copy} disabled={!text}>
              {copied ? '写しました' : '文字を写す'}
            </button>
            <button
              type="button"
              className="control-button"
              onClick={() => {
                setPicked([]);
                setCopied(false);
              }}
              disabled={picked.length === 0}
            >
              選び直す
            </button>
          </div>
        </div>
        <textarea
          className="cdraft-text"
          readOnly
          rows={6}
          value={text}
          placeholder="氏名を選ぶと、ここに貼り付け用の行が出ます"
        />
        <p className="cdraft-note">
          「制約」タブの <strong>A列（種別）から</strong> 貼ってください。
          列の並びは <strong>A=種別／B=学籍番号／C=学籍番号2／D=行／E=列</strong> です。
          <strong>見出し行は入れていません。</strong>
        </p>
        <p className="cdraft-note">
          ★同じ2人を「引き離し」と「近づけたい」の両方に入れると、台帳を読むときに断られます。
        </p>
      </div>
    </section>
  );
}
