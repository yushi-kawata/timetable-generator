import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/useMasterStore';
import { nowTime } from './studentDate';

/* ============================================================================
   出欠（生徒の記録票の中で、深緑を塗る唯一の場所）
   正本＝ ~/yushi-documents/意匠_時間割ツール_20260909_astra_v1.md「4」

   ★守っていること
   ・押した瞬間に成功扱いにしない。裏側に保存できたことを【取り直して】確かめてから
     「記録しました」を出す。だから再読み込みしても同じ結果になる。
   ・校内記録（checkIn / checkOut）と教務システム連携（dxCheckIn）を分けて持つ。
     ひとつの isSuccess にまとめない。連携が失敗しても登校をやり直させない。
   ・連携の状態は「いま押した分」しか分からない（取りに行く窓口が無い）。
     分からないときに「連携済み」とは書かない。
   ・★裏側の dxCheckIn が返す {ok:true} は「HTTPが 2xx〜3xx で返ってきた」だけの意味で、
     向こうに出欠が付いたことの証拠ではない（302 も成功に数えている／名簿の
     dx_password が空の生徒は登録されていなくても ok が返る＝既知の穴・未修正）。
     だから ok のときも「送信しました」までしか書かない。「反映」「登録されました」
     「完了」のように、向こう側の結果を保証する言い方をしないこと。
   ・記録の結果は role="status" の領域に常設し、文言だけを差し替える。
   ・「下校」は赤にしない。未記録を警告色にしない。
   ============================================================================ */

/** これを過ぎても裏側から返事が無ければ「成否不明」に倒す */
const SLOW_MS = 12000;
/**
 * 登校を記録した直後、同じ場所を「下校する」に化けさせない時間。
 * ★連打が別の記録になるのを防ぐためのもので、下校の受付ルールではない。
 */
const CHECKOUT_APPEAR_MS = 5000;

type Op = 'in' | 'out';

type Req =
  | { kind: 'idle' }
  | { kind: 'sending'; op: Op }
  | { kind: 'verifying'; op: Op }
  /** 裏側が受け付けなかったことが確定している */
  | { kind: 'failed'; op: Op }
  /** 返事が無い・通信が切れた＝保存できたかどうか分からない */
  | { kind: 'unknown'; op: Op; retried: boolean };

/** 教務システム（younetDX）連携。校内記録とは別に持つ */
type Dx =
  | { kind: 'none' }
  | { kind: 'sending' }
  /** ★送信が通っただけ。向こうに反映されたかどうかは、この画面では分からない */
  | { kind: 'ok' }
  | { kind: 'failed' }
  /** 連携先が分からない（QRの窓口が取れない／名簿に dx_email が無い） */
  | { kind: 'unavailable' };

type Props = {
  studentName: string;
  grade: string;
  dxEmail: string;
  /** "2026-09-09" */
  today: string;
  /** 出欠の初期取得が終わっていない */
  loading: boolean;
  /** 裏側で確認できている登校時刻。'' なら未記録 */
  checkinTime: string;
  /** 裏側で確認できている下校時刻。'' なら未記録 */
  checkoutTime: string;
};

export default function AttendancePanel({
  studentName, grade, dxEmail, today, loading, checkinTime, checkoutTime,
}: Props) {
  const checkIn = useAppStore(s => s.checkIn);
  const checkOut = useAppStore(s => s.checkOut);
  const fetchAttendance = useAppStore(s => s.fetchAttendance);
  const dxCheckIn = useAppStore(s => s.dxCheckIn);
  const qrData = useAppStore(s => s.qrData);

  const [req, setReq] = useState<Req>({ kind: 'idle' });
  const [dx, setDx] = useState<Dx>({ kind: 'none' });
  /** 登校の直後だけ false。下校ボタンを同じ場所へ即座に出さないため */
  const [checkoutVisible, setCheckoutVisible] = useState(true);

  /** 押すたびに増やす。古い返事で新しい表示を上書きしないための番号 */
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resultRef = useRef<HTMLParagraphElement>(null);

  // 後片付けだけの effect（ここで setState はしない）
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  };

  const checkedIn = !!checkinTime;
  const checkedOut = !!checkoutTime;

  /** 記録できたかを、裏側から取り直して確かめる */
  const confirmSaved = async (op: Op): Promise<boolean> => {
    await fetchAttendance(today);
    const st = useAppStore.getState();
    // 取り直せていない（拒否・通信失敗）＝確認できていない
    if (st.gasError) return false;
    const rec = st.attendance.find(a => a.date === today && a.name === studentName);
    return op === 'in' ? !!rec : !!rec?.checkoutTime;
  };

  /** 教務システムへの反映。★校内記録の成否とは切り離す */
  const runDx = async (op: Op) => {
    const url = op === 'in' ? qrData?.tokou_url : qrData?.gekou_url;
    if (!url || !dxEmail) { setDx({ kind: 'unavailable' }); return; }
    setDx({ kind: 'sending' });
    const ok = await dxCheckIn(dxEmail, url);
    setDx({ kind: ok ? 'ok' : 'failed' });
  };

  const record = async (op: Op) => {
    if (req.kind === 'sending' || req.kind === 'verifying') return;
    const seq = ++seqRef.current;
    setReq({ kind: 'sending', op });
    setDx({ kind: 'none' });

    // 返事が返らないまま時間が過ぎたら「成否不明」にする（勝手に失敗と書かない）
    const slow = later(() => {
      if (seqRef.current === seq) setReq({ kind: 'unknown', op, retried: false });
    }, SLOW_MS);

    const saved = op === 'in'
      ? await checkIn(studentName, grade, today, nowTime())
      : await checkOut(studentName, today, nowTime());
    clearTimeout(slow);
    if (seqRef.current !== seq) return;

    if (!saved) {
      // 通信の失敗は「保存できたか分からない」。権限・ログインの拒否は「保存されていない」が確定
      const kind = useAppStore.getState().gasErrorKind;
      setReq(kind === 'forbidden' || kind === 'signin'
        ? { kind: 'failed', op }
        : { kind: 'unknown', op, retried: false });
      return;
    }

    setReq({ kind: 'verifying', op });
    const ok = await confirmSaved(op);
    if (seqRef.current !== seq) return;
    if (!ok) { setReq({ kind: 'unknown', op, retried: false }); return; }

    setReq({ kind: 'idle' });
    // ボタンが消えるので、フォーカスを記録結果の見出しへ引き継ぐ
    later(() => resultRef.current?.focus(), 0);
    if (op === 'in') {
      setCheckoutVisible(false);
      later(() => setCheckoutVisible(true), CHECKOUT_APPEAR_MS);
    }
    void runDx(op);
  };

  /** 「記録を確認する」。押しても新しい記録は作らない（読むだけ） */
  const verify = async (op: Op) => {
    const seq = ++seqRef.current;
    setReq({ kind: 'verifying', op });
    const ok = await confirmSaved(op);
    if (seqRef.current !== seq) return;
    setReq(ok ? { kind: 'idle' } : { kind: 'unknown', op, retried: true });
    if (ok) later(() => resultRef.current?.focus(), 0);
  };

  // ── 記録結果の領域（role="status" で常設。文言だけ差し替える）──────────
  const result = buildResult({ loading, req, checkedIn, checkedOut, checkinTime, checkoutTime });

  return (
    <section className="sheet-section" aria-labelledby="attendance-heading">
      <h2 id="attendance-heading" className="section-title">出欠</h2>

      <div
        role="status"
        className={`attendance-result mt-3 ${result.tone.box}`}
      >
        <p
          ref={resultRef}
          tabIndex={-1}
          className={`text-[1rem] leading-6 font-bold ${result.tone.text}`}
        >
          {result.headline}
        </p>

        {result.times.length > 0 && (
          <dl className="mt-3 space-y-2">
            {result.times.map(t => (
              <div key={t.label} className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-[0.8125rem] leading-5 text-[var(--ink2)] w-[3.5rem] shrink-0">{t.label}</dt>
                <dd className="numeric text-[1.75rem] leading-[2.125rem] font-bold text-[var(--ink)]">{t.time}</dd>
              </div>
            ))}
          </dl>
        )}

        {result.note && (
          <p className={`mt-2 text-[0.8125rem] leading-5 ${result.tone.note}`}>{result.note}</p>
        )}
      </div>

      {/* 教務システム連携。★校内記録と混ぜない・混同させない */}
      <p aria-live="polite" className="mt-3 text-[0.8125rem] leading-5">
        {dxLine(dx)}
      </p>

      <div className="mt-3">
        <AttendanceAction
          loading={loading}
          req={req}
          checkedIn={checkedIn}
          checkedOut={checkedOut}
          checkoutVisible={checkoutVisible}
          record={record}
          verify={verify}
        />
      </div>
    </section>
  );
}

/* ── 表示の組み立て ─────────────────────────────────────────────────── */

const TONE = {
  plain: {
    box: 'bg-[var(--surface2)] border border-[var(--border)]',
    text: 'text-[var(--ink)]',
    note: 'text-[var(--ink2)]',
  },
  success: {
    box: 'bg-[var(--success-bg)] border border-[var(--success)]',
    text: 'text-[var(--success)]',
    note: 'text-[var(--ink2)]',
  },
  warning: {
    box: 'bg-[var(--warning-bg)] border border-[var(--warning)]',
    text: 'text-[var(--warning)]',
    note: 'text-[var(--ink2)]',
  },
  danger: {
    box: 'bg-[var(--danger-bg)] border border-[var(--danger)]',
    text: 'text-[var(--danger)]',
    note: 'text-[var(--ink2)]',
  },
};

type ResultView = {
  headline: string;
  note: string;
  times: { label: string; time: string }[];
  tone: typeof TONE.plain;
};

function buildResult(a: {
  loading: boolean;
  req: Req;
  checkedIn: boolean;
  checkedOut: boolean;
  checkinTime: string;
  checkoutTime: string;
}): ResultView {
  const times: { label: string; time: string }[] = [];
  if (a.checkinTime) times.push({ label: '登校', time: a.checkinTime });
  if (a.checkoutTime) times.push({ label: '下校', time: a.checkoutTime });

  // 1) 初期取得中
  if (a.loading) {
    return { headline: '出欠の記録を確認しています', note: '', times: [], tone: TONE.plain };
  }

  // 3) 送信中 ／ 確認中
  if (a.req.kind === 'sending') {
    return {
      headline: a.req.op === 'in' ? '登校を記録しています…' : '下校を記録しています…',
      note: '記録できたことを確かめてから結果を出します。そのままお待ちください。',
      times, tone: TONE.plain,
    };
  }
  if (a.req.kind === 'verifying') {
    return {
      headline: '記録できたかを確認しています…',
      note: '', times, tone: TONE.plain,
    };
  }

  // 7) 保存失敗が確定
  if (a.req.kind === 'failed') {
    return {
      headline: a.req.op === 'in' ? '登校を記録できませんでした' : '下校を記録できませんでした',
      note: '記録は残っていません。もう一度記録してください。何度も同じ表示が出るときは、先生にお伝えください。',
      times, tone: TONE.danger,
    };
  }

  // 8) タイムアウト等で成否不明
  if (a.req.kind === 'unknown') {
    return {
      headline: '記録結果を確認できません。確認してください',
      note: a.req.retried
        ? 'まだ記録を確認できていません。もう一度確認するか、先生にお伝えください。'
        : '記録できているかもしれません。同じ操作を繰り返す前に、「記録を確認する」を押してください。',
      times, tone: TONE.warning,
    };
  }

  // 6) 下校記録済み
  if (a.checkedOut) {
    return { headline: '✓ 登校と下校を記録しました', note: '', times, tone: TONE.success };
  }
  // 4) 登校記録済み
  if (a.checkedIn) {
    return { headline: '✓ 登校を記録しました', note: '', times, tone: TONE.success };
  }
  // 2) 未記録
  return {
    headline: 'まだ登校を記録していません',
    note: '教室に着いたら「登校する」を押してください。',
    times, tone: TONE.plain,
  };
}

function dxLine(dx: Dx) {
  // ★ここで言ってよいのは「送った」までで、「反映された」ではない。
  //   反映を確かめる窓口が無い以上、結果を保証する言葉を書かないこと。
  if (dx.kind === 'none') return null;
  if (dx.kind === 'sending') {
    return <span className="text-[var(--ink2)]">教務システム（younetDX）へ送っています…</span>;
  }
  if (dx.kind === 'ok') {
    // ★「反映しました」と言い切らない。こちらがやったのは【送ったこと】まで。
    return (
      <span className="text-[var(--ink2)]">
        {'教務システム（younetDX）へ送信しました。反映されたかどうかは、この画面では確認できません。'}
      </span>
    );
  }
  if (dx.kind === 'failed') {
    return (
      <span className="text-[var(--warning)]">
        教務システム（younetDX）への反映は確認できませんでした。
        <span className="text-[var(--ink2)]">
          {' '}学校の記録はできています。登校のやり直しは不要です。先生にお伝えください。
        </span>
      </span>
    );
  }
  return (
    <span className="text-[var(--ink2)]">
      教務システム（younetDX）への反映は、この画面では確認できません。
    </span>
  );
}

function AttendanceAction(a: {
  loading: boolean;
  req: Req;
  checkedIn: boolean;
  checkedOut: boolean;
  checkoutVisible: boolean;
  record: (op: Op) => void;
  verify: (op: Op) => void;
}) {
  // 1) 初期取得中：まだ有効にしない（理由は上の文言に出ている）
  if (a.loading) {
    return (
      <button type="button" className="attendance-action" disabled>
        登校する
      </button>
    );
  }

  // 3) 送信中：位置も大きさも変えない
  if (a.req.kind === 'sending' || a.req.kind === 'verifying') {
    return (
      <button type="button" className="attendance-action" disabled aria-busy="true">
        記録しています…
      </button>
    );
  }

  // 8) 成否不明：新しい記録を作らせない。まず確認させる
  if (a.req.kind === 'unknown') {
    const op = a.req.op;
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="control-button w-full" onClick={() => a.verify(op)}>
          記録を確認する
        </button>
        <button
          type="button"
          className="text-[0.875rem] leading-5 text-[var(--accent)] underline underline-offset-2 font-bold py-2"
          onClick={() => a.record(op)}
        >
          {op === 'in' ? 'もう一度、登校を記録する' : 'もう一度、下校を記録する'}
        </button>
      </div>
    );
  }

  // 7) 失敗が確定：その場でやり直せる
  if (a.req.kind === 'failed') {
    const op = a.req.op;
    return (
      <button type="button" className="attendance-action feedback-enter" onClick={() => a.record(op)}>
        もう一度記録する
      </button>
    );
  }

  // 6) 下校まで記録済み：大きな操作ボタンは出さない
  if (a.checkedOut) return null;

  // 5) 下校受付可能
  if (a.checkedIn) {
    // 登校の直後だけ、下校ボタンをまだ出さない。
    // ★場所は空けておく（下の時間割が上下に飛ばないように）
    if (!a.checkoutVisible) return <div className="min-h-16" aria-hidden="true" />;
    return (
      <button type="button" className="attendance-action feedback-enter" onClick={() => a.record('out')}>
        下校する
      </button>
    );
  }

  // 2) 未記録・受付可能
  return (
    <button type="button" className="attendance-action" onClick={() => a.record('in')}>
      登校する
    </button>
  );
}
