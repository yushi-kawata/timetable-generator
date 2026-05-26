import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimetableTemplate, StudentRecord, Student, AttendanceRecord, Period2Selection } from '../types/master';
import { DEFAULT_TT } from '../types/master';

// GAS側は "course" カラム、フロント側は "classroom" フィールド
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStudentFromGas(s: any): Student {
  return {
    name: s.name || '',
    grade: s.grade || '',
    classroom: s.course === 'Growth' ? 'B教室' : (s.course || '学年教室'),
    days: s.days || { 月: false, 火: false, 水: false, 木: false, 金: false },
  };
}

function mapStudentToGas(s: Student) {
  return {
    name: s.name,
    grade: s.grade,
    course: s.classroom === 'B教室' ? 'Growth' : '通常',
    days: s.days,
  };
}

// GAS WebApp URL
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwW8j8jnGDBD8PKO_EEfCOFikdhkoSiFcGlRVi0hSU99fQ2xC0D2C_MLCwqIQmIUc7R/exec';
const GAS_URL = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;

// QR GAS URL
const QR_GAS_URL = 'https://script.google.com/macros/s/AKfycbxVpj2Uyi_20_eO_JbTM0fVcGK0znTzk7Odbuf6xz0Gs_5V6DYS1nU30xooIVdiKsADpQ/exec';

async function gasGet(action: string, params: Record<string, string> = {}) {
  if (!GAS_URL) return null;
  try {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${GAS_URL}?${qs}`, { redirect: 'follow' });
    return res.json();
  } catch { return null; }
}

async function gasPost(body: unknown) {
  if (!GAS_URL) return;
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    });
  } catch {}
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

interface AppState {
  tt: TimetableTemplate;
  records: StudentRecord[];
  students: Student[];
  attendance: AttendanceRecord[];
  period2: Period2Selection[];
  qrData: QrData | null;
  loading: boolean;
  gasUrl: string;

  fetchAll: () => Promise<void>;
  fetchStudents: () => Promise<void>;
  fetchAttendance: (date: string) => Promise<void>;
  fetchPeriod2: (week: string) => Promise<void>;
  fetchQrData: () => Promise<void>;
  setGasUrl: (url: string) => void;

  setTT: (tt: TimetableTemplate) => void;
  updateTTCell: (day: string, room: string, period: number, value: string) => void;
  saveTT: () => Promise<void>;

  saveStudents: (students: Student[]) => Promise<void>;
  checkIn: (name: string, grade: string, date: string, time: string) => Promise<void>;
  checkOut: (name: string, date: string, time: string) => Promise<void>;
  savePeriod2: (week: string, name: string, selections: Partial<Record<string, string>>) => Promise<void>;

  // レガシー互換
  addRecord: (r: Omit<StudentRecord, 'id'>) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  clearRecords: () => Promise<void>;
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
      gasUrl: GAS_URL,

      setGasUrl: (url: string) => {
        localStorage.setItem('gas_url', url);
        set({ gasUrl: url });
        window.location.reload();
      },

      fetchAll: async () => {
        const url = localStorage.getItem('gas_url');
        if (!url) { set({ loading: false }); return; }
        set({ loading: true });
        try {
          const [recs, ttData, studentsData] = await Promise.all([
            gasGet('getRecs'),
            gasGet('getTT'),
            gasGet('getStudents'),
          ]);
          const rawRecs: StudentRecord[] = Array.isArray(recs) ? recs : [];
          const seen = new Map<string, StudentRecord>();
          for (const r of rawRecs) {
            const key = `${r.name}__${r.week}`;
            const existing = seen.get(key);
            if (!existing || r.id > existing.id) {
              seen.set(key, r);
            }
          }
          set({
            records: [...seen.values()].sort((a, b) => b.id - a.id),
            tt: ttData && typeof ttData === 'object' && ttData['月'] ? ttData : get().tt,
            students: Array.isArray(studentsData) ? (() => {
              const mapped = studentsData.map(mapStudentFromGas).filter((s: Student) => s.name.trim());
              const seen = new Map<string, Student>();
              for (const s of mapped) seen.set(s.name, s);
              return [...seen.values()];
            })() : get().students,
            loading: false,
          });
        } catch {
          set({ loading: false });
        }
      },

      fetchStudents: async () => {
        const data = await gasGet('getStudents');
        if (Array.isArray(data)) {
          // 空行を除外 & 同名重複を除外（最後の登録を優先）
          const mapped = data.map(mapStudentFromGas).filter(s => s.name.trim());
          const seen = new Map<string, typeof mapped[0]>();
          for (const s of mapped) seen.set(s.name, s);
          set({ students: [...seen.values()] });
        }
      },

      fetchAttendance: async (date: string) => {
        const data = await gasGet('getAttendance', { date });
        if (Array.isArray(data)) {
          set({ attendance: data });
        }
      },

      fetchPeriod2: async (week: string) => {
        const data = await gasGet('getPeriod2', { week });
        if (Array.isArray(data)) {
          set({ period2: data });
        }
      },

      fetchQrData: async () => {
        try {
          const res = await fetch(`${QR_GAS_URL}?action=api`, { redirect: 'follow' });
          const data = await res.json();
          if (data && data.tokou_qr) {
            set({ qrData: data });
          }
        } catch {}
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
        await gasPost({ action: 'saveTT', data: tt });
      },

      saveStudents: async (students: Student[]) => {
        set({ students });
        await gasPost({ action: 'saveStudents', data: students.map(mapStudentToGas) });
      },

      checkIn: async (name, grade, date, time) => {
        // ローカル即時反映
        set((s) => {
          const existing = s.attendance.find(a => a.date === date && a.name === name);
          if (existing) return s;
          return {
            attendance: [...s.attendance, { date, name, grade, checkinTime: time, checkoutTime: '' }],
          };
        });
        await gasPost({ action: 'checkIn', name, grade, date, time });
      },

      checkOut: async (name, date, time) => {
        set((s) => ({
          attendance: s.attendance.map(a =>
            a.date === date && a.name === name ? { ...a, checkoutTime: time } : a
          ),
        }));
        await gasPost({ action: 'checkOut', name, date, time });
      },

      savePeriod2: async (week, name, selections) => {
        set((s) => ({
          period2: [
            ...s.period2.filter(p => !(p.week === week && p.name === name)),
            { week, name, selections },
          ],
        }));
        await gasPost({ action: 'savePeriod2', week, name, selections });
      },

      // レガシー互換
      addRecord: async (r) => {
        const record = { ...r, id: Date.now() };
        const old = get().records.filter(
          (x) => x.name === record.name && x.week === record.week
        );
        for (const o of old) {
          await gasPost({ action: 'deleteRec', id: o.id });
        }
        set((s) => ({
          records: [record, ...s.records.filter(
            (x) => !(x.name === record.name && x.week === record.week)
          )],
        }));
        await gasPost({ action: 'saveRec', data: record });
      },

      deleteRecord: async (id) => {
        set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
        await gasPost({ action: 'deleteRec', id });
      },

      clearRecords: async () => {
        set({ records: [] });
        await gasPost({ action: 'clearRecs' });
      },
    }),
    {
      name: 'timetable-system-v5',
      partialize: (s) => ({ tt: s.tt, records: s.records, students: s.students }),
    }
  )
);
