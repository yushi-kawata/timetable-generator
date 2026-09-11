/* eslint-disable react-refresh/only-export-components */
// 描画確認用のハーネス（本番の入口ではない）。台帳 A4-41
// ・ログイン済みの状態を差し込み、裏側（GAS）の返事を差し替えて実際に描画する
// ・?case=... で返す拒否を切り替える／?email=... で入っている人を切り替える
import { createRoot } from 'react-dom/client';
import '../src/index.css';

const params = new URLSearchParams(location.search);
const email = params.get('email') || 's26100012@yushi-kokusai.jp';
const kase = params.get('case') || 'ok';
// ★2026-09-11（台帳 A4-86）連携の描画確認用。既定は今までどおり（何も変わらない）
//   ?dx=ok|notEnrolled|noPassword|dxLoginFailed|noDxUrl|badDxUrl|http500
//   ?confirm=miss … getAttendance が空を返す＝保存の確認に失敗する状態を作る
//   ?qr=on        … QRの窓口が行き先を返している状態を作る
const dxCase = params.get('dx') || 'ok';
const confirmCase = params.get('confirm') || 'hit';
const qrCase = params.get('qr') || 'off';
//   ?start=fresh  … まだ登校していない状態から始める（既定は今までどおり登校済み）
const startCase = params.get('start') || 'checkedIn';
let hasCheckedIn = startCase !== 'fresh';

const NAME = '山田 太郎';
const d = new Date();
const p2 = (n: number) => String(n).padStart(2, '0');
const today = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const wk = new Date(d); wk.setHours(0, 0, 0, 0);
wk.setDate(wk.getDate() - (wk.getDay() === 0 ? 6 : wk.getDay() - 1));
const weekKey = `${wk.getFullYear()}-${p2(wk.getMonth() + 1)}-${p2(wk.getDate())}`;

// ---- 叩かれたアクションを記録する（getRecs / getStudents を呼んでいないことの実測用）
const calls: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__gasCalls = calls;

const J = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
const STAFF_ONLY = ['getStudents', 'saveStudents', 'getRecs', 'saveRec', 'deleteRec', 'clearRecs', 'saveTT'];

const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  if (!url.includes('script.google.com')) return origFetch(input as RequestInfo, init);

  // QR（別プロジェクトの窓口。GET）
  if (url.includes('action=api')) {
    calls.push('qr');
    if (qrCase !== 'on') return J({});
    const dxUrl = 'https://you-net-dx.jp/yushi/student/pages/entry_commute.php?type=0&studio_id=3&todate=DUMMY';
    return J({
      campus: '福岡', date: today,
      tokou_qr: 'data:image/png;base64,DUMMY', gekou_qr: 'data:image/png;base64,DUMMY',
      tokou_url: dxUrl, gekou_url: dxUrl.replace('type=0', 'type=1'),
      updated_at: today + ' 08:30:00',
    });
  }

  const body = JSON.parse(String(init?.body || '{}'));
  const action = String(body.action || '');
  calls.push(action);

  if (kase === 'signin') return J({ error: 'unauthorized', reason: 'signin' });
  if (kase === 'unknownBanner') return J({ error: 'forbidden', reason: 'unknownAccount' });
  // ★裏側と同じ番人を真似る（生徒には職員用アクションを通さない）
  const isStudentEmail = /^[a-z][0-9]{8}@/.test(email.trim().toLowerCase());
  if (isStudentEmail && STAFF_ONLY.includes(action)) {
    return J({ error: 'forbidden', reason: 'staffOnly' });
  }

  if (action === 'getTT') return J(null);
  if (action === 'getMe') return J({ ok: true, student: {
    name: NAME, grade: '2年', course: '通常',
    dx_email: 's26100012@younet.example', has_password: true,
    days: { 月: true, 火: true, 水: true, 木: true, 金: true },
  }});
  // ★裏側は生徒には【本人の行だけ】返す（limitToSelf_）。それを再現する
  // ★裏側は生徒には【本人の行だけ】返す（limitToSelf_）。職員には全員分。
  const OTHERS = [
    { date: today, name: '佐藤 花子', grade: '3年', checkinTime: '08:55', checkoutTime: '15:30' },
    { date: today, name: '鈴木 一郎', grade: '1年', checkinTime: '09:40', checkoutTime: '' },
  ];
  const MINE = { date: today, name: NAME, grade: '2年', checkinTime: '09:12', checkoutTime: '' };
  // ★confirm=miss ＝ 裏側が本人の行を返してこない状態（日付の型違い・氏名の食い違い等）。
  //   これが台帳 A4-86 で連携が止まっていた条件。
  if (action === 'checkIn' || action === 'checkOut') {
    hasCheckedIn = true;
    return J({ ok: true });
  }
  if (action === 'getAttendance') {
    if (confirmCase === 'miss') return J([]);
    const mine = hasCheckedIn ? [MINE] : [];
    return J(isStudentEmail ? mine : [...mine, ...OTHERS]);
  }

  // ★連携の返事。本番のGASが返す形に合わせる（reason / code つき）
  if (action === 'dxCheckIn') {
    if (dxCase === 'ok') return J({ ok: true, code: 200 });
    if (dxCase === 'http500') return new Response('boom', { status: 500 });
    if (dxCase === 'code') return J({ ok: false, code: 404 });
    return J({ ok: false, reason: dxCase, msg: dxCase });
  }

  const sel = { 2: 'A教室（2年）' };
  const MY_P2 = { week: weekKey, name: NAME,
    selections: { 月: sel, 火: sel, 水: sel, 木: sel, 金: sel } };
  const OTHER_P2 = { week: weekKey, name: '佐藤 花子',
    selections: { 月: sel, 火: sel, 水: sel, 木: sel, 金: sel } };
  if (action === 'getPeriod2') return J(isStudentEmail ? [MY_P2] : [MY_P2, OTHER_P2]);

  if (action === 'getStudents') return J([
    { name: NAME, grade: '2年', course: '通常', dx_email: 's26100012@younet.example',
      has_password: true, days: { 月: true, 火: true, 水: true, 木: true, 金: true } },
    { name: '佐藤 花子', grade: '3年', course: '通常', dx_email: 's26100013@younet.example',
      has_password: true, days: { 月: true, 火: true, 水: true, 木: true, 金: true } },
    { name: '鈴木 一郎', grade: '1年', course: 'Growth', dx_email: 's26100014@younet.example',
      has_password: false, days: { 月: true, 火: true, 水: true, 木: true, 金: true } },
  ]);
  if (action === 'getRecs') return J([]);
  return J({ ok: true });
};

const fakeUser = {
  uid: 'fake-uid', email, emailVerified: true,
  getIdToken: async () => 'FAKE_ID_TOKEN',
};

// ★同じ container に2回 createRoot しないための保険（ハーネス側の都合）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any;
const container = document.getElementById('root')!;
const root = w.__root || (w.__root = createRoot(container));

(async () => {
  const { auth } = await import('../src/firebase');
  // Firebase の内部が currentUser を null に戻しても差し込みが残るようにする
  Object.defineProperty(auth, 'currentUser', {
    get: () => fakeUser, set: () => {}, configurable: true,
  });

  if (kase === 'role') {
    const { classifyRole } = await import('../src/lib/role');
    const cases: [string, string | null][] = [
      ['s26100012@yushi-kokusai.jp', 'student'],
      ['a00000001@yushi-kokusai.jp', 'student'],
      ['s-kawata@yushi-kokusai.jp', 'staff'],
      ['sa-sakai@yushi-kokusai.jp', 'staff'],
      ['s-ohno@yushi-kokusai.jp', 'staff'],
      ['S-Kawata@Yushi-Kokusai.JP', 'staff'],
      ['  s26100012@yushi-kokusai.jp  ', 'student'],
      ['s2610001@yushi-kokusai.jp', null],
      ['s261000123@yushi-kokusai.jp', null],
      ['26100012@yushi-kokusai.jp', null],
      ['kawata@yushi-kokusai.jp', null],
      ['-kawata@yushi-kokusai.jp', null],
      ['kawata-@yushi-kokusai.jp', null],
      ['s-kawata@gmail.com', null],
      ['s-kawata@yushi-kokusai.jp.evil@x.com', null],
      ['s26100012', null],
    ];
    const rows = cases.map(([e, want]) => {
      const got = classifyRole(e);
      return { e, want, got, ok: got === want };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__roleResult = rows;
    root.render(
      <pre id="role-out" style={{ fontFamily: 'monospace', fontSize: 12, padding: 16 }}>
        {rows.map(r => `${r.ok ? 'OK  ' : 'NG  '}${r.e} → ${String(r.got)}（${String(r.want)} のはず）`).join('\n')}
        {'\n\n'}
        {rows.every(r => r.ok) ? `全 ${rows.length} 件 一致` : '★不一致あり'}
      </pre>
    );
    return;
  }

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
