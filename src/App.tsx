import { useState, useEffect } from 'react';
import StudentPage from './components/student/StudentPage';
import TeacherPage from './components/teacher/TeacherPage';
import AdminPage from './components/admin/AdminPage';
import HealthCheckPage from './components/health/HealthCheckPage';
import LoginGate from './components/auth/LoginGate';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/auth-context';
import { useAppStore } from './stores/useMasterStore';
import { classifyRole } from './lib/role';

type Mode = 'student' | 'teacher' | 'admin' | 'health';

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

// ★AuthProvider の中身。動作確認のときに、ログイン済みの状態を差し込んで
//   描画するために外へ出してある（本番の入口はあくまで上の App）。
export function AppInner() {
  // ★入口はここ1つ。ログインしていない間は中身を出さないし、
  //   裏側（GAS）も叩かない（未ログインで叩くと全部拒否されるだけなので）。
  const { user, loading: authLoading, logout } = useAuth();

  const fetchAll = useAppStore((s) => s.fetchAll);
  const gasError = useAppStore((s) => s.gasError);
  const gasErrorKind = useAppStore((s) => s.gasErrorKind);
  const clearGasError = useAppStore((s) => s.clearGasError);

  const [mode, setMode] = useState<Mode>('student');

  // ★ログインが済んでから取りに行く（未ログインで叩かない）
  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  // ★入っている人が変わったら、表示中のページを必ず生徒用に戻す。
  //   これをしないと、同じ端末で入り直した次の人が
  //   「教員用ページが開いたまま」の状態を引き継いでしまう。
  //   （React の「レンダー中に前の値と比べて state を直す」書き方。
  //     useEffect でやるより1回描き直す回数が少なくて済む）
  const uid = user?.uid ?? null;
  const [prevUid, setPrevUid] = useState<string | null>(uid);
  if (uid !== prevUid) {
    setPrevUid(uid);
    setMode('student');
  }

  const handleLogout = async () => {
    clearGasError();
    await logout();
  };

  // ★2026-09-09（台帳 A4-41／社長決裁）: 教員用ページの合言葉（teacher1234）は廃止しました。
  //   ・Google ログイン＋裏側の役割判定が稼働したので、合言葉は権限の境目ではなく
  //     【見た目の切り替えを止めているだけ】になっていた。
  //   ・localStorage の admin_pw を書き換えれば素通りでき、既定値は公開バンドルに
  //     文字列で載っていた。「守っていないのに守っているように見える」状態だったため外した。
  //   ・入口の出し分けは下の isStaff（= classifyRole）に一本化しています。
  //     ★新しい判定をここに書き足さないこと（src/lib/role.ts が正本）。
  //   ・localStorage の admin_pw はもう読みません（残骸のキーが残っていても害はない）。
  //   ※健康観察（HealthCheckPage）の合言葉は別プロジェクトの窓口で今回の対象外。そのままです。

  // ── 最初の確認中（ここで画面を出すと一瞬ログイン画面が見えてしまう）──
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm text-[var(--ink3)]">
          <span className="inline-block w-5 h-5 border-2 border-stone-300 border-t-[var(--accent)] rounded-full animate-spin" />
          読み込み中...
        </div>
      </div>
    );
  }

  // ── 未ログイン ──
  if (!user) {
    return (
      <div className="min-h-screen">
        <main className="max-w-[1050px] mx-auto px-4 sm:px-5 py-7 pb-16">
          <LoginGate />
        </main>
      </div>
    );
  }

  // ★職員か生徒か。判定は src/lib/role.ts が正本（裏側の classifyRole_ と同じ）。
  //   ここで新しい判定を書かないこと。
  const role = classifyRole(user.email || '');
  /** 教員用ページの入口を出してよい人＝職員だけ */
  const isStaff = role === 'staff';

  // ── 生徒とも職員とも判定できないアカウント ──
  // ★裏側は、この形のアカウントに対して全アクションを forbidden にします
  //   （reason: 'unknownAccount'）。画面もどちらのページも出しません。
  //   ★ここで止めるのは【出し分け】であって守りではありません。守りは裏側です。
  if (role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card !mb-0 max-w-sm w-full text-center shadow-lg shadow-stone-200/50">
          <div className="text-3xl mb-3" aria-hidden="true">🚫</div>
          <h1 className="text-base font-bold text-[var(--ink)] mb-2">
            このアカウントでは利用できません
          </h1>
          <p className="text-sm text-[var(--ink3)] leading-relaxed mb-1">
            先生にご連絡ください。
          </p>
          <p className="text-xs text-[var(--ink3)] leading-relaxed mb-6 break-all">
            いま入っているアカウント：{user.email}
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-bold text-sm hover:bg-blue-800"
          >
            別のアカウントでログインし直す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <header className="bg-[var(--ink)] text-white px-4 sm:px-8 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-bold flex items-center gap-2 whitespace-nowrap">
            <span>📅</span> 通学生ポータル
          </h1>
          <span
            className={`text-[11px] font-bold px-3 py-1 rounded-full tracking-wide whitespace-nowrap ${
              mode === 'student'
                ? 'bg-green-400 text-green-900'
                : mode === 'health'
                  ? 'bg-rose-400 text-rose-900'
                  : 'bg-amber-400 text-amber-900'
            }`}
          >
            {mode === 'student' ? '生徒用' : mode === 'health' ? '健康観察' : '教員用'}
          </span>
        </div>
        <div className="flex gap-3 text-sm items-center flex-wrap">
          {mode !== 'student' && mode !== 'health' && (
            <button
              onClick={() => setMode('student')}
              className="text-white/60 hover:text-white"
            >
              ← 生徒用に戻る
            </button>
          )}
          {mode === 'health' && (
            <button
              onClick={() => setMode('student')}
              className="text-white/60 hover:text-white"
            >
              ← 戻る
            </button>
          )}
          {mode === 'student' && (
            <>
              <button
                onClick={() => setMode('health')}
                className="text-white/60 hover:text-white"
              >
                🏥 健康観察
              </button>
              {/* ★教員用ページの入口は職員にだけ出す（台帳 A4-41／2026-09-09 社長決裁）。
                  生徒に見せても中身は裏側が forbidden で止めるため、
                  開かない入口を見せる意味がない。合言葉は廃止済み。 */}
              {isStaff && (
                <button
                  onClick={() => setMode('admin')}
                  className="text-white/60 hover:text-white"
                >
                  教員用ページ →
                </button>
              )}
            </>
          )}
          {(mode === 'teacher' || mode === 'admin') && (
            <button
              onClick={() => setMode('health')}
              className="text-white/60 hover:text-white"
            >
              🏥 健康観察
            </button>
          )}
          {/* ★いま誰で入っているかを常に見えるようにする（取り違えの事故を防ぐ） */}
          <span className="text-[11px] text-white/50 max-w-[180px] truncate" title={user.email || ''}>
            {user.email}
          </span>
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-white whitespace-nowrap"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ★裏側に拒否された／つながらないときの帯。
          no-cors をやめたので、拒否をここで表に出せる（前は「0件」に見えていた）。
          ★2026-09-09（台帳 A4-41）: 添える案内文を種類で分ける。
            権限の話（forbidden）で「入り直してください」と出すと、
            直らないやり直しを延々させることになる。 */}
      {gasError && (
        <div
          role="alert"
          className={
            gasErrorKind === 'forbidden'
              ? 'bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-3 text-sm text-amber-800 flex items-start justify-between gap-3'
              : 'bg-red-50 border-b border-red-200 px-4 sm:px-8 py-3 text-sm text-red-700 flex items-start justify-between gap-3'
          }
        >
          <div className="leading-relaxed">
            <span className="font-bold">{gasError}</span>
            <span
              className={
                gasErrorKind === 'forbidden'
                  ? 'block text-xs text-amber-700 mt-0.5'
                  : 'block text-xs text-red-600 mt-0.5'
              }
            >
              {gasErrorKind === 'forbidden'
                ? 'ログインし直しても変わりません。このアカウントでは開けない画面です。'
                : gasErrorKind === 'network'
                  ? '通信の状態を確かめて、もう一度お試しください。'
                  : 'ログインの有効期限が切れている場合があります。一度ログアウトして、学校のアカウントで入り直してください。'}
            </span>
          </div>
          <button
            onClick={clearGasError}
            aria-label="このお知らせを閉じる"
            className={
              gasErrorKind === 'forbidden'
                ? 'text-amber-600 hover:text-amber-800 text-xs font-bold shrink-0 px-2 py-1'
                : 'text-red-500 hover:text-red-700 text-xs font-bold shrink-0 px-2 py-1'
            }
          >
            ✕
          </button>
        </div>
      )}

      {/* ★合言葉のモーダルは廃止（台帳 A4-41／2026-09-09）。
          教員用ページは職員かどうかだけで出し分けます。 */}

      {/* メインコンテンツ */}
      <main className="max-w-[1050px] mx-auto px-4 sm:px-5 py-7 pb-16">
        {mode === 'student' && <StudentPage />}
        {mode === 'teacher' && <TeacherPage />}
        {mode === 'admin' && <AdminPage goTeacher={() => setMode('teacher')} />}
        {/* ★健康観察は【別プロジェクトの窓口】で、今回の役割判定の外側です。
            この画面は自前の合言葉を持っているので、こちらからは解錠しません
            （isTeacher は常に false ＝ 健康観察側の仕切りをそのまま使う）。
            ここに isStaff を渡すと保健の画面が無防備になります。渡さないこと。 */}
        {mode === 'health' && <HealthCheckPage isTeacher={false} />}
      </main>
    </div>
  );
}
