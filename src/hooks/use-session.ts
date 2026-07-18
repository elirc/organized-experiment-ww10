"use client";

/**
 * What this file does: Loads the current session and exposes the demo-user switch mutation.
 * What calls it: `src/components/dashboard/dashboard-client.tsx` and
 * `src/components/common/session-switcher.tsx`.
 * What it calls: React Query plus `src/lib/api/fetcher.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Keeping auth state only in local component state and forgetting to invalidate dependent queries.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/fetcher";

export type SessionResponse = {
  session: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
  demoUsers: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
  }>;
};

export function useSessionQuery() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<SessionResponse>("/api/session"),
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ session: SessionResponse["session"] }>("/api/session/login", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
      ]);
    },
  });
}
