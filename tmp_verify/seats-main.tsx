/* eslint-disable react-refresh/only-export-components */
// 座席表（台帳 A4-107）の描画確認用ハーネス。★本番の入口ではない。
//  ・職員で入っている状態を差し込む
//  ・窓口（GAS）の返事を差し替えて、実際にブラウザで描く
//  ?seats=ok        … 約束どおりの返事。★わざと余計な列（学年・コース・メール・
//                     パスワード・服薬）を混ぜて、画面に出ないことを実測する
//  ?seats=rough     … 同じ席の重なり・名簿に無い席・席が無い登校者を混ぜた返事
//  ?seats=fail      … 窓口が拒否する（forbidden）
//  ?seats=noasof    … asof が無い返事（＝いつのものか分からない）
//  ?seats=failafter … 1回目は成功、2回目以降は失敗（★古いデータが残らないことの確認）
//  ?seats=violate   … 保存されている並びが決まりごとに反している状態
//  ?seats=impossible… 決まりごと同士が矛盾している（同じ席に2人を固定）
//  ?save=ok         … 保存の窓口が成功を返す（既定は「窓口がまだ無い」）
//  ?flaky=N         … getSeating の最初のN回だけ 404（★A4-101 のやり直しの確認）
//  ?saveflaky=1     … saveSeating がいつも 404（★書き込みは再送しないことの確認）
//  ?reject=1        … getSeating が forbidden を返す（★拒否は1回でやめることの確認）
//  ?studentsflaky=N … getStudents の最初のN回だけ 404（★既存の gasCall 側の確認）
//  ★保存の「届いたのに返事だけ落ちた」の再現（台帳 A4-101）:
//  ?savedrop=1      … 保存を【実際に反映してから】404 を返す（＝読み直せば入っている）
//  ?savelost=1      … 保存を【反映せずに】404 を返す（＝読み直しても入っていない）
//  ?rereadfail=1    … 保存後の読み直しも失敗させる（＝確認できない）
//  ?seats=badrules  … 知らない種別・項目の足りない決まりごとが混ざっている
//  ?seats=nogrid    … 窓口が grid を返さない
//  ?seatDemo=1      … 窓口を叩かず見本データ（開発時の既定の使い方）
import { createRoot } from 'react-dom/client';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const kase = params.get('seats') || 'ok';
// ★どちらの立場で入るか（台帳 A4-120 の確認用）。
//   ?as=student … 生徒の形（英字1文字＋数字8桁）。★実在しない番号（9で始める）
//   既定        … 職員の形（ハイフンあり）。実在の人ではない
const email =
  params.get('as') === 'student' ? 's99000001@yushi-kokusai.jp' : 's-mihon@yushi-kokusai.jp';

const calls: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__seatCalls = calls;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__hits = () => ({ seat: seatHits, save: saveHits, students: studentsHits });

const J = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });

const T = true;
const F = false;
const days = (a: boolean, b: boolean, c: boolean, d: boolean, e: boolean) => ({
  月: a, 火: b, 水: c, 木: d, 金: e,
});

/** ★わざと余計な列を混ぜてある。画面に出たら情報漏れ */
const DIRTY_EXTRA = {
  grade: '2年',
  course: 'Growth',
  dx_email: 'x@example.invalid',
  dx_password: 'himitsu',
  medication: '服薬あり',
};

const STUDENTS = [
  { student_id: '90000001', name: '見本 あおい', days: days(T, F, T, F, T), ...DIRTY_EXTRA },
  { student_id: '90000002', name: '見本 はると', days: days(F, T, F, T, F) },
  { student_id: '90000003', name: '見本 さくらこ', days: days(T, T, T, T, T) },
  { student_id: '90000004', name: '見本 りく', days: days(T, F, F, T, T) },
  { student_id: '90000005', name: '見本 ひな', days: days(F, T, T, F, T) },
  { student_id: '90000006', name: '見本 そうた', days: days(T, T, F, T, F) },
  { student_id: '90000007', name: '見本 みなも', days: days(T, F, T, F, T) },
  { student_id: '90000008', name: '見本 かえで', days: days(F, T, F, T, F) },
  { student_id: '90000009', name: '見本 いつき', days: days(T, T, T, T, T) },
  { student_id: '90000010', name: '見本 ののか', days: days(T, F, F, T, T) },
  { student_id: '90000011', name: '見本 ゆう', days: days(F, T, T, F, T) },
  { student_id: '90000012', name: '見本 あきひろ', days: days(T, T, F, T, F) },
  { student_id: '90000013', name: '見本 ことは', days: days(T, F, T, F, T) },
  { student_id: '90000014', name: '見本 れん', days: days(F, T, F, T, F) },
  { student_id: '90000015', name: '見本 つむぎ', days: days(T, T, T, T, T) },
  { student_id: '90000016', name: '見本 ひかる', days: days(T, F, F, T, T) },
  { student_id: '90000017', name: '見本 なぎさ', days: days(F, T, T, F, T) },
  { student_id: '90000018', name: '見本 ゆいと', days: days(T, T, F, T, F) },
  { student_id: '90000019', name: '見本 さな', days: days(T, F, T, F, T) },
  { student_id: '90000020', name: '見本 こうき', days: days(F, T, F, T, F) },
  { student_id: '90000021', name: '見本 まひろ', days: days(T, T, T, T, T) },
  { student_id: '90000022', name: '見本 あさひ', days: days(T, F, F, T, T) },
  { student_id: '90000023', name: '見本 みお', days: days(F, T, T, F, T) },
  { student_id: '90000024', name: '見本 りつ', days: days(T, T, F, T, F) },
  { student_id: '90000025', name: '見本 そら', days: days(T, F, T, F, T) },
  { student_id: '90000026', name: '見本 ちひろ', days: days(F, T, F, T, F) },
];

/** 4行×7列＝28席。26名分なので4行目の6番・7番が空く */
const SEATS = [
  { student_id: '90000001', row: 1, col: 1 },
  { student_id: '90000002', row: 1, col: 2 },
  { student_id: '90000003', row: 1, col: 3 },
  { student_id: '90000004', row: 1, col: 4 },
  { student_id: '90000005', row: 1, col: 5 },
  { student_id: '90000006', row: 1, col: 6 },
  { student_id: '90000007', row: 1, col: 7 },
  { student_id: '90000008', row: 2, col: 1 },
  { student_id: '90000009', row: 2, col: 2 },
  { student_id: '90000010', row: 2, col: 3 },
  { student_id: '90000011', row: 2, col: 4 },
  { student_id: '90000012', row: 2, col: 5 },
  { student_id: '90000013', row: 2, col: 6 },
  { student_id: '90000014', row: 2, col: 7 },
  { student_id: '90000015', row: 3, col: 1 },
  { student_id: '90000016', row: 3, col: 2 },
  { student_id: '90000017', row: 3, col: 3 },
  { student_id: '90000018', row: 3, col: 4 },
  { student_id: '90000019', row: 3, col: 5 },
  { student_id: '90000020', row: 3, col: 6 },
  { student_id: '90000021', row: 3, col: 7 },
  { student_id: '90000022', row: 4, col: 1 },
  { student_id: '90000023', row: 4, col: 2 },
  { student_id: '90000024', row: 4, col: 3 },
  { student_id: '90000025', row: 4, col: 4 },
  { student_id: '90000026', row: 4, col: 5 },
];

const ASOF = '2026-09-18 09:40:12';

/** 決まりごと（★契約 v4：1本の配列・type は英語） */
const CONSTRAINTS = [
  // 固定席2件（★実データと同じ「2件」の形。位置は見本の並びに合うものを選んである）
  { type: 'fixed', student_id: '90000009', row: 2, col: 2 },
  { type: 'fixed', student_id: '90000015', row: 3, col: 1 },
  // 引き離し6組（★90000001 が3組に登場＝三角の関係）
  { type: 'apart', student_id: '90000001', student_id2: '90000014' },
  { type: 'apart', student_id: '90000001', student_id2: '90000022' },
  { type: 'apart', student_id: '90000014', student_id2: '90000022' },
  { type: 'apart', student_id: '90000002', student_id2: '90000016' },
  { type: 'apart', student_id: '90000003', student_id2: '90000017' },
  { type: 'apart', student_id: '90000004', student_id2: '90000019' },
  // 近づけたい3組（★90000010 が3組すべてに登場＝ハブ）
  { type: 'near', student_id: '90000010', student_id2: '90000003' },
  { type: 'near', student_id: '90000010', student_id2: '90000009' },
  { type: 'near', student_id: '90000010', student_id2: '90000017' },
  // 右寄せ（★理由はシステムが持たない。位置の希望としてだけ扱う）
  { type: 'rightside', student_id: '90000007' },
  { type: 'rightside', student_id: '90000014' },
  { type: 'rightside', student_id: '90000021' },
];

/** 曜日ごとの入れ物（契約 v4）。見本は全曜日とも同じ並びから始める */
const byDay = (list: unknown[]) => ({ 月: list, 火: list, 水: list, 木: list, 金: list });
const GRID = { rows: 4, cols: 7 };

function seatPayload() {
  if (kase === 'noasof') return { students: STUDENTS, grid: GRID, seats: byDay(SEATS) };
  if (kase === 'rough') {
    return {
      students: [
        ...STUDENTS,
        { student_id: '90009901', name: '見本 ゆめ', days: days(T, T, T, T, T) },
        { student_id: '90009902', name: '見本 なずな', days: days(T, T, T, T, T) },
      ],
      grid: GRID,
      seats: byDay([
        ...SEATS,
        // 同じ席に2人目（1列目1番）
        { student_id: '90009902', row: 1, col: 1 },
        // 名簿に無い学籍番号の席（空いている4行目7番に置く）
        { student_id: '99999999', row: 4, col: 7 },
      ]),
      asof: ASOF,
      constraints: CONSTRAINTS,
    };
  }
  if (kase === 'violate') {
    return {
      students: STUDENTS,
      grid: GRID,
      // 90000009 の固定席は (2,2)。そこから動かして違反を作る
      seats: byDay(
        SEATS.map((x) => {
          if (x.student_id === '90000009') return { ...x, row: 4, col: 6 };
          // 引き離しの2人（90000003 と 90000017）を隣り合わせる
          // ★どちらも金曜に登校する2人を選ぶこと（来ない人だと違反にならない）
          if (x.student_id === '90000017') return { ...x, row: 1, col: 2 };
          return x;
        }),
      ),
      asof: ASOF,
      constraints: CONSTRAINTS,
    };
  }
  if (kase === 'impossible') {
    return {
      students: STUDENTS,
      grid: GRID,
      seats: byDay(SEATS),
      asof: ASOF,
      constraints: [
        // ★同じ席に2人を固定＝矛盾。名指しで止まること
        //   （どちらも毎日登校する2人を選んである）
        { type: 'fixed', student_id: '90000003', row: 2, col: 2 },
        { type: 'fixed', student_id: '90000009', row: 2, col: 2 },
      ],
    };
  }
  if (kase === 'badrules') {
    // ★知らない種別・項目の足りない行が混ざった状態（黙って捨てないことの確認）
    return {
      students: STUDENTS,
      grid: GRID,
      seats: byDay(SEATS),
      asof: ASOF,
      constraints: [
        { type: 'fixed', student_id: '90000001', row: 2, col: 1 },
        { type: 'sideways', student_id: '90000002' },
        { type: 'apart', a: '90000003' },
        { type: 'near' },
      ],
    };
  }
  if (kase === 'nogrid') {
    // ★grid を返さない窓口（控えの値で描き、そうと分かる印が出ること）
    return { students: STUDENTS, seats: byDay(SEATS), asof: ASOF, constraints: CONSTRAINTS };
  }
  // ★既定は「持ち回りの席」を返す＝保存したものが読み直しに出る
  return { students: STUDENTS, grid: GRID, seats: liveSeats, asof: ASOF, constraints: CONSTRAINTS };
}

let seatHits = 0;
let saveHits = 0;
/** ★A4-101：応答の2段目が落ちた状態（404）を、最初のN回だけ再現する */
const flaky = Number(params.get('flaky') || 0);
/** ★既存の窓口（赤帯を出す gasCall 側）にも効いているかを見るため */
const studentsFlaky = Number(params.get('studentsflaky') || 0);
let studentsHits = 0;
/** ★保存が本当に反映されたかを見るため、曜日ごとの席を持ち回りで書き換える */
const liveSeats: Record<string, unknown[]> = {
  月: [...SEATS], 火: [...SEATS], 水: [...SEATS], 木: [...SEATS], 金: [...SEATS],
};
let rereadFailLeft = 0;

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // ★本番の窓口には絶対に出さない（script.google.com はすべてここで止める）
  if (!url.includes('script.google.com')) return origFetch(input as RequestInfo, init);

  if (url.includes('action=api')) return J({}); // QR（別プロジェクト）

  const body = JSON.parse(String(init?.body || '{}'));
  const action = String(body.action || '');
  calls.push(action);

  if (action === 'getSeating') {
    seatHits++;
    // ★拒否は正しい返事。やり直さないことを確かめる
    if (kase === 'fail' || params.get('reject') === '1') {
      return J({ error: 'forbidden', reason: 'staffOnly' });
    }
    // ★最初のN回だけ 404（GASの応答の2段目が落ちている状態）
    if (flaky > 0 && seatHits <= flaky) {
      return new Response('not found', { status: 404 });
    }
    // ★保存のあとの「読み直し」も失敗させる（＝確認できない状態を作る）
    if (rereadFailLeft > 0) {
      rereadFailLeft--;
      return new Response('not found', { status: 404 });
    }
    if (kase === 'failafter' && seatHits > 1) return new Response('boom', { status: 500 });
    return J(seatPayload());
  }

  if (action === 'saveSeating') {
    saveHits++;
    calls.push('saveSeating:' + String(body.day) + ':' + (body.seats || []).length);
    // ★書き込みは再送されないこと（二重書きの防止）を確かめる
    if (params.get('saveflaky') === '1') return new Response('not found', { status: 404 });

    const sent = (body.seats || []) as unknown[];
    const d = String(body.day || '');

    // ★届いたのに返事だけ落ちた（2026-09-18 に本番で起きた形）
    if (params.get('savedrop') === '1') {
      liveSeats[d] = sent;                       // ← 実際に保存されている
      if (params.get('rereadfail') === '1') rereadFailLeft = 3;  // 読み直しも落とす
      return new Response('not found', { status: 404 });
    }
    // ★本当に届かなかった（保存されていない）
    if (params.get('savelost') === '1') {
      return new Response('not found', { status: 404 });
    }
    // 既定は「窓口がまだ無い」＝本番の今の状態。?save=ok で成功を返す
    if (params.get('save') === 'ok') {
      liveSeats[d] = (body.seats || []) as unknown[];
      return J({ ok: true });
    }
    // ★契約 v4：拒否は {"ok":false,"reason":"…"}（error ではない）
    return J({ ok: false, reason: 'not implemented yet' });
  }

  // 既存の画面が動くための最低限の返事
  if (action === 'getTT') return J(null);
  if (action === 'getMe') return J({ ok: false, reason: 'notEnrolled' });
  if (action === 'getStudents') {
    studentsHits++;
    if (studentsFlaky > 0 && studentsHits <= studentsFlaky) {
      return new Response('not found', { status: 404 });
    }
    return J([]);
  }
  if (action === 'getAttendance') return J([]);
  if (action === 'getPeriod2') return J([]);
  if (action === 'getRecs') return J([]);
  return J({ ok: true });
};

const fakeUser = {
  uid: 'harness-uid',
  email,
  emailVerified: true,
  getIdToken: async () => 'FAKE_ID_TOKEN',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;
const container = document.getElementById('root')!;
const root = w.__root || (w.__root = createRoot(container));

(async () => {
  const { auth } = await import('../src/firebase');
  Object.defineProperty(auth, 'currentUser', {
    get: () => fakeUser,
    set: () => {},
    configurable: true,
  });

  const { AppInner } = await import('../src/App');
  const { AuthContext } = await import('../src/hooks/auth-context');
  const value = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: fakeUser as any,
    loading: false,
    error: '',
    login: async () => {},
    logout: async () => {},
  };
  root.render(
    <AuthContext.Provider value={value}>
      <AppInner />
    </AuthContext.Provider>,
  );
})();
