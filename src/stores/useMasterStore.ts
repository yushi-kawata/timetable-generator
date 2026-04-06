import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimetableTemplate, StudentRecord } from '../types/master';
import { DEFAULT_TT } from '../types/master';

interface AppState {
  tt: TimetableTemplate;
  records: StudentRecord[];

  setTT: (tt: TimetableTemplate) => void;
  updateTTCell: (day: string, room: string, period: number, value: string) => void;
  saveTT: () => void;

  addRecord: (r: Omit<StudentRecord, 'id'>) => void;
  deleteRecord: (id: number) => void;
  clearRecords: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      tt: JSON.parse(JSON.stringify(DEFAULT_TT)),
      records: [],

      setTT: (tt) => set({ tt }),

      updateTTCell: (day, room, period, value) =>
        set((s) => {
          const tt = JSON.parse(JSON.stringify(s.tt));
          if (!tt[day]) tt[day] = {};
          if (!tt[day][room]) tt[day][room] = ['', '', '', '', '', ''];
          tt[day][room][period] = value;
          return { tt };
        }),

      saveTT: () => {
        // persist middlewareで自動保存済み
      },

      addRecord: (r) =>
        set((s) => ({ records: [{ ...r, id: Date.now() }, ...s.records] })),

      deleteRecord: (id) =>
        set((s) => ({ records: s.records.filter((r) => r.id !== id) })),

      clearRecords: () => set({ records: [] }),
    }),
    { name: 'timetable-system-v5' }
  )
);
