/* eslint-disable react-refresh/only-export-components */
// ============================================================================
// 意匠刷新 第1段：生徒の「今日」画面と出欠8状態を、実物で描画するためのハーネス
// ============================================================================
// ・本番URLは叩かない。裏側（GAS）の返事はここで差し替える
// ・生徒の実データは使わない。すべて架空
// ・?att= / ?checkin= / ?checkout= / ?dx= / ?name= / ?attDelay= で状態を作る
//
//   att      none | in | inout      … 開いた時点で裏側にある記録
//   checkin  ok | slow | signin | neterr
//   checkout ok | slow | signin | neterr
//   dx       ok | fail | none（none＝QRの窓口が取れない＝連携先が分からない）
//   name     normal | long
//   attDelay 数値（ms）… getAttendance をわざと遅らせる（初期取得中の絵を撮る）
// ============================================================================
import { createRoot } from 'react-dom/client';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const email = params.get('email') || 's26100012@yushi-kokusai.jp';
const attInit = params.get('att') || 'none';
const checkinMode = params.get('checkin') || 'ok';
const checkoutMode = params.get('checkout') || 'ok';
const dxMode = params.get('dx') || 'ok';
const nameMode = params.get('name') || 'normal';
const attDelay = Number(params.get('attDelay') || 0);
const meMode = params.get('me') || 'ok';        // ok | notEnrolled | forbidden | error
const daysMode = params.get('days') || 'all';   // all | none（＝今日は登校日でない）
const ttMode = params.get('tt') || 'normal';    // normal | long（長い授業名）

const NAME = nameMode === 'long'
  ? '長谷川 佐和子スミスジョナサン'   // 架空。長い氏名で崩れないかを見るため
  : '山田 花子';
const GRADE = '2年';

const d = new Date();
const p2 = (n: number) => String(n).padStart(2, '0');
const today = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const wk = new Date(d); wk.setHours(0, 0, 0, 0);
wk.setDate(wk.getDate() - (wk.getDay() === 0 ? 6 : wk.getDay() - 1));
const weekKey = `${wk.getFullYear()}-${p2(wk.getMonth() + 1)}-${p2(wk.getDate())}`;

type Rec = { date: string; name: string; grade: string; checkinTime: string; checkoutTime: string };

// 裏側の台帳のつもり。checkIn / checkOut が通ったらここが変わる
let serverRec: Rec | null =
  attInit === 'in' ? { date: today, name: NAME, grade: GRADE, checkinTime: '09:08', checkoutTime: '' }
  : attInit === 'inout' ? { date: today, name: NAME, grade: GRADE, checkinTime: '09:08', checkoutTime: '15:32' }
  : null;

// 授業の選択も裏側に置いておく（保存 → 取り直して確かめる、の実測のため）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serverSel: any = {};

const calls: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__gasCalls = calls;

const J = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (!url.includes('script.google.com')) return origFetch(input as RequestInfo, init);

  // QR（別プロジェクトの窓口）
  if (url.includes('action=api')) {
    calls.push('qr');
    if (dxMode === 'none') return J({});
    return J({
      campus: '福岡', date: today, tokou_qr: 'x', gekou_qr: 'y',
      tokou_url: 'https://example.invalid/tokou',
      gekou_url: 'https://example.invalid/gekou',
      updated_at: '09:00',
    });
  }

  const body = JSON.parse(String(init?.body || '{}'));
  const action = String(body.action || '');
  calls.push(action);

  if (action === 'getTT') {
    if (ttMode !== 'long') return J(null);
    // 長い授業名で崩れないかを見るための架空のひな形
    const long1 = '地域探究プロジェクト（商店街フィールドワーク・事前学習）';
    const long2 = 'コミュニケーション演習／プレゼンテーション基礎';
    const mk = () => ({
      'A教室（2年）': ['', long1, long2, long1, long2, long1],
      'C教室（3年）': ['', long2, long1, long2, long1, long2],
      'D教室（1年）': ['', long1, long2, long1, '', ''],
      'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
    });
    return J({ 月: mk(), 火: mk(), 水: mk(), 木: mk(), 金: mk() });
  }

  if (action === 'getMe') {
    if (meMode === 'notEnrolled') return J({ ok: false, reason: 'notEnrolled' });
    if (meMode === 'forbidden') return J({ error: 'forbidden', reason: 'unknownAccount' });
    if (meMode === 'error') throw new TypeError('Failed to fetch');
    const days = daysMode === 'none'
      ? { 月: false, 火: false, 水: false, 木: false, 金: false }
      : { 月: true, 火: true, 水: true, 木: true, 金: true };
    return J({ ok: true, student: {
      name: NAME, grade: GRADE, course: '通常',
      dx_email: 's26100012@younet.example', has_password: true,
      days,
    }});
  }

  if (action === 'getAttendance') {
    if (attDelay > 0) await sleep(attDelay);
    return J(serverRec ? [serverRec] : []);
  }

  if (action === 'getPeriod2') {
    return J([{ week: weekKey, name: NAME, selections: serverSel }]);
  }

  if (action === 'checkIn') {
    if (checkinMode === 'slow') await sleep(30000);
    if (checkinMode === 'signin') return J({ error: 'unauthorized', reason: 'signin' });
    if (checkinMode === 'neterr') throw new TypeError('Failed to fetch');
    serverRec = { date: today, name: NAME, grade: GRADE, checkinTime: '09:08', checkoutTime: '' };
    return J({ ok: true });
  }

  if (action === 'checkOut') {
    if (checkoutMode === 'slow') await sleep(30000);
    if (checkoutMode === 'signin') return J({ error: 'unauthorized', reason: 'signin' });
    if (checkoutMode === 'neterr') throw new TypeError('Failed to fetch');
    if (serverRec) serverRec = { ...serverRec, checkoutTime: '15:32' };
    return J({ ok: true });
  }

  if (action === 'dxCheckIn') {
    return J(dxMode === 'fail' ? { ok: false } : { ok: true });
  }

  if (action === 'savePeriod2') {
    serverSel = body.selections || {};
    return J({ ok: true });
  }

  return J({ ok: true });
};

const fakeUser = {
  uid: 'fake-uid', email, emailVerified: true,
  getIdToken: async () => 'FAKE_ID_TOKEN',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;
const container = document.getElementById('root')!;
const root = w.__root || (w.__root = createRoot(container));

(async () => {
  const { auth } = await import('../src/firebase');
  Object.defineProperty(auth, 'currentUser', {
    get: () => fakeUser, set: () => {}, configurable: true,
  });

  const { AppInner } = await import('../src/App');
  const { AuthContext } = await import('../src/hooks/auth-context');
  const value = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: fakeUser as any,
    loading: false,
    error: '',
    login: async () => {},
    logout: async () => { calls.push('logout'); },
  };
  root.render(
    <AuthContext.Provider value={value}>
      <AppInner />
    </AuthContext.Provider>
  );
})();
