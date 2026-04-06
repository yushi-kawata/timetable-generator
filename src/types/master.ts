export type DayOfWeek = '月' | '火' | '水' | '木' | '金';

export const DAYS: DayOfWeek[] = ['月', '火', '水', '木', '金'];
export const DAY_ICONS: Record<DayOfWeek, string> = { 月: '🟣', 火: '🟠', 水: '🟢', 木: '🔵', 金: '🌸' };
export const ROOMS = ['A教室（2年）', 'C教室（3年）', 'D教室（1年）', 'B教室'];
export const PERIODS = [
  { label: 'SHR', time: '9:20〜9:30', isSHR: true },
  { label: '1限', time: '9:30〜10:20', isSHR: false },
  { label: '2限', time: '10:30〜11:20', isSHR: false },
  { label: '3限', time: '11:30〜12:20', isSHR: false },
  { label: '4限', time: '13:00〜13:50', isSHR: false },
  { label: '5限', time: '14:00〜14:50', isSHR: false },
];

/** 時間割テンプレート: TT[曜日][教室][時限index] = 科目名 */
export type TimetableTemplate = Record<string, Record<string, string[]>>;

/** 生徒の申告データ */
export type StudentRecord = {
  id: number;
  week: string;        // "2026-04-06" (月曜の日付)
  name: string;
  grade: string;
  days: DayOfWeek[];
  sel: Record<string, Record<number, string>>; // sel[曜日][時限index] = 教室名
  timestamp: string;
};

export const DEFAULT_TT: TimetableTemplate = {
  月: {
    'A教室（2年）': ['', '個別最適（LHR）', '読書', '個別最適', '各教科探究', 'スキルアップ'],
    'C教室（3年）': ['', '個別最適（LHR）', 'レポート', '個別最適', 'コミュニケーション', 'コミュニケーション'],
    'D教室（1年）': ['', '個別最適（LHR）', '数学（対面）', '個別最適', '', ''],
    'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
  },
  火: {
    'A教室（2年）': ['', '個別最適（LHR）', 'ペン字', '個別最適', 'PCスキル', 'フィールドワーク'],
    'C教室（3年）': ['', '個別最適（LHR）', 'レポート', '個別最適', 'ミッション', '思考力'],
    'D教室（1年）': ['', '個別最適（LHR）', '英語（対面）', '個別最適', '', ''],
    'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
  },
  水: {
    'A教室（2年）': ['', '個別最適（LHR）', '読書', '個別最適', 'スキルアップ', 'マナー・金融'],
    'C教室（3年）': ['', '個別最適（LHR）', 'レポート', 'スポーツ準備', '', ''],
    'D教室（1年）': ['', '個別最適（LHR）', '国語（対面）', '', 'スポーツ', 'スポーツ'],
    'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
  },
  木: {
    'A教室（2年）': ['', '個別最適（LHR）', '読書', '個別最適', 'PBL', 'PCスキル'],
    'C教室（3年）': ['', '個別最適（LHR）', 'レポート', '個別最適', '部活・同好会', '部活・同好会'],
    'D教室（1年）': ['', '個別最適（LHR）', '家／体（対面）', '個別最適', '部活・同好会', '部活・同好会'],
    'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
  },
  金: {
    'A教室（2年）': ['', '個別最適（LHR）', 'ペン字', '個別最適', '芸術', '芸術'],
    'C教室（3年）': ['', '個別最適（LHR）', 'レポート', '個別最適', '企画', 'ミッション'],
    'D教室（1年）': ['', '個別最適（LHR）', '理／社／情（対面）', '個別最適', '', ''],
    'B教室': ['', 'Growth', 'Growth', 'Growth', 'Growth / 受験勉強', 'Growth / 受験勉強'],
  },
};
