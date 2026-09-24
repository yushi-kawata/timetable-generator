import { useEffect, useRef } from 'react';
import StudentPage from './components/student/StudentPage';
import TeacherPage from './components/teacher/TeacherPage';
import AdminPage from './components/admin/AdminPage';
import HealthCheckPage from './components/health/HealthCheckPage';
// ★教室の座席表（台帳 A4-107）。福岡GCの教室だけ。入口は職員にだけ出す
import SeatChartPage from './components/seats/SeatChartPage';
// ★教室表示モード（台帳 A4-119）。専用URL（#/seats/classroom）でだけ入る。
//   ★この画面には他の画面へ行く道を1つも描かない（下の return より手前で返す）。
import ClassroomSeatView from './components/seats/ClassroomSeatView';
import LoginGate from './components/auth/LoginGate';
import { NotFoundNotice, StaffOnlyNotice } from './components/nav/RouteNotice';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/auth-context';
// ★画面の行き先は URL のハッシュで決まる（台帳 A4-120）。
//   行き先の一覧・職員専用かどうかの判定は lib/route.ts が正本。
//   ★ここに行き先を書き足さないこと。
import { goTo, replaceWith, useRoute } from './hooks/useRoute';
import { isPersonSwitched, isStaffRoute } from './lib/route';
import { useAppStore } from './stores/useMasterStore';
import { classifyRole } from './lib/role';

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
  // ★切り分け用の1行（台帳 A4-101）。応答の番号・試した回数・窓口の末尾
  const gasErrorDetail = useAppStore((s) => s.gasErrorDetail);
  const clearGasError = useAppStore((s) => s.clearGasError);

  // ★いまの行き先は URL のハッシュ（台帳 A4-120）。
  //   ハッシュが無い＝これまでのブックマーク＝生徒用に着きます。
  const { route } = useRoute();

  // ★教室表示モードか（台帳 A4-119）。専用URLで入ったときだけ true
  const isClassroom = route === 'classroom';

  // ★ログインが済んでから取りに行く（未ログインで叩かない）
  //   ★教室表示モードでは取りに行きません。置きっぱなしの iPad に
  //     名簿（氏名・メール・パスワードの有無）や時間割マスタを降ろさないため。
  //     この画面が使うのは座席表の窓口だけです（ClassroomSeatView が自分で叩く）。
  useEffect(() => {
    if (!user) return;
    if (isClassroom) return;
    fetchAll();
  }, [user, fetchAll, isClassroom]);

  // ★入っている人が変わったら、表示中のページを必ず生徒用に戻す。
  //   これをしないと、同じ端末で入り直した次の人が
  //   「教員用ページが開いたまま」の状態を引き継いでしまう。
  //   ★履歴は【差し替える】（replaceWith）。積むと、次の人が戻るボタンで
  //     前の人の画面を開けてしまう。
  //
  // ★★2026-09-19 修正（台帳 A4-119／A4-120）────────────────────────────
  //   【直した不具合】URL を直接開くと、必ず生徒用（#/）へ飛ばされていた。
  //     #/seats/classroom も #/seats も #/health も #/admin も、全部です。
  //     ＝ハッシュで画面を分ける仕組み（A4-120）が、ブックマークからは
  //       1つも効いていませんでした。iPad だけの話ではありません。
  //   【なぜ起きたか】ログインの状態は【必ず2段階】で届きます。
  //       1回目の描画: loading:true  / user:null   （復元中）
  //       しばらく後 : loading:false / user:あり   （復元できた）
  //     前の書き方は prevUidRef を「1回目の描画の uid」＝null で始めていました。
  //     そのため、ただ復元できただけの null → あり を「人が変わった」と数え、
  //     開くたびに生徒用へ差し替えていました。
  //   【直し方】★最初に「誰が入っているか」が分かった1回は、人の入れ替わりでは
  //     ありません。まだ確かめていない印として undefined で始め、その1回は見送ります。
  //     ・復元できただけ（null → あり）…… 飛ばさない＝URL どおりの画面が出る
  //     ・ログアウト（あり → null）………… 飛ばす（次の人に引き継がせない）
  //     ・入れ替わり（A → B）……………… 飛ばす
  //   ★守り（職員専用かどうか）は、この下の番人が見ています。ここは引き継ぎ防止だけ。
  //   ★ここを「とにかく毎回生徒用へ」に戻さないこと。ブックマークが全部死にます。
  //   ★判断そのものは src/lib/route.ts の isPersonSwitched が正本です。
  //     （画面の中に書くとブラウザ抜きで試験できないため。試験＝tests/route.test.mjs）
  const uid = user?.uid ?? null;
  /** ★undefined ＝ まだ一度も「誰が入っているか」を確かめていない */
  const prevUidRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // 確認中は判断しない（この間の null は「誰もいない」ではなく「まだ分からない」）
    if (authLoading) return;
    const prev = prevUidRef.current;
    prevUidRef.current = uid;
    if (!isPersonSwitched(prev, uid)) return;
    replaceWith('student');
  }, [authLoading, uid]);

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

  // ── ★行き先の番人（台帳 A4-120）─────────────────────────────────
  // URL で画面を分けたので、【URL を知っていれば誰でも打ち込めます】。
  // ★そのため、開いた時点でここを通します。「ボタンを隠す」だけでは足りません。
  // ★守りは二重です。窓口（GAS）も生徒を拒否するので、画面が開けてもデータは
  //   1件も降りてきません。それでも画面側でも止めます。
  // ★真っ白にしない／エラーだけ出して放り出さない。必ず行ける場所を添えます。
  if (route === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <NotFoundNotice onGoStudent={() => goTo('student')} />
      </div>
    );
  }
  if (isStaffRoute(route) && !isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <StaffOnlyNotice onGoStudent={() => goTo('student')} />
      </div>
    );
  }

  // ── ★教室表示モード（台帳 A4-119）───────────────────────────────
  // ★ここで返します。この下のヘッダー（戻る・他の画面への入口・ログアウト）を
  //   1つも描かないためです。＝この画面から他へ行く道は0本。
  // ★★画面側だけでは守れません。生徒が URL を打ち替えれば戻れます。
  //   iPad の【アクセスガイド】で Safari から出られなくして、初めて成立します。
  if (route === 'classroom') {
    return <ClassroomSeatView />;
  }

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <header className="bg-[var(--ink)] text-white px-4 sm:px-8 py-4 flex items-center justify-between flex-wrap gap-3">
        {/* ★2026-09-09 意匠刷新 第1段：flex-wrap を足しただけ。
            端末の文字サイズを200%にすると、題名と「生徒用」の札が横に並びきらず
            画面が横にはみ出していた（幅320で74px）。折り返せるようにして止めている。
            ヘッダーの作り直しそのものは第2段。 */}
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h1 className="text-base font-bold flex items-center gap-2 whitespace-nowrap">
            <span>📅</span> 通学生ポータル
          </h1>
          <span
            className={`text-[11px] font-bold px-3 py-1 rounded-full tracking-wide whitespace-nowrap ${
              route === 'student'
                ? 'bg-green-400 text-green-900'
                : route === 'health'
                  ? 'bg-rose-400 text-rose-900'
                  : route === 'seats'
                    ? 'bg-sky-300 text-sky-900'
                    : 'bg-amber-400 text-amber-900'
            }`}
          >
            {route === 'student'
              ? '生徒用'
              : route === 'health'
                ? '健康観察'
                : route === 'seats'
                  ? '座席表'
                  : '教員用'}
          </span>
        </div>
        <div className="flex gap-3 text-sm items-center flex-wrap">
          {/* ★座席表は下の「← 戻る」を使う。ここを除外しないと戻るボタンが2つ並ぶ */}
          {route !== 'student' && route !== 'health' && route !== 'seats' && (
            <button
              onClick={() => goTo('student')}
              className="text-white/60 hover:text-white"
            >
              ← 生徒用に戻る
            </button>
          )}
          {(route === 'health' || route === 'seats') && (
            <button
              onClick={() => goTo('student')}
              className="text-white/60 hover:text-white"
            >
              ← 戻る
            </button>
          )}
          {route === 'student' && (
            <>
              <button
                onClick={() => goTo('health')}
                className="text-white/60 hover:text-white"
              >
                🏥 健康観察
              </button>
              {/* ★教員用ページの入口は職員にだけ出す（台帳 A4-41／2026-09-09 社長決裁）。
                  生徒に見せても中身は裏側が forbidden で止めるため、
                  開かない入口を見せる意味がない。合言葉は廃止済み。 */}
              {/* ★座席表（台帳 A4-107）も職員にだけ出す。教室の iPad で開く画面で、
                  氏名が並ぶので生徒の入口には置かない。 */}
              {isStaff && (
                <button
                  onClick={() => goTo('seats')}
                  className="text-white/60 hover:text-white"
                >
                  🪑 座席表
                </button>
              )}
              {isStaff && (
                <button
                  onClick={() => goTo('admin')}
                  className="text-white/60 hover:text-white"
                >
                  教員用ページ →
                </button>
              )}
            </>
          )}
          {(route === 'teacher' || route === 'admin') && (
            <>
              <button
                onClick={() => goTo('seats')}
                className="text-white/60 hover:text-white"
              >
                🪑 座席表
              </button>
              <button
                onClick={() => goTo('health')}
                className="text-white/60 hover:text-white"
              >
                🏥 健康観察
              </button>
            </>
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
            {/* ★何が起きたかを出す（台帳 A4-101）。
                2026-09-18 は、この1行が無いせいで切り分けに20分かかった。
                先生が読んでそのまま伝えられる形にしてある。 */}
            {gasErrorDetail && (
              <span
                className={
                  gasErrorKind === 'forbidden'
                    ? 'block text-[11px] text-amber-700/80 mt-1 numeric break-all'
                    : 'block text-[11px] text-red-600/80 mt-1 numeric break-all'
                }
              >
                {gasErrorDetail}
              </span>
            )}
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
        {route === 'student' && <StudentPage />}
        {route === 'teacher' && <TeacherPage />}
        {route === 'admin' && <AdminPage goTeacher={() => goTo('teacher')} />}
        {/* ★座席表（台帳 A4-107）。窓口・見本データの切り替えは lib/seatChartApi.ts 側。
            ここでは出し分けだけを行う（守りは裏側）。 */}
        {route === 'seats' && <SeatChartPage />}
        {/* ★2026-09-09（社長決裁・案B）: 健康観察の教員確認も、合言葉ではなく
            Googleログイン＋役割判定（isStaff）で通します。
            ・合言葉 teacher1234 は【公開バンドルに文字列で載っていて誰でも読めます】。
              時間割ツールの教員用ページで廃止したのと同じ理由で、ここでも境目に
              なっていません。
            ・Googleログイン＋メールの形での職員判定は本物の本人確認なので、
              合言葉より強くなります（弱くしているのではありません）。
            ・職員でない人（生徒・どちらとも判定できないアカウント）には false が
              渡るので、保健側の合言葉の仕切りはそのまま残ります。
            ★HealthCheckPage の中身は触っていません。渡す値を変えただけです。
              保健側の窓口（GAS）には番人が入っていません（台帳 A4-72）。
              画面の出し分けは守りではないので、窓口の手当ては別案件のままです。 */}
        {route === 'health' && <HealthCheckPage isTeacher={isStaff} />}
      </main>
    </div>
  );
}
