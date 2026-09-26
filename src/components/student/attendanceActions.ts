/* ============================================================================
   出欠の枠の下に出す操作ボタンを決める（画面から切り離した部分）

   ★なぜ切り離してあるか
     「どの状態で、どのボタンを出すか」を、生徒に押してもらわなくても
     試験できるようにするため。

   ★守っていること
     ・送信に失敗した画面／成否が分からない画面では、記録し直すボタン
       （登校する・下校する・もう一度記録する）を【出さない】。
       出すのは「記録を確認する」だけ。
       記録できているかもしれないのに押し直させると、校内の記録と
       教務システムへの送信が二重になる恐れがある。
     ・「記録を確認する」で記録が【無い】と確かめられたら、ふだんの画面に
       戻る（attendanceFlow.ts の verifyFlow）。そこで初めて登校する／
       下校するが出る。
   ============================================================================ */

import type { Op, FlowReq } from './attendanceFlow';

export type AttendanceAction =
  /** 初期取得中。押せない「登校する」（理由は上の枠に出ている） */
  | { kind: 'loading' }
  /** 送信中・確認中。押せない「記録しています…」 */
  | { kind: 'busy' }
  /** 「記録を確認する」だけ */
  | { kind: 'verify'; op: Op }
  /** 登校する／下校する */
  | { kind: 'record'; op: Op }
  /** 登校の直後だけ、下校ボタンの場所を空けておく */
  | { kind: 'spacer' }
  /** 下校まで記録済み。大きな操作ボタンは出さない */
  | { kind: 'none' };

export function pickAttendanceAction(a: {
  loading: boolean;
  req: FlowReq;
  checkedIn: boolean;
  checkedOut: boolean;
  checkoutVisible: boolean;
}): AttendanceAction {
  if (a.loading) return { kind: 'loading' };
  if (a.req.kind === 'sending' || a.req.kind === 'verifying') return { kind: 'busy' };

  // ★成否不明・失敗確定のどちらも、まず確かめさせる（記録し直すボタンは出さない）
  if (a.req.kind === 'unknown' || a.req.kind === 'failed') {
    return { kind: 'verify', op: a.req.op };
  }

  if (a.checkedOut) return { kind: 'none' };
  if (a.checkedIn) {
    if (!a.checkoutVisible) return { kind: 'spacer' };
    return { kind: 'record', op: 'out' };
  }
  return { kind: 'record', op: 'in' };
}
