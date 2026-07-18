"use client";

/**
 * What this file does: Provides list and create-application hooks backed by React Query.
 * What calls it: `src/components/dashboard/dashboard-client.tsx`.
 * What it calls: `src/lib/api/fetcher.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Mutating server state without invalidating the list query, which leaves the dashboard stale.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/fetcher";

export type ApplicationSummary = {
  publicId: string;
  productType: string;
  purpose: string;
  requestedAmount: string;
  stage: string;
  decisionOutcome: string;
  stageReason: string | null;
  updatedAt: string;
  assignedOfficer: {
    fullName: string;
  } | null;
  primaryApplicant: {
    fullName: string;
    email: string;
  } | null;
};

type ApplicationsResponse = {
  applications: ApplicationSummary[];
};

export type CreateApplicationInput = {
  productType: "CONVENTIONAL" | "FHA" | "VA" | "HELOC";
  purpose: string;
  requestedAmount: number;
  primaryApplicant: {
    firstName: string;
    lastName: string;
    email: string;
    annualIncome: number;
    userId?: string;
  };
  coApplicant?: {
    firstName: string;
    lastName: string;
    email: string;
    annualIncome: number;
    userId?: string;
  };
};

export function useApplicationsQuery(enabled = true) {
  return useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<ApplicationsResponse>("/api/applications"),
    enabled,
  });
}

export function useCreateApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApplicationInput) =>
      apiFetch<{ application: unknown }>("/api/applications", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
