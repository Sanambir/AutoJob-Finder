import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { apiFetch } from '../api/client';
import { queryClient } from '../queryClient';

interface AuthState {
  user: User | null;
  setAuth: (user: User) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setAuth: (user) => set({ user }),
      logout: async () => {
        // Clear the query cache FIRST — this is the critical step that prevents
        // a previous user's cached jobs/stats/resumes from being shown to the
        // next user who logs in on the same browser session.
        queryClient.clear();
        try {
          await apiFetch('/auth/logout', { method: 'POST' });
        } catch {
          // Ignore errors — clear local state regardless
        }
        set({ user: null });
      },
    }),
    {
      name: 'workfinderx-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
