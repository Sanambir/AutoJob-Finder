import { QueryClient } from '@tanstack/react-query'

/**
 * Singleton QueryClient — exported so the auth store can call
 * queryClient.clear() on logout without needing a React hook.
 * Imported by main.tsx for the QueryClientProvider.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,   // always refetch on mount — prevents stale data from one user bleeding into another
      retry: 1,
    },
  },
})
