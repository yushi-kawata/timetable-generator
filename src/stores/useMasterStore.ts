import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimetableTemplate, StudentRecord } from '../types/master';
import { DEFAULT_TT } from '../types/master';

// GAS WebApp URL
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbwW8j8jnGDBD8PKO_EEfCOFikdhkoSiFcGlRVi0hSU99fQ2xC0D2C_MLCwqIQmIUc7R/exec';
const GAS_URL = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;

async function gasGet(action: string) {
  if (!GAS_URL) return null;
  try {
    const res = await fetch(`${GAS_URL}?action=${action}`);
    return res.json();
  } catch { return null; }
}

async function gasPost(body: unknown) {
  if (!GAS_URL) return;
  try {
    await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(body) });
  } catch {}
}

interface AppState {
  tt: TimetableTemplate;
  records: StudentRecord[];
  loading: boolean;
  gasUrl: string;

  fetchAll: () => Promise<void>;
  setGasUrl: (url: string) => void;

  setTT: (tt: TimetableTemplate) => void;
  updateTTCell: (day: string, room: string, period: number, value: string) => void;
  saveTT: () => Promise<void>;

  addRecord: (r: Omit<StudentRecord, 'id'>) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  clearRecords: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tt: JSON.parse(JSON.stringify(DEFAULT_TT)),
      records: [],
      loading: false,
      gasUrl: GAS_URL,

      setGasUrl: (url: string) => {
        localStorage.setItem('gas_url', url);
        set({ gasUrl: url });
        // URLが変わったらリロードして反映
        window.location.reload();
      },

      fetchAll: async () => {
        const url = localStorage.getItem('gas_url');
        if (!url) { set({ loading: false }); return; }
        set({ loading: true });
        try {
          const [recs, ttData] = await Promise.all([
            gasGet('getRecs'),
            gasGet('getTT'),
          ]);
          set({
            records: Array.isArray(recs) ? recs : [],
            tt: ttData && typeof ttData === 'object' && ttData['月'] ? ttData : get().tt,
            loading: false,
          });
        } catch {
          set({ loading: false });
        }
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

      addRecord: async (r) => {
        const record = { ...r, id: Date.now() };
        set((s) => ({ records: [record, ...s.records] }));
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
      partialize: (s) => ({ tt: s.tt, records: s.records }),
    }
  )
);
