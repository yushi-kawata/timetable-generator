// ============================================================================
// 座席表の【見本データ】── 台帳 A4-107
// ============================================================================
// ★裏側（GAS）の窓口がまだ本番に入っていないあいだ、画面を実際に描いて確かめる
//   ための見本です。本番の画面には出しません
//   （呼び出し側が import.meta.env.DEV でしか読み込まず、ビルドでは丸ごと消えます）。
//
// ★氏名は全員「見本」姓にしてあります。実在の姓を混ぜないこと。
//   このリポジトリは公開されています。見本に実在の人の名前を置くと、
//   外に出た瞬間に誤情報になります。
// ★見本にも、学年・コース・メール・パスワードの類は一切書かないこと
//   （窓口が返さない約束のものを、こちらが先に書いてしまわないため）。
//
// ★数は実物に合わせてあります＝2年通学生26名／教室は4行×7列＝28席
//   （2026-09-18 社長確定）。26名が座って【席が2つ空く】状態を見るためのものです。
const F = false;
const T = true;

/** 月〜金の並びで書く */
function days(mon: boolean, tue: boolean, wed: boolean, thu: boolean, fri: boolean) {
  return { 月: mon, 火: tue, 水: wed, 木: thu, 金: fri };
}

const STUDENTS = [
  { student_id: '90000001', name: '見本 あおい', days: days(T, F, T, F, T) },
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

/** 前（教卓）から1行目・左から1番。26名分＝4行目の6番と7番が空く */
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

/**
 * ★これは【窓口が返す形そのまま（契約 v4）】の見本です（normalizeSeatChart に通して使う）。
 *   画面が持つ形（SeatChart）ではないので、型注釈を付けないこと。
 *
 * v4 の形:
 *   grid        … 教室の広さ。★これが無いと空席が描けない
 *   seats       … 曜日をキーにした入れ物（★配列ではない）
 *   constraints … 1本の配列。type は英語
 *                 fixed / banned / apart / near / rightside
 *
 * ★決まりごとの中身は、実データと同じ【構造】に合わせてあります
 *   （固定席2件・禁止席0件・引き離し6組＝1名が3組の三角あり・
 *     近づけたい3組＝1名が3組すべてに登場するハブ・右寄せ数名）。
 *   ★実在の生徒の氏名・学籍番号は1つも使っていません。
 */
export const DEMO_SEAT_CHART = {
  students: STUDENTS,
  grid: { rows: 4, cols: 7 },
  seats: {
    月: SEATS,
    火: SEATS,
    水: SEATS,
    木: SEATS,
    金: SEATS,
  },
  constraints: [
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
  ],
  asof: '2026-09-18 09:40:12',
};
