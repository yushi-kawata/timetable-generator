/* ============================================================================
   出欠を記録する手順（画面から切り離した部分）
   正本＝ ~/yushi-documents/意匠_時間割ツール_20260909_astra_v1.md「4」

   ★なぜ画面から切り離してあるか
     生徒に押してもらわなくても【順番そのもの】を試験できるようにするため。
     台帳 A4-86＝この順番が原因で、教務システム連携（dxCheckIn）が
     一度も呼ばれていなかった。生徒がいないと試せない作りだったので、
     同じ事故に気づけなかった。

   ★この順番で守っていること
     1. 校内の記録（checkIn / checkOut）が書けなかったときは、連携しない。
        学校に記録が無いのに教務システムだけ登録されると、後から突き合わせ
        できなくなる。
     2. 校内の記録が書けたなら、【確認の成否にかかわらず】連携は試す。
        「書けたことを確かめられたか」と「younetDX に登録すべきか」は別の話。
        ここを混ぜていたのが A4-86 の原因。
     3. 確認できていないのに「記録しました」とは書かない（表示は今までどおり）。
   ============================================================================ */

export type Op = 'in' | 'out';

/** 校内の記録が書けなかったときの理由。'' は理由が分からない */
export type SaveFailureKind = '' | 'signin' | 'forbidden' | 'network';

/** 画面に出す記録の状態（AttendancePanel の Req と同じ形） */
export type FlowReq =
  | { kind: 'idle' }
  | { kind: 'sending'; op: Op }
  | { kind: 'verifying'; op: Op }
  | { kind: 'failed'; op: Op }
  | { kind: 'unknown'; op: Op; retried: boolean };

/**
 * 記録の結末。★試験と、あとから読む人のために名前を付けてある。
 *  saveFailed    … 書けなかったことが確定（拒否・権限）。連携しない
 *  saveUnknown   … 書けたか分からない（通信）。連携しない
 *  confirmed     … 書けたことを取り直して確かめられた。連携する
 *  notConfirmed  … 書けたが、確かめられなかった。★それでも連携する
 *  superseded    … 追い越された（新しい操作が始まった）。そちらが連携する
 */
export type FlowOutcome =
  | 'saveFailed'
  | 'saveUnknown'
  | 'confirmed'
  | 'notConfirmed'
  | 'superseded';

export type RecordFlowDeps = {
  /** 校内の記録を書く（checkIn / checkOut）。false＝書けていない */
  save: (op: Op) => Promise<boolean>;
  /** 書けなかったときの理由を取る。'forbidden' / 'signin' は「書かれていない」が確定 */
  saveFailureKind: () => SaveFailureKind;
  /** 書けたことを裏側から取り直して確かめる */
  confirmSaved: (op: Op) => Promise<boolean>;
  /** 教務システム（younetDX）連携 */
  runDx: (op: Op) => Promise<void>;
  /** この手続きがまだ最新か（新しい操作に追い越されていないか） */
  isCurrent: () => boolean;
  /** 画面の状態を差し替える */
  setReq: (req: FlowReq) => void;
  /** 書き込みの返事が返った直後（遅延表示のタイマーを止めるため） */
  onSaveSettled?: () => void;
  /** 書けたことを確かめられた直後（フォーカス移動・下校ボタンの間引き） */
  onConfirmed?: (op: Op) => void;
};

export async function recordFlow(op: Op, d: RecordFlowDeps): Promise<FlowOutcome> {
  d.setReq({ kind: 'sending', op });

  const saved = await d.save(op);
  if (d.onSaveSettled) d.onSaveSettled();
  if (!d.isCurrent()) return 'superseded';

  // ── 1) 校内の記録そのものが書けていない ────────────────────────────
  // ★ここだけは younetDX に送らない。学校に記録が無いのに向こうだけ
  //   登録されると、あとで突き合わせができない（逆向きの事故になる）。
  if (!saved) {
    const kind = d.saveFailureKind();
    const certain = kind === 'forbidden' || kind === 'signin';
    d.setReq(certain ? { kind: 'failed', op } : { kind: 'unknown', op, retried: false });
    return certain ? 'saveFailed' : 'saveUnknown';
  }

  // ── 2) ここから先、校内の記録は書けている ──────────────────────────
  d.setReq({ kind: 'verifying', op });
  let confirmed = false;
  try {
    confirmed = await d.confirmSaved(op);
  } catch {
    // 確かめに失敗しただけ。記録が書けたことは上で分かっている
    confirmed = false;
  }
  if (!d.isCurrent()) return 'superseded';

  if (confirmed) {
    d.setReq({ kind: 'idle' });
    if (d.onConfirmed) d.onConfirmed(op);
  } else {
    // 確認できていないので「記録しました」とは書かない（表示は今までどおり）
    d.setReq({ kind: 'unknown', op, retried: false });
  }

  // ★★ここが A4-86 の修正点。confirmed が false でも連携は試す。
  await d.runDx(op);
  return confirmed ? 'confirmed' : 'notConfirmed';
}

export type VerifyFlowDeps = {
  confirmSaved: (op: Op) => Promise<boolean>;
  runDx: (op: Op) => Promise<void>;
  /** すでに送信できているか（できているなら二重に送らない） */
  dxAlreadySent: () => boolean;
  isCurrent: () => boolean;
  setReq: (req: FlowReq) => void;
  onConfirmed?: (op: Op) => void;
};

/**
 * 「記録を確認する」。新しい校内記録は作らない（読むだけ）。
 * ★2026-09-11（A4-86）: 記録が残っていることを確かめられたときに限り、
 *   教務システム連携を試す＝【再試行の経路】。
 *   確かめられていないときに送らないのは、校内に記録が無いまま向こうだけ
 *   登録するのを避けるため。
 */
export async function verifyFlow(op: Op, d: VerifyFlowDeps): Promise<FlowOutcome> {
  d.setReq({ kind: 'verifying', op });
  let confirmed = false;
  try {
    confirmed = await d.confirmSaved(op);
  } catch {
    confirmed = false;
  }
  if (!d.isCurrent()) return 'superseded';

  if (!confirmed) {
    d.setReq({ kind: 'unknown', op, retried: true });
    return 'notConfirmed';
  }

  d.setReq({ kind: 'idle' });
  if (d.onConfirmed) d.onConfirmed(op);
  if (!d.dxAlreadySent()) await d.runDx(op);
  return 'confirmed';
}
