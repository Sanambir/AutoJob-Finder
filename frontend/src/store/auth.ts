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
        queryClient.clear();
        try {
          await apiFetch('/auth/logout', { method: 'POST' });
        } catch {
          // Ignore errors — clear local state regardless
        }
        set({ user: null }); // persist null to localStorage before reload
        // Full page reload: re-initialises all JS modules (queryClient, Zustand)
        // so zero in-memory state from the previous user survives into the next session.
        window.location.replace('/login');
      },
    }),
    {
      name: 'workfinderx-auth',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
