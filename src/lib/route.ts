// ============================================================================
// 画面の行き先（URL のハッシュ）── 台帳 A4-120
// ============================================================================
// ★このファイルは【画面もブラウザも持たない】。文字列を行き先の名前に直す、
//   名前から文字列を作る、その画面が職員専用かを答える、の3つだけ。
//   試験（tests/route.test.mjs）はここを直接読む。
// ★runtime の import を持たせないこと（型の import だけ）。
//   試験の読み込み器（tests/_load-ts.mjs）が単体で変換して読むため。
//
// ──────────────────────────────────────────────────────────────────────────
// ★なぜ「#」を使うのか（2026-09-18 社長指示）
//   このツールは GitHub Pages（静的配信）から動きます。/health のような
//   【普通のパス】を直接開くと、その名前のファイルが無いので 404 になります。
//   404.html を置いて書き戻す細工でも回避できますが、仕組みが1つ増えます。
//   ハッシュ（#/health）はサーバーに送られないので、そのまま動きます。
//
// ★なぜ react-router を入れないのか（判断の理由は報告にも書いてあります）
//   ・画面は5つで、入れ子も、URL の途中の値（/students/:id）もありません。
//   ・この形なら hashchange を見るだけで足ります（下の useRoute は20行ほど）。
//   ・本番稼働中のツールに依存を1つ増やすと、更新のたびに壊れる面が増えます。
//   ・★試験の読み込み器は「import を持たない純粋なモジュール」しか読めません。
//     行き先の判定をこのファイルに置いておけば、ブラウザ抜きで試験できます。
//   ★入れ子の画面や URL の途中の値が要る日が来たら、そのときに入れ直すこと。
//
// ──────────────────────────────────────────────────────────────────────────
// ★★URL で画面を分けると「URL を知っていれば開ける」ようになります。
//   これまでは【ボタンを出すかどうか】で職員と生徒を分けていましたが、
//   URL が出回れば生徒も打ち込めます。
//   そこで、行き先ごとに【職員専用かどうか】を下の STAFF_ONLY に必ず書きます。
//   画面（App.tsx）は、開いた時点でこの表を見て、職員でなければ中身を描きません。
//   ★守りは二重です。窓口（GAS）も生徒を拒否します（画面が開けてもデータは
//     1件も降りてきません）。それでも画面側でも止めます。

/** 行き先の名前。★画面を足したら、下の2つの表にも必ず足すこと（型が守ります） */
export type RouteName = 'student' | 'health' | 'teacher' | 'admin' | 'seats' | 'classroom';

/** 並び順つきの一覧（試験が全部の行き先を回るために使う） */
export const ROUTE_NAMES: RouteName[] = [
  'student',
  'health',
  'teacher',
  'admin',
  'seats',
  'classroom',
];

/**
 * 行き先 → URL のハッシュ。
 * ★生徒用は '#/' です。'#/student' でも同じ画面に着きますが、
 *   作るときは '#/' を使います（いちばん短い形を正本にする）。
 */
export const ROUTE_HASH: Record<RouteName, string> = {
  student: '#/',
  health: '#/health',
  teacher: '#/teacher',
  admin: '#/admin',
  seats: '#/seats',
  // ★教室表示モード（台帳 A4-119）。教室の iPad に置きっぱなしにする画面。
  //   ★この URL は画面のどこからもリンクしません（社長決裁(2)＝専用のURL・
  //     画面上に切り替えを置かない）。iPad にこの URL を直接ブックマークします。
  classroom: '#/seats/classroom',
};

/**
 * ★職員だけが開ける画面。
 *   ここを false にすると、その画面は URL を知っている誰でも開けます。
 *   ★足すときは【必ず】ここにも書くこと（Record 型なので、書き忘れると
 *     ビルドが通りません）。
 */
export const STAFF_ONLY: Record<RouteName, boolean> = {
  // 生徒が毎日使う画面
  student: false,
  // 健康観察は生徒も出します（教員の確認欄だけ職員に出る＝画面の中で分けている）
  health: false,
  // ここから下は職員だけ
  teacher: true,
  admin: true,
  seats: true,
  // ★教室表示モードも職員だけ（氏名が並ぶ画面なので、生徒の URL からは開かせない）。
  //   ★守りの本体は iPad 側の「アクセスガイド」です。ここは画面側の一枚目にすぎません。
  classroom: true,
};

/**
 * ハッシュの文字列 → 行き先の名前。
 *
 * ★ハッシュが無い（＝これまでのブックマーク）ときは【生徒用】に着きます。
 *   生徒47人が毎日そのURLを開いているので、ここを変えないこと。
 *
 * 知らない行き先には null を返します（＝黙って生徒用に飛ばさない。
 * 打ち間違いや古いリンクに気づけなくなるため。画面側で断りを出します）。
 */
const PATH_TO_ROUTE: Record<string, RouteName> = {
  '': 'student',
  student: 'student',
  health: 'health',
  teacher: 'teacher',
  admin: 'admin',
  seats: 'seats',
  'seats/classroom': 'classroom',
};

export function parseRoute(hash: string): RouteName | null {
  let t = String(hash || '').trim();
  if (t.startsWith('#')) t = t.slice(1);
  // ハッシュの後ろに付いた ?… は行き先ではない（#/seats?x=1 でも座席表へ）
  const q = t.indexOf('?');
  if (q >= 0) t = t.slice(0, q);
  // 前後の / を落とす（'#/health/' も '#health' も同じ扱い）
  t = t.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  return PATH_TO_ROUTE[t] ?? null;
}

/**
 * その行き先が職員専用か。
 * ★知らない行き先（null）は false です。中身を描くのではなく、
 *   画面側が「そのページはありません」を出すためです（データは1件も出しません）。
 */
export function isStaffRoute(route: RouteName | null): boolean {
  if (route === null) return false;
  return STAFF_ONLY[route] === true;
}

/**
 * ★入っている人が「入れ替わった」か（＝表示中のページを生徒用に戻すべきか）。
 *   ── 2026-09-19 追加（台帳 A4-119／A4-120）
 *
 * ★なぜ切り出したか
 *   この判断を App.tsx の中に直接書いていたために、URL を直接開くと必ず
 *   生徒用（#/）へ飛ばされる不具合が、誰にも見えないまま本番で動いていました。
 *   画面の中にあると【ブラウザ抜きで試験できない】ので、ここへ出しています。
 *   ★App.tsx にこの判断を書き戻さないこと。
 *
 * @param prev ひとつ前に確かめた uid。
 *             ★undefined ＝ まだ一度も確かめていない（＝ページを開いた直後）
 *             null ＝ 誰も入っていないと確かめた
 * @param next いまの uid（null ＝ 誰も入っていない）
 *
 * ★肝は1つだけ。【最初に分かった1回は「入れ替わり」ではない】。
 *   ログインの状態は必ず「復元中（null）→ 復元できた（あり）」の2段階で届くので、
 *   これを入れ替わりと数えると、開くたびに生徒用へ飛ばされます。
 */
export function isPersonSwitched(
  prev: string | null | undefined,
  next: string | null,
): boolean {
  // ★ページを開いた直後に「誰が入っているか」が分かっただけ。人は変わっていない
  if (prev === undefined) return false;
  return prev !== next;
}
