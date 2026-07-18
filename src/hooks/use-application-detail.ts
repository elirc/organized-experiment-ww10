"use client";

/**
 * What this file does: Loads one application detail record and exposes the workflow mutations.
 * What calls it: `src/components/applications/application-detail-client.tsx`.
 * What it calls: `src/lib/api/fetcher.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Hand-rolling fetch calls in the component for every button and ending up with duplicated cache
 * refresh logic and inconsistent error handling.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/fetcher";

export type ApplicationDetail = {
  publicId: string;
  stage: string;
  decisionOutcome: string;
  stageReason: string | null;
  productType: string;
  purpose: string;
  requestedAmount: string;
  stateVersion: number;
  intakeCompletedAt: string | null;
  approvedAt: string | null;
  deniedAt: string | null;
  disbursedAt: string | null;
  servicingHandedOffAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    fullName: string;
    role: string;
  };
  assignedOfficer: {
    fullName: string;
  } | null;
  parties: Array<{
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    email: string;
    annualIncome: string;
    userId: string | null;
  }>;
  verifications: Array<{
    id: string;
    type: string;
    status: string;
    providerReference: string | null;
    providerSequence: number;
    summary: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  conditions: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    dueAt: string | null;
    resolvedAt: string | null;
    createdBy: { fullName: string };
    resolvedBy: { fullName: string } | null;
  }>;
  transitions: Array<{
    id: string;
    fromStage: string;
    toStage: string;
    reason: string;
    triggeredBySystem: boolean;
    triggeredBy: { fullName: string } | null;
    createdAt: string;
  }>;
  externalEvents: Array<{
    id: string;
    eventType: string;
    providerSequence: number;
    providerStatus: string;
    summary: string | null;
    appliedToWorkflow: boolean;
    receivedOutOfOrder: boolean;
    occurredAt: string;
    receivedAt: string;
    payload: Record<string, unknown>;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    actor: { fullName: string } | null;
    createdAt: string;
  }>;
};

type ApplicationDetailResponse = {
  application: ApplicationDetail;
};

function useWorkflowMutation(
  applicationId: string,
  path: string,
  method = "POST",
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: unknown) =>
      apiFetch<ApplicationDetailResponse>(path, {
        method,
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["application", applicationId] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
      ]);
    },
  });
}

export function useApplicationDetailQuery(applicationId: string) {
  return useQuery({
    queryKey: ["application", applicationId],
    queryFn: () =>
      apiFetch<ApplicationDetailResponse>(`/api/applications/${applicationId}`),
  });
}

export function useSubmitApplicationMutation(applicationId: string) {
  return useWorkflowMutation(
    applicationId,
    `/api/applications/${applicationId}/submit`,
  );
}

export function useRequestVerificationMutation(applicationId: string) {
  return useWorkflowMutation(
    applicationId,
    `/api/applications/${applicationId}/verifications`,
  );
}

export function useExternalEventMutation(applicationId: string) {
  return useWorkflowMutation(
    applicationId,
    `/api/applications/${applicationId}/external-events`,
  );
}

export function useDecisionMutation(applicationId: string) {
  return useWorkflowMutation(applicationId, `/api/applications/${applicationId}/decision`);
}

export function useCreateConditionMutation(applicationId: string) {
  return useWorkflowMutation(applicationId, `/api/applications/${applicationId}/conditions`);
}

export function useResolveConditionMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conditionId,
      body,
    }: {
      conditionId: string;
      body: unknown;
    }) =>
      apiFetch<ApplicationDetailResponse>(`/api/conditions/${conditionId}/resolve`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["application", applicationId] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["condition", variables.conditionId] }),
      ]);
    },
  });
}

export function useDisburseMutation(applicationId: string) {
  return useWorkflowMutation(applicationId, `/api/applications/${applicationId}/disburse`);
}

export function useServicingHandOffMutation(applicationId: string) {
  return useWorkflowMutation(
    applicationId,
    `/api/applications/${applicationId}/servicing-hand-off`,
  );
}
