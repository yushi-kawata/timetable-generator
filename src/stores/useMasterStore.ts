import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimetableTemplate, StudentRecord, Student, AttendanceRecord, Period2Selection } from '../types/master';
import { DEFAULT_TT } from '../types/master';
import { auth, isAllowedDomain } from '../firebase';
import { classifyRole } from '../lib/role';
// ★窓口URLの決め方は1箇所に集約した（台帳 A4-94）。ここで localStorage を直接読まないこと
import { resolveGasUrl } from '../lib/gasUrl';
// ★やり直しの決まりは1か所（台帳 A4-101）。回数・秒数をここに書かないこと
import {
  MSG_GAS_FLAKY,
  gasFailureDetail,
  retryDelayMs,
  shouldRetry,
} from '../lib/gasRetry';
import type { GasOutcome } from '../lib/gasRetry';
// ★出欠の行の見つけ方は1箇所に集約してある（台帳 A4-95 / A4-99）。日付は === で比べない
import { findAttendance } from '../lib/attendanceMatch';
// ★連携の結果（成否＋理由）は dxResult.ts にまとめてある（台帳 A4-86）
import { toDxResult } from './dxResult';
import type { DxCheckInResult } from './dxResult';

// GAS側は "course" カラム、フロント側は "classroom" フィールド
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStudentFromGas(s: any): Student & { dx_password?: string; has_password?: boolean } {
  return {
    name: s.name || '',
    grade: s.grade || '',
    classroom: s.course === 'Growth' ? 'B教室' : (s.course || '学年教室'),
    dx_email: s.dx_email || '',
    // ★2026-09-02（台帳A4-41）: 裏側は平文パスワードを返さなくなった。
    //   ここは常に空になる。空のまま保存しても裏側が既存を据え置くので消えない。
    dx_password: '',
    has_password: !!s.has_password,
    days: s.days || { 月: false, 火: false, 水: false, 木: false, 金: false },
  };
}

function mapStudentToGas(s: Student & { dx_password?: string }) {
  return {
    name: s.name,
    grade: s.grade,
    course: s.classroom === 'B教室' ? 'Growth' : '通常',
    dx_email: s.dx_email || '',
    dx_password: s.dx_password || '',
    days: s.days,
  };
}

// GAS WebApp URL
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwW8j8jnGDBD8PKO_EEfCOFikdhkoSiFcGlRVi0hSU99fQ2xC0D2C_MLCwqIQmIUc7R/exec';

// ★2026-09-14（台帳 A4-94）: ここで localStorage を直接読まない。
//   以前は
//     const GAS_URL = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;
//   という「読み込み時に1回だけ決まる定数」で、しかも fetchAll は別の作法で
//   同じ値を読んでいた（片方は既定に落ち、片方は黙って止まる）。
//   端末に古い gas_url が残っていると、生徒は何をしても直せなかった。
//   ★いまは呼ぶたびに決める。生徒は上書きを読まない（gasUrl.ts を見ること）。
export function currentGasUrl(): string {
  return resolveGasUrl({
    saved: localStorage.getItem('gas_url'),
    def: DEFAULT_GAS_URL,
    role: classifyRole(auth.currentUser?.email || ''),
  }).url;
}

// QR GAS URL（★別プロジェクトの窓口。A4-41 の番人は入っていない＝今回の対象外）
const QR_GAS_URL = 'https://script.google.com/macros/s/AKfycbxVpj2Uyi_20_eO_JbTM0fVcGK0znTzk7Odbuf6xz0Gs_5V6DYS1nU30xooIVdiKsADpQ/exec';

// ============================================================================
// 裏側（GAS）の叩き方 ─ 台帳 A4-41
// ============================================================================
// 手本 = yushi-student-portal/src/data/coin-api.js
//
// 守っている約束（申し送り「送り方」のとおり）:
//  ・すべて POST。GET は使わない
//    ★トークンをURLに載せると、Apps Script の実行ログ・ブラウザ履歴・Referer に
//      1時間有効の資格情報が残る。読み取りも POST にしているのはこのため。
//      date / week もクエリではなく本文に入れる。
//  ・Content-Type を付けない
//    ★付けると CORS のプリフライト（OPTIONS）が飛び、GAS Web App では通らない。
//      ヘッダなし＝単純リクエスト扱い。
//  ・mode: 'no-cors' は使わない
//    ★no-cors だと返事が読めず、拒否されたことに気づけない（＝「0件」と誤表示する）。
//  ・未ログインなら GAS を叩かずに手前で止める（サーバーの fail close に頼らない）

/**
 * 拒否・失敗の種類。
 * ★2026-09-09（台帳 A4-41）: 'forbidden' を足した。
 *   'signin'    … ログインが切れている（入り直せば直る）
 *   'forbidden' … ログインは有効。権限の話（入り直しても直らない）
 *   'network'   … つながらない／作りの問題
 *   ★この3つを混ぜないこと。混ぜると生徒に「通信エラー」と出て、
 *     直しようのないものを何度もやり直させることになる。
 */
type GasFailure = 'signin' | 'forbidden' | 'network';

type GasResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: GasFailure; reason: string };

/**
 * 画面に出す帯の種類。帯の下に添える案内文をこれで選ぶ。
 * ★'forbidden' のときはログインし直させない（入り直しても変わらないため）。
 */
export type GasErrorKind = '' | 'signin' | 'forbidden' | 'network';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MSG_SIGNIN = 'ログインし直してください';
const MSG_NETWORK = '通信に失敗しました。もう一度お試しください';
// ★裏側が {"error":"forbidden","reason":"staffOnly"} を返したとき。
//   ログインは有効なので、ログイン画面に飛ばさない・入り直しも勧めない。
const MSG_STAFF_ONLY = 'この操作は先生用です';
// ★裏側が {"error":"forbidden","reason":"unknownAccount"} を返したとき。
const MSG_UNKNOWN_ACCOUNT = 'このアカウントでは利用できません。先生にご連絡ください';

/**
 * IDトークンを取り出す。ログインしていない／通せないアカウントなら空文字。
 * ★裏側（GAS の verifyIdToken_ / isAllowedDomain_）と同じ判定を手前でもやる。
 */
async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return '';
  if (!isAllowedDomain(user.email || '')) return '';
  if (user.emailVerified !== true) return '';
  try {
    return await user.getIdToken();
  } catch {
    return '';
  }
}

// gasCall から画面の警告を出し入れするための入口。
// useAppStore はこの下で作られるが、gasCall が呼ばれるのはストア生成後なので問題ない。
function setGasError(message: string, kind: Exclude<GasErrorKind, ''>, detail = '') {
  const st = useAppStore.getState();
  if (st.gasError !== message || st.gasErrorKind !== kind || st.gasErrorDetail !== detail) {
    useAppStore.setState({ gasError: message, gasErrorKind: kind, gasErrorDetail: detail });
  }
}
function clearGasError() {
  if (useAppStore.getState().gasError) {
    useAppStore.setState({ gasError: '', gasErrorKind: '', gasErrorDetail: '' });
  }
}

/**
 * forbidden の reason から画面に出す文言を選ぶ。
 * ★知らない reason はログインの話に倒さない（権限側に倒す）。
 *   ここで「ログインし直して」と出すと、直らないやり直しを延々させることになる。
 */
function forbiddenMessage(reason: string): string {
  if (reason === 'staffOnly') return MSG_STAFF_ONLY;
  if (reason === 'unknownAccount') return MSG_UNKNOWN_ACCOUNT;
  return MSG_UNKNOWN_ACCOUNT;
}

/**
 * 裏側を1回叩く。本文は { action, idToken, ...引数 }。
 * ★返ってきた JSON に error があれば、それは拒否。Array.isArray() より先に見る。
 */
async function gasCall<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<GasResult<T>> {
  const gasUrl = currentGasUrl();
  if (!gasUrl) return { ok: false, failure: 'network', reason: 'noUrl' };

  const idToken = await getIdToken();
  if (!idToken) {
    // 未ログイン。GAS を叩かずに手前で止める
    setGasError(MSG_SIGNIN, 'signin');
    return { ok: false, failure: 'signin', reason: 'signin' };
  }

  // ── ★やり直しつきで叩く（台帳 A4-101）──────────────────────────
  //   2026-09-18 の症状＝画面が断続的に「通信に失敗しました」。
  //   コンソールに script.googleusercontent.com（GASの応答の2段目）への 404 が6件。
  //   ＝画面が読み込み時に叩く窓口の数ぶん出ていた。窓口そのものは生きていた。
  //   こちらは正しく叩いているのに返事が返らない種類の失敗なので、少し待ってやり直す。
  //
  //   ★★やり直すのは【読み取りだけ】（lib/gasRetry.ts の表が正本）。
  //     ・拒否（unauthorized / forbidden）はやり直さない＝正しい返事なので無駄
  //     ・書き込み（saveStudents・checkIn など）はやり直さない＝二重に書く恐れ
  //     ここに回数や秒数を直接書かないこと。
  let json: unknown = null;
  let lastStatus: number | null = null;
  let attempts = 0;
  let outcome: GasOutcome = 'ok';

  for (;;) {
    attempts++;
    outcome = 'ok';
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        // ★headers は付けない（プリフライト回避）。mode も指定しない
        body: JSON.stringify({ action, idToken, ...payload }),
        redirect: 'follow',
      });
      lastStatus = res.status;
      if (!res.ok) {
        outcome = 'httpError';
      } else {
        try {
          json = await res.json();
        } catch {
          // 空の返事もここに来る（A4-101 で実際に起きている形）
          outcome = 'badJson';
        }
      }
    } catch {
      outcome = 'networkError';
      lastStatus = null;
    }

    if (outcome === 'ok') break;
    if (!shouldRetry({ action, outcome, attempt: attempts })) break;
    await sleep(retryDelayMs(attempts));
  }

  if (outcome !== 'ok') {
    // ★何が起きたかを帯に出す（番号・回数・窓口の末尾）。切り分けを速くするため
    setGasError(
      MSG_GAS_FLAKY,
      'network',
      gasFailureDetail({ status: lastStatus, attempts, url: gasUrl }),
    );
    return {
      ok: false,
      failure: 'network',
      reason: lastStatus ? `http${lastStatus}` : outcome,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // ★ここが肝。Array.isArray() の前に error を見る。
  //   拒否は {"error":"unauthorized","reason":"signin"} というオブジェクトで返る。
  //   読み取り系は普段は配列が返るので、これを見落とすと拒否を「0件」と誤表示する。
  // ────────────────────────────────────────────────────────────────
  const err = (json as { error?: unknown } | null)?.error;
  if (err) {
    const reason = String((json as { reason?: unknown }).reason || err);
    // ── ログインが切れている ──────────────────────────────────────
    if (err === 'unauthorized') {
      setGasError(MSG_SIGNIN, 'signin');
      return { ok: false, failure: 'signin', reason };
    }
    // ── ログインは有効。権限の話（2026-09-09 台帳 A4-41）──────────
    // ★ここを通信あつかいにすると、生徒が先生用の操作を叩いたときに
    //   「通信エラー」と出る。権限の話なのでやり直しても直らない。
    // ★ログイン画面に飛ばさないこと。入り直しても結果は変わらない。
    if (err === 'forbidden') {
      setGasError(forbiddenMessage(reason), 'forbidden');
      return { ok: false, failure: 'forbidden', reason };
    }
    // 'invalid action' / 'bad request' など。作りの問題なので通信あつかいにする
    setGasError(MSG_NETWORK, 'network');
    return { ok: false, failure: 'network', reason };
  }

  // ここまで来たら通っている。前に出していた警告は消す
  clearGasError();
  return { ok: true, data: json as T };
}

interface QrData {
  campus: string;
  date: string;
  tokou_qr: string;
  gekou_qr: string;
  tokou_url: string | null;
  gekou_url: string | null;
  updated_at: string;
}

/** 名簿の保存結果。画面に出す文言つき */
export interface SaveStudentsResult {
  ok: boolean;
  /** 全消しを止められた＝もう一度押せば消せる、という状態 */
  needsWipeConfirm: boolean;
  message: string;
}

/**
 * 「私は誰か」の結果（getMe）。
 * ★2026-09-09 の決裁で、生徒の younetDX メール＋パスワード入力（authStudent）は廃止。
 *   生徒は Google ログインだけで入り、本人の特定は裏側が
 *   「確認済みの Google のメール」と名簿の dx_email 列を突き合わせて行う。
 *   ＝画面からパスワードを送らない。
 */
export type GetMeResult =
  | { ok: true; student: Student }
  | {
      ok: false;
      /** ★2026-09-09: 'forbidden' を足した。権限の話とログインの話を混ぜない */
      reason: 'notEnrolled' | 'signin' | 'forbidden' | 'network';
      /** forbidden のときに画面へ出す文言（帯と同じ言い方に揃える） */
      message?: string;
    };

interface AppState {
  tt: TimetableTemplate;
  records: StudentRecord[];
  students: Student[];
  attendance: AttendanceRecord[];
  period2: Period2Selection[];
  qrData: QrData | null;
  loading: boolean;
  gasUrl: string;
  /** 裏側に拒否された／つながらないときの文言。'' なら正常 */
  gasError: string;
  /** その文言が「ログインの話」か「権限の話」か「通信の話」か */
  gasErrorKind: GasErrorKind;
  /**
   * 切り分け用の1行（★台帳 A4-101）。例: 「応答 404／3 回試しました／窓口 …abc/exec」
   * ★2026-09-18 に、この情報が画面に無いせいで切り分けに20分かかった。
   */
  gasErrorDetail: string;

  clearGasError: () => void;

  fetchAll: () => Promise<void>;
  fetchStudents: () => Promise<void>;
  /** 戻り値＝裏側から取り直せたか（false＝確認できていない） */
  fetchAttendance: (date: string) => Promise<boolean>;
  fetchPeriod2: (week: string) => Promise<void>;
  fetchQrData: () => Promise<void>;
  setGasUrl: (url: string) => void;

  setTT: (tt: TimetableTemplate) => void;
  updateTTCell: (day: string, room: string, period: number, value: string) => void;
  saveTT: () => Promise<boolean>;

  saveStudents: (
    students: (Student & { dx_password?: string })[],
    confirmEmpty?: boolean,
  ) => Promise<SaveStudentsResult>;
  checkIn: (name: string, grade: string, date: string, time: string) => Promise<boolean>;
  checkOut: (name: string, date: string, time: string) => Promise<boolean>;
  savePeriod2: (week: string, name: string, selections: Partial<Record<string, Record<number, string>>>) => Promise<boolean>;

  /** ログイン中の Google アカウントが名簿の誰なのかを裏側に聞く。引数は idToken だけ */
  getMe: () => Promise<GetMeResult>;
  /** ★戻り値は成否だけでなく理由も持つ（台帳 A4-86）。dxUrl が空でも送る */
  dxCheckIn: (email: string, dxUrl: string) => Promise<DxCheckInResult>;

  // レガシー互換（いまの画面からは呼ばれていない。呼ばれても番人を通る）
  addRecord: (r: Omit<StudentRecord, 'id'>) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  clearRecords: () => Promise<void>;
}

// 空行を除外 & 同名重複を除外（最後の登録を優先）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeStudents(raw: any[]): Student[] {
  const mapped = raw.map(mapStudentFromGas).filter((s) => s.name.trim());
  const seen = new Map<string, Student>();
  for (const s of mapped) seen.set(s.name, s);
  return [...seen.values()];
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tt: JSON.parse(JSON.stringify(DEFAULT_TT)),
      records: [],
      students: [],
      attendance: [],
      period2: [],
      qrData: null,
      loading: false,
      gasUrl: currentGasUrl(),
      gasError: '',
      gasErrorKind: '',
      gasErrorDetail: '',

      clearGasError: () => set({ gasError: '', gasErrorKind: '' }),

      setGasUrl: (url: string) => {
        localStorage.setItem('gas_url', url);
        set({ gasUrl: url });
        window.location.reload();
      },

      fetchAll: async () => {
        // ★2026-09-14（台帳 A4-94）: ここで localStorage を直接読むのをやめた。
        //   以前は「gas_url が入っていなければ黙って抜ける」作りで、
        //   ・gasCall は既定に落ちるのに、ここだけ止まる（同じ値の読み方が2通りあった）
        //   ・止まったことが画面のどこにも出ない
        //   という二重の問題があった。いまは gasCall と同じ決め方を使う。
        if (!currentGasUrl()) {
          // 窓口が無いのは作りの問題。黙って抜けず、画面に出す
          setGasError(MSG_NETWORK, 'network');
          set({ loading: false });
          return;
        }

        // ────────────────────────────────────────────────────────────
        // ★2026-09-09（台帳 A4-41）: getRecs と getStudents は職員だけ。
        //   生徒のまま3つ叩くと、起動のたびに2件が forbidden になり、
        //   毎回「この操作は先生用です」の帯が出る（生徒は何も悪くない）。
        //   なので生徒のときは getTT だけ叩く。
        // ★これは【出し分け】であって権限の境目ではない。
        //   ここを書き換えて3つ叩いても、裏側が forbidden を返すだけで
        //   名簿も申告も出てこない。
        // ────────────────────────────────────────────────────────────
        const role = classifyRole(auth.currentUser?.email || '');
        if (role === null) {
          // 生徒とも職員とも判定できないアカウント。1件も叩かない
          // （画面側も App がここで止めて、どちらのページも出さない）
          set({ loading: false });
          return;
        }
        const isStaff = role === 'staff';

        set({ loading: true });

        const [ttRes, recsRes, studentsRes] = await Promise.all([
          gasCall<TimetableTemplate | null>('getTT'),
          isStaff ? gasCall<StudentRecord[]>('getRecs') : null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          isStaff ? gasCall<any[]>('getStudents') : null,
        ]);

        // ★拒否されていたら、いま持っている中身を空で上書きしない。
        //   （空で上書きすると「データが消えた」ように見える）
        //   生徒のときは recsRes / studentsRes が null＝叩いていない。
        if (recsRes && recsRes.ok && Array.isArray(recsRes.data)) {
          const seen = new Map<string, StudentRecord>();
          for (const r of recsRes.data) {
            const key = `${r.name}__${r.week}`;
            const existing = seen.get(key);
            if (!existing || r.id > existing.id) seen.set(key, r);
          }
          set({ records: [...seen.values()].sort((a, b) => b.id - a.id) });
        }
        if (ttRes.ok) {
          const ttData = ttRes.data;
          if (ttData && typeof ttData === 'object' && ttData['月']) set({ tt: ttData });
        }
        if (studentsRes && studentsRes.ok && Array.isArray(studentsRes.data)) {
          set({ students: dedupeStudents(studentsRes.data) });
        }
        set({ loading: false });
      },

      fetchStudents: async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await gasCall<any[]>('getStudents');
        if (res.ok && Array.isArray(res.data)) {
          set({ students: dedupeStudents(res.data) });
        }
      },

      // ★2026-09-14（台帳 A4-95）: 取り直せたかどうかを返す。
      //   以前は戻り値が無く、呼び出し側は「画面の帯（gasError）が立っていないか」で
      //   代用していた。帯は別の失敗でも立つので、関係のない失敗で
      //   「確認できませんでした」になっていた。
      fetchAttendance: async (date: string) => {
        // ★date は本文に入れる（クエリではない）
        const res = await gasCall<AttendanceRecord[]>('getAttendance', { date });
        if (res.ok && Array.isArray(res.data)) {
          set({ attendance: res.data });
          return true;
        }
        return false;
      },

      fetchPeriod2: async (week: string) => {
        // ★week は本文に入れる（クエリではない）
        const res = await gasCall<Period2Selection[]>('getPeriod2', { week });
        if (res.ok && Array.isArray(res.data)) set({ period2: res.data });
      },

      // ★QRだけは別プロジェクトの窓口。A4-41 の番人はここには入っていないので
      //   IDトークンは送らない（送っても向こうは見ない）。今回の対象外。
      fetchQrData: async () => {
        try {
          const res = await fetch(`${QR_GAS_URL}?action=api`, { redirect: 'follow' });
          const data = await res.json();
          if (data && data.tokou_qr) set({ qrData: data });
        } catch {
          // QRが取れなくても、登校・下校そのものは記録できるのでここでは止めない
        }
      },

      setTT: (tt) => set({ tt }),

      updateTTCell: (day, room, period, value) =>
        set((s) => {
          const tt = JSON.parse(JSON.stringify(s.tt));
          if (!tt[day]) tt[day] = {};
          if (!tt[day][room]) tt[day][room] = ['', '', '', '', '', ''];
          tt[day][room][period] = value;
          return { tt };
        }),

      saveTT: async () => {
        const { tt } = get();
        const res = await gasCall<{ ok?: boolean }>('saveTT', { data: tt });
        return res.ok && res.data?.ok !== false;
      },

      saveStudents: async (students, confirmEmpty = false) => {
        const payload: Record<string, unknown> = { data: students.map(mapStudentToGas) };
        // ★全消しは明示したときだけ。既定では送らない
        if (confirmEmpty) payload.confirmEmpty = true;

        const res = await gasCall<{ ok?: boolean; reason?: string; prev?: number }>(
          'saveStudents',
          payload,
        );

        if (!res.ok) {
          // ★2026-09-09: 権限で断られたときに「通信に失敗しました」と出さない。
          //   帯と同じ文言をボタンの下にも出す（言うことが二つに割れないように）。
          const message =
            res.failure === 'signin' ? MSG_SIGNIN
            : res.failure === 'forbidden' ? forbiddenMessage(res.reason)
            : MSG_NETWORK;
          return { ok: false, needsWipeConfirm: false, message };
        }

        // ★拒否は {ok:false, reason:...} で返る（error キーは付かない）
        if (res.data?.ok === false) {
          const reason = res.data.reason;
          // ★ここで名簿を取り直さないこと。取り直すと画面の一覧が裏側の中身で
          //   上書きされ、
          //   （1）先生が消したばかりの行が勝手に戻る＝「全員を消して保存」の
          //        2回目が押せなくなる（一覧が0件でなくなるため）
          //   （2）まだ保存していない打ちかけの修正が黙って消える
          //   裏側は1行も書き換えていないので、取り直す必要もない。
          if (reason === 'refuseWipe') {
            const prev = typeof res.data.prev === 'number' ? res.data.prev : 0;
            return {
              ok: false,
              needsWipeConfirm: true,
              message: `全員を消す操作です。本当に消す場合は、もう一度「全員を消して保存」を押してください（いまは何も変わっていません。${prev}件がそのまま残っています）`,
            };
          }
          // badPayload など
          return {
            ok: false,
            needsWipeConfirm: false,
            message: '保存できませんでした。もう一度お試しください',
          };
        }

        set({ students });
        return { ok: true, needsWipeConfirm: false, message: '保存しました' };
      },

      // ★2026-09-11（台帳 A4-86）: res.ok（通信が通った）だけで「書けた」と
      //   言わないこと。裏側は本文に {ok:false} を入れて返すことがある。
      //   ここを見落とすと、書けていないのに書けた扱いになり、
      //   younetDX にだけ登録される（逆向きの事故）。
      checkIn: async (name, grade, date, time) => {
        const res = await gasCall<{ ok?: boolean }>('checkIn', { name, grade, date, time });
        if (!res.ok || res.data?.ok === false) return false;
        // ★裏側に通ってから画面に出す。先に出すと、拒否されても「登校済み」に見える
        set((s) => {
          // ★2026-09-16（台帳 A4-99）: === で比べない。シートから取り直した行の
          //   日付は日付型（ISO文字列）で入っているので、=== では既にある行を
          //   見つけられず、同じ日の行が二重に増える。画面と同じ findAttendance で。
          const existing = findAttendance(s.attendance, date, name);
          if (existing) return s;
          return {
            attendance: [...s.attendance, { date, name, grade, checkinTime: time, checkoutTime: '' }],
          };
        });
        return true;
      },

      // ★2026-09-11（台帳 A4-86）: 裏側は、その日の登校の行が見つからないと
      //   {ok:false, message:'no checkin record'} を返す＝1文字も書いていない。
      //   ここで true を返すと「下校を記録した」ことにしてしまう。
      checkOut: async (name, date, time) => {
        const res = await gasCall<{ ok?: boolean }>('checkOut', { name, date, time });
        if (!res.ok || res.data?.ok === false) return false;
        set((s) => {
          // ★2026-09-16（台帳 A4-99）: ここも === で比べない。外れると裏側には
          //   下校が入っているのに、画面の行だけ下校時刻が空のまま残る。
          const target = findAttendance(s.attendance, date, name);
          if (!target) return s;
          return {
            attendance: s.attendance.map(a => (a === target ? { ...a, checkoutTime: time } : a)),
          };
        });
        return true;
      },

      savePeriod2: async (week, name, selections) => {
        const res = await gasCall<{ ok?: boolean }>('savePeriod2', { week, name, selections });
        if (!res.ok) return false;
        set((s) => ({
          period2: [
            ...s.period2.filter(p => !(p.week === week && p.name === name)),
            { week, name, selections },
          ],
        }));
        return true;
      },

      // ★引数は idToken だけ（gasCall が本文に入れる）。
      //   メールもパスワードも画面からは送らない。本人の特定は裏側がトークンから行う。
      getMe: async (): Promise<GetMeResult> => {
        const res = await gasCall<{ ok?: boolean; reason?: string; student?: unknown }>('getMe');
        if (!res.ok) {
          // ★権限で断られたときに「ログインし直してください」と出さない。
          //   出すと、帯（ログインし直しても変わりません）と言うことが割れる。
          if (res.failure === 'forbidden') {
            return { ok: false, reason: 'forbidden', message: forbiddenMessage(res.reason) };
          }
          return { ok: false, reason: res.failure === 'signin' ? 'signin' : 'network' };
        }
        // ★ok / error を見る前に配列を期待しない。getMe はオブジェクトで返る
        const data = res.data;
        if (data && data.ok === true && data.student) {
          return { ok: true, student: mapStudentFromGas(data.student) };
        }
        if (data && data.reason === 'notEnrolled') {
          return { ok: false, reason: 'notEnrolled' };
        }
        return { ok: false, reason: 'network' };
      },

      // ★2026-09-11（台帳 A4-86）: 失敗の理由を捨てない。
      //   ・裏側が付けてくる reason（noPassword / dxLoginFailed / notEnrolled /
      //     noDxUrl / badDxUrl）はそのまま持ち帰る
      //   ・理由が無く code だけのときは 'unknown' ＋ code を持ち帰る
      //   ・通信・権限・ログイン切れも、画面が出し分けられるよう理由にする
      //   ★dxUrl が空でも、ここで手前止めしないこと。空のまま送ると裏側が
      //     noDxUrl として audit シートに1行残す＝「画面までは動いたが
      //     QRの行き先が無かった」ことが後から分かる（younetDX には触らない）。
      dxCheckIn: async (email: string, dxUrl: string): Promise<DxCheckInResult> => {
        const res = await gasCall<{ ok?: boolean; reason?: unknown; code?: unknown }>(
          'dxCheckIn', { email, dxUrl },
        );
        if (!res.ok) {
          return {
            ok: false,
            reason: res.failure === 'signin' ? 'signin'
              : res.failure === 'forbidden' ? 'forbidden'
              : 'network',
          };
        }
        return toDxResult(res.data);
      },

      // ── レガシー互換 ──────────────────────────────────────────────
      // いまの画面からは呼ばれていないが、呼ばれた場合も番人を通る形にしてある
      addRecord: async (r) => {
        const record = { ...r, id: Date.now() };
        const old = get().records.filter(
          (x) => x.name === record.name && x.week === record.week
        );
        for (const o of old) {
          await gasCall('deleteRec', { id: o.id });
        }
        const res = await gasCall<{ ok?: boolean }>('saveRec', { data: record });
        if (!res.ok) return;
        set((s) => ({
          records: [record, ...s.records.filter(
            (x) => !(x.name === record.name && x.week === record.week)
          )],
        }));
      },

      deleteRecord: async (id) => {
        const res = await gasCall<{ ok?: boolean }>('deleteRec', { id });
        if (!res.ok) return;
        set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
      },

      clearRecords: async () => {
        const res = await gasCall<{ ok?: boolean }>('clearRecs');
        if (!res.ok) return;
        set({ records: [] });
      },
    }),
    {
      name: 'timetable-system-v5',
      partialize: (s) => ({ tt: s.tt, records: s.records, students: s.students }),
    }
  )
);
