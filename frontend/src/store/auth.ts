import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { apiFetch } from '../api/client';

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
