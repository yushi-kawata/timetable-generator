// ============================================================================
// 座席表の窓口（GAS）── 台帳 A4-107
// ============================================================================
// ★★窓口の差し替えはこのファイルだけで済むようにしてあります。
//   ・URL      … 既存の窓口と同じ（useMasterStore の currentGasUrl が正本）
//   ・action名 … 下の SEAT_CHART_ACTION（2026-09-18 に裏側と合わせて 'getSeating' で確定）
//   画面側（SeatChartPage）は URL も action も知りません。
//
// 送り方の約束は既存の gasCall と同じ（理由は useMasterStore の頭の注記が正本）:
//   ・POST だけ。GET は使わない（資格情報を URL に載せない）
//   ・Content-Type を付けない（プリフライトが飛ぶと GAS では通らない）
//   ・mode:'no-cors' は使わない（拒否されたことに気づけなくなる）
//   ・未ログインなら叩かずに手前で止める
//
// ★返事は必ず normalizeSeatChart を通します。窓口が余計な列（学年・コース・
//   メール・パスワード・要配慮情報）を返してきても、画面には届きません。
import { auth, isAllowedDomain } from '../firebase';
import { currentGasUrl } from '../stores/useMasterStore';
import { normalizeSeatChart } from './seatChart';
import { constraintIssues, normalizeConstraints } from './seatAssign';
import type { SeatConstraints } from './seatAssign';
import type { Seat, SeatChart } from './seatChart';
import type { DayOfWeek } from '../types/master';

/**
 * ★窓口名。2026-09-18 に web-uragawa と合わせて確定（裏側の実装と一致）。
 *   ★差し替えるときはここだけ直す。画面側は action を知らない。
 *   約束した返事の形:
 *     { students:[{student_id,name,days:{月..金}}], seats:[{student_id,row,col}], asof:"..." }
 */
export const SEAT_CHART_ACTION = 'getSeating';

/**
 * ★保存の窓口名。裏側が用意します（時間割ツールのブックに書く／名簿ブックには書かない）。
 *   送る形（★web-uragawa と合わせること）:
 *     { action:'saveSeating', idToken, day:'水', seats:[{student_id,row,col}] }
 *   ★曜日ごとに別の配置なので、保存も【その曜日の分だけ】送ります。
 */
export const SEAT_SAVE_ACTION = 'saveSeating';

// ★campus は【送りません】（2026-09-18 裏側の実物確認で判明）。
//   本番の doPost は読み取り系を doGet へ委譲するとき action / idToken / date / week の
//   4つしか転送しない作りで、campus は転送されずに捨てられます。エラーも出ません。
//   ＝「絞っているつもりで、実は絞られていない」という、壊れても誰にも見えない形になる。
//   いまの窓口は「生徒一覧（通学）」＝福岡GCの対象者をそのまま返し、社長決裁 C-5 も
//   対象を福岡GCの教室だけと定めているので、そもそも絞る軸が要りません。
//   ★裏側が転送するようになるまで、ここに campus を足し直さないこと。
//   ★他センターへ広げる日が来たら、まず裏側の転送リストの手当てから（別案件）。

export type SeatChartFetch =
  | {
      ok: true;
      chart: SeatChart;
      constraints: SeatConstraints;
      /** 読み取れなかった決まりごとの知らせ（★黙って捨てないため） */
      constraintIssues: string[];
      demo: boolean;
    }
  | { ok: false; message: string; hint: string };

export type SeatSaveResult =
  | { ok: true }
  | { ok: false; message: string; hint: string };

const MSG_FAILED = '座席表を取得できませんでした';

/**
 * 見本データを使うか。
 * ★本番のビルドでは常に false（import.meta.env.DEV が false に畳まれる）。
 *   開発サーバーで ?seatDemo=1 を付けたときだけ true。
 */
export function isSeatDemo(search: string): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(search).get('seatDemo') === '1';
}

/** 座席表を1回取りに行く。★失敗したら前のデータは返さない（呼び出し側で消す） */
export async function fetchSeatChart(search: string): Promise<SeatChartFetch> {
  // ★ここに import.meta.env.DEV を【そのまま】書くこと。
  //   ビルドのときに false へ畳まれ、下の import ごと丸ごと消える
  //   （＝見本データは本番の成果物に1バイトも載らない）。
  //   isSeatDemo() の中だけの判定に任せると、ビルド後も見本の塊が dist に残る（実測済み）。
  if (import.meta.env.DEV && isSeatDemo(search)) {
    const mod = await import('./seatChartDemo');
    const norm = normalizeSeatChart(mod.DEMO_SEAT_CHART);
    if (!norm.ok) return { ok: false, message: MSG_FAILED, hint: '見本データの形が壊れています' };
    return {
      ok: true,
      chart: norm.chart,
      constraints: normalizeConstraints(mod.DEMO_SEAT_CHART.constraints),
      constraintIssues: constraintIssues(mod.DEMO_SEAT_CHART.constraints),
      demo: true,
    };
  }

  const url = currentGasUrl();
  if (!url) return { ok: false, message: MSG_FAILED, hint: '窓口の設定がありません。先生にご連絡ください' };

  const user = auth.currentUser;
  if (!user || !isAllowedDomain(user.email || '') || user.emailVerified !== true) {
    return { ok: false, message: MSG_FAILED, hint: 'ログインし直してください' };
  }

  let idToken = '';
  try {
    idToken = await user.getIdToken();
  } catch {
    idToken = '';
  }
  if (!idToken) return { ok: false, message: MSG_FAILED, hint: 'ログインし直してください' };

  let json: unknown;
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: SEAT_CHART_ACTION, idToken }),
      redirect: 'follow',
    });
    if (!res.ok) {
      return { ok: false, message: MSG_FAILED, hint: '通信の状態を確かめて、もう一度お試しください' };
    }
    json = await res.json();
  } catch {
    return { ok: false, message: MSG_FAILED, hint: '通信の状態を確かめて、もう一度お試しください' };
  }

  // ★配列かどうかより先に error を見る（拒否を「0件」と読み違えないため）
  const err = (json as { error?: unknown } | null)?.error;
  if (err) {
    const reason = String((json as { reason?: unknown }).reason || err);
    if (err === 'unauthorized') {
      return { ok: false, message: MSG_FAILED, hint: 'ログインし直してください' };
    }
    if (err === 'forbidden') {
      return {
        ok: false,
        message: MSG_FAILED,
        hint: 'この画面は先生用です。ログインし直しても変わりません',
      };
    }
    // 窓口がまだ無い（invalid action）など、作りの問題
    return { ok: false, message: MSG_FAILED, hint: `窓口が応じませんでした（${reason}）` };
  }

  const norm = normalizeSeatChart(json);
  if (!norm.ok) {
    const hint =
      norm.reason === 'noAsof'
        ? 'いつの座席表か分からないため表示しません'
        : '受け取った形が想定と違います。先生にご連絡ください';
    return { ok: false, message: MSG_FAILED, hint };
  }
  // ★決まりごと（固定席・禁止席・引き離し）は、窓口がまだ返していなくても動くように
  //   「無ければ無し」で読む。ここで落とすと、決まりごとが無いだけで座席表が出なくなる。
  const rawConstraints = (json as { constraints?: unknown }).constraints;
  const constraints = normalizeConstraints(rawConstraints);
  return {
    ok: true,
    chart: norm.chart,
    constraints,
    constraintIssues: constraintIssues(rawConstraints),
    demo: false,
  };
}

/**
 * その曜日の並びを保存する。
 * ★押すまで保存されません（画面側が「未保存」を出すこと）。
 * ★失敗を成功に見せないこと。裏側が ok を返したときだけ成功にします。
 */
export async function saveSeating(day: DayOfWeek, seats: Seat[]): Promise<SeatSaveResult> {
  if (isSeatDemo(window.location.search)) {
    return {
      ok: false,
      message: '保存できませんでした',
      hint: '見本データの表示中は保存しません（窓口につながっていません）',
    };
  }

  const url = currentGasUrl();
  if (!url) return { ok: false, message: '保存できませんでした', hint: '窓口の設定がありません' };

  const user = auth.currentUser;
  if (!user || !isAllowedDomain(user.email || '') || user.emailVerified !== true) {
    return { ok: false, message: '保存できませんでした', hint: 'ログインし直してください' };
  }
  let idToken = '';
  try {
    idToken = await user.getIdToken();
  } catch {
    idToken = '';
  }
  if (!idToken) return { ok: false, message: '保存できませんでした', hint: 'ログインし直してください' };

  let json: unknown;
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        action: SEAT_SAVE_ACTION,
        idToken,
        day,
        seats: seats.map((s) => ({ student_id: s.student_id, row: s.row, col: s.col })),
      }),
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        ok: false,
        message: '保存できませんでした',
        hint: '通信の状態を確かめて、もう一度お試しください',
      };
    }
    json = await res.json();
  } catch {
    return {
      ok: false,
      message: '保存できませんでした',
      hint: '通信の状態を確かめて、もう一度お試しください',
    };
  }

  const err = (json as { error?: unknown } | null)?.error;
  if (err) {
    const reason = String((json as { reason?: unknown }).reason || err);
    if (err === 'unauthorized') {
      return { ok: false, message: '保存できませんでした', hint: 'ログインし直してください' };
    }
    if (err === 'forbidden') {
      return { ok: false, message: '保存できませんでした', hint: 'この操作は先生用です' };
    }
    return { ok: false, message: '保存できませんでした', hint: '窓口が応じませんでした（' + reason + '）' };
  }

  // ★★拒否は {"ok":false,"reason":"…"} で返ります（契約 v4／既存の saveStudents と同じ作法）。
  //   ここで ok を見ないと、【保存に失敗しているのに「保存しました」と出ます】。
  //   ok が true のとき以外は、すべて失敗として扱うこと。
  const body = json as { ok?: unknown; reason?: unknown } | null;
  if (body?.ok !== true) {
    const reason = String(body?.reason ?? '').trim();
    return {
      ok: false,
      message: '保存できませんでした',
      hint: reason
        ? '裏側の返事：' + reason
        : '裏側が「保存した」と返していません。もう一度お試しください',
    };
  }
  return { ok: true };
}
