"use client";

/**
 * What this file does: Provides the shared React Query client for the app shell.
 * What calls it: `src/app/layout.tsx`.
 * What it calls: `@tanstack/react-query`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Creating a new `QueryClient` every render, which silently breaks caching and mutation refreshes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
