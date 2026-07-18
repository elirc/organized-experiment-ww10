"use client";

/**
 * What this file does: Renders the full application workspace, including lifecycle state,
 * verification controls, decisioning, condition management, and audit history.
 * What calls it: `src/app/applications/[applicationId]/page.tsx`.
 * What it calls: Session/detail hooks and shared UI components.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Flattening all actions into one generic "update application" form and losing the meaning of
 * the distinct workflow commands.
 */
import Link from "next/link";
import { useState } from "react";

import { SessionSwitcher } from "@/components/common/session-switcher";
import { StatusPill } from "@/components/common/status-pill";
import {
  useApplicationDetailQuery,
  useCreateConditionMutation,
  useDecisionMutation,
  useDisburseMutation,
  useExternalEventMutation,
  useRequestVerificationMutation,
  useResolveConditionMutation,
  useServicingHandOffMutation,
  useSubmitApplicationMutation,
} from "@/hooks/use-application-detail";
import { useSessionQuery } from "@/hooks/use-session";
import { formatCurrency, formatDateTime } from "@/lib/formatting";

const eventTypeMap = {
  CREDIT_PULL: "CREDIT_RESULT",
  DOCUMENT_CHECK: "DOCUMENT_RESULT",
  EMPLOYMENT_CHECK: "EMPLOYMENT_RESULT",
} as const;

export function ApplicationDetailClient({ applicationId }: { applicationId: string }) {
  const sessionQuery = useSessionQuery();
  const detailQuery = useApplicationDetailQuery(applicationId);
  const submitMutation = useSubmitApplicationMutation(applicationId);
  const requestVerificationMutation = useRequestVerificationMutation(applicationId);
  const externalEventMutation = useExternalEventMutation(applicationId);
  const decisionMutation = useDecisionMutation(applicationId);
  const createConditionMutation = useCreateConditionMutation(applicationId);
  const resolveConditionMutation = useResolveConditionMutation(applicationId);
  const disburseMutation = useDisburseMutation(applicationId);
  const handoffMutation = useServicingHandOffMutation(applicationId);

  const session = sessionQuery.data?.session ?? null;
  const application = detailQuery.data?.application;

  const [verificationType, setVerificationType] = useState<
    "CREDIT_PULL" | "DOCUMENT_CHECK" | "EMPLOYMENT_CHECK"
  >("CREDIT_PULL");
  const [providerReference, setProviderReference] = useState("SIM-001");
  const [externalStatus, setExternalStatus] = useState<"PASSED" | "FAILED">("PASSED");
  const [externalSummary, setExternalSummary] = useState(
    "Provider result arrived and was accepted into workflow reconciliation.",
  );
  const [externalSequence, setExternalSequence] = useState(1);
  const [decisionOutcome, setDecisionOutcome] = useState<"APPROVED" | "REFER" | "DECLINED">(
    "APPROVED",
  );
  const [decisionReason, setDecisionReason] = useState(
    "File meets policy with acceptable collateral, income, and credit support.",
  );
  const [conditionTitle, setConditionTitle] = useState("Collect updated bank statements");
  const [conditionDescription, setConditionDescription] = useState(
    "Need the two most recent statements before funds can be scheduled.",
  );

  if (!application) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_transparent_32%),linear-gradient(180deg,_#f7f5ef_0%,_#eef3ff_100%)] px-6 py-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/60 bg-white/80 p-8">
          Loading application...
        </div>
      </div>
    );
  }

  const canSubmit =
    application.stage === "INTAKE" &&
    (session?.role === "BORROWER" || session?.role === "LOAN_OFFICER");
  const canManageVerifications =
    session?.role === "LOAN_OFFICER" || session?.role === "UNDERWRITER";
  const canDecision = session?.role === "UNDERWRITER";
  const canManageConditions =
    session?.role === "LOAN_OFFICER" || session?.role === "UNDERWRITER";
  const canDisburse = session?.role === "OPERATIONS_MANAGER";
  const canHandoff = session?.role === "OPERATIONS_MANAGER";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.45),_transparent_32%),linear-gradient(180deg,_#f7f5ef_0%,_#eef3ff_100%)]">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/">
                {"<-"} Back to pipeline
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Application Workspace
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-slate-950">
                {application.publicId}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                This page exposes the same workflow commands the backend protects: intake submit,
                verification management, external event ingestion, decisioning, conditions,
                disbursement, and servicing hand-off.
              </p>
            </div>

            {sessionQuery.data ? <SessionSwitcher sessionResponse={sessionQuery.data} /> : null}
          </div>

          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2.3rem] border border-slate-200 bg-white/95 p-8 shadow-lg shadow-slate-200/60">
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill value={application.stage} />
                <StatusPill value={application.decisionOutcome} />
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-slate-950">
                {formatCurrency(application.requestedAmount)} {application.productType}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{application.purpose}</p>
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
                {application.stageReason ?? "No workflow reason recorded."}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Created" value={formatDateTime(application.createdAt)} />
                <MetricCard label="Approved" value={formatDateTime(application.approvedAt)} />
                <MetricCard label="Disbursed" value={formatDateTime(application.disbursedAt)} />
                <MetricCard
                  label="Servicing hand-off"
                  value={formatDateTime(application.servicingHandedOffAt)}
                />
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <InfoPanel
                  title="Parties"
                  items={application.parties.map((party) => ({
                    key: party.id,
                    title: `${party.firstName} ${party.lastName}`,
                    subtitle: `${party.role} | ${party.email}`,
                    aside: formatCurrency(party.annualIncome),
                  }))}
                />
                <InfoPanel
                  title="Ownership"
                  items={[
                    {
                      key: "created-by",
                      title: application.createdBy.fullName,
                      subtitle: `Created by ${application.createdBy.role}`,
                      aside: application.assignedOfficer?.fullName ?? "No officer assigned",
                    },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-4">
              <ActionPanel
                title="Submit Intake"
                description="Moves the file from intake into verification."
              >
                <button
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!canSubmit || submitMutation.isPending}
                  onClick={() => submitMutation.mutate({ confirmReady: true })}
                  type="button"
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit Package"}
                </button>
              </ActionPanel>

              <ActionPanel
                title="Verification Controls"
                description="Internal request creation and external async result ingestion are separate operations."
              >
                <div className="grid gap-3">
                  <select
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={verificationType}
                    onChange={(event) =>
                      setVerificationType(
                        event.target.value as "CREDIT_PULL" | "DOCUMENT_CHECK" | "EMPLOYMENT_CHECK",
                      )
                    }
                  >
                    <option value="CREDIT_PULL">Credit pull</option>
                    <option value="DOCUMENT_CHECK">Document check</option>
                    <option value="EMPLOYMENT_CHECK">Employment check</option>
                  </select>
                  <input
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={providerReference}
                    onChange={(event) => setProviderReference(event.target.value)}
                    placeholder="Provider reference"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={!canManageVerifications || requestVerificationMutation.isPending}
                      onClick={() =>
                        requestVerificationMutation.mutate({
                          type: verificationType,
                          providerReference,
                        })
                      }
                      type="button"
                    >
                      Request verification
                    </button>
                  </div>

                  <select
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={externalStatus}
                    onChange={(event) =>
                      setExternalStatus(event.target.value as "PASSED" | "FAILED")
                    }
                  >
                    <option value="PASSED">Pass result</option>
                    <option value="FAILED">Fail result</option>
                  </select>
                  <input
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    type="number"
                    value={externalSequence}
                    onChange={(event) => setExternalSequence(Number(event.target.value))}
                    placeholder="Provider sequence"
                  />
                  <textarea
                    className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={externalSummary}
                    onChange={(event) => setExternalSummary(event.target.value)}
                  />
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
                    disabled={!canManageVerifications || externalEventMutation.isPending}
                    onClick={() =>
                      externalEventMutation.mutate({
                        type: verificationType,
                        eventType: eventTypeMap[verificationType],
                        status: externalStatus,
                        providerSequence: externalSequence,
                        providerReference,
                        summary: externalSummary,
                        occurredAt: new Date().toISOString(),
                        payload: {
                          source: "demo-simulator",
                          applicationId,
                        },
                      })
                    }
                    type="button"
                  >
                    Simulate async result
                  </button>
                </div>
              </ActionPanel>

              <ActionPanel
                title="Decision + Conditions"
                description="Underwriters decide. Underwriters and officers can create and resolve conditions."
              >
                <div className="grid gap-3">
                  <select
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={decisionOutcome}
                    onChange={(event) =>
                      setDecisionOutcome(
                        event.target.value as "APPROVED" | "REFER" | "DECLINED",
                      )
                    }
                  >
                    <option value="APPROVED">Approve</option>
                    <option value="REFER">Refer</option>
                    <option value="DECLINED">Decline</option>
                  </select>
                  <textarea
                    className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                  />
                  <button
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={!canDecision || decisionMutation.isPending}
                    onClick={() =>
                      decisionMutation.mutate({
                        outcome: decisionOutcome,
                        reason: decisionReason,
                      })
                    }
                    type="button"
                  >
                    Record decision
                  </button>

                  <input
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={conditionTitle}
                    onChange={(event) => setConditionTitle(event.target.value)}
                    placeholder="Condition title"
                  />
                  <textarea
                    className="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    value={conditionDescription}
                    onChange={(event) => setConditionDescription(event.target.value)}
                    placeholder="Condition description"
                  />
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
                    disabled={!canManageConditions || createConditionMutation.isPending}
                    onClick={() =>
                      createConditionMutation.mutate({
                        title: conditionTitle,
                        description: conditionDescription,
                      })
                    }
                    type="button"
                  >
                    Add condition
                  </button>
                </div>
              </ActionPanel>

              <ActionPanel
                title="Funding + Servicing"
                description="Operations holds the disbursement and servicing transfer boundary."
              >
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={!canDisburse || disburseMutation.isPending}
                    onClick={() => disburseMutation.mutate({})}
                    type="button"
                  >
                    Disburse
                  </button>
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
                    disabled={!canHandoff || handoffMutation.isPending}
                    onClick={() => handoffMutation.mutate({})}
                    type="button"
                  >
                    Hand off to servicing
                  </button>
                </div>
              </ActionPanel>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Panel title="Verifications">
              <div className="grid gap-4">
                {application.verifications.map((verification) => (
                  <div key={verification.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {verification.type.replaceAll("_", " ")}
                        </p>
                        <p className="text-sm text-slate-500">
                          Ref {verification.providerReference ?? "unassigned"} | seq {verification.providerSequence}
                        </p>
                      </div>
                      <StatusPill value={verification.status} />
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{verification.summary}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Conditions">
              <div className="grid gap-4">
                {application.conditions.map((condition) => (
                  <div key={condition.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{condition.title}</p>
                        <p className="text-sm text-slate-500">{condition.description}</p>
                      </div>
                      <StatusPill value={condition.status} />
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                      Created by {condition.createdBy.fullName}
                    </p>
                    {condition.status === "OPEN" && canManageConditions ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(["SATISFIED", "WAIVED", "FAILED"] as const).map((status) => (
                          <button
                            key={status}
                            className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
                            disabled={resolveConditionMutation.isPending}
                            onClick={() =>
                              resolveConditionMutation.mutate({
                                conditionId: condition.id,
                                body: {
                                  status,
                                  resolutionNote: `${session?.fullName ?? "Team member"} marked ${condition.title} as ${status}.`,
                                },
                              })
                            }
                            type="button"
                          >
                            Mark {status.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <Panel title="Transitions">
              <TimelineList
                items={application.transitions.map((transition) => ({
                  id: transition.id,
                  title: `${transition.fromStage} -> ${transition.toStage}`,
                  subtitle: transition.reason,
                  meta: `${transition.triggeredBySystem ? "System" : transition.triggeredBy?.fullName ?? "User"} | ${formatDateTime(transition.createdAt)}`,
                }))}
              />
            </Panel>

            <Panel title="External Events">
              <TimelineList
                items={application.externalEvents.map((event) => ({
                  id: event.id,
                  title: `${event.eventType} | ${event.providerStatus}`,
                  subtitle: event.summary ?? "No summary provided.",
                  meta: `${event.receivedOutOfOrder ? "Out of order" : "In order"} | seq ${event.providerSequence}`,
                }))}
              />
            </Panel>

            <Panel title="Audit Log">
              <TimelineList
                items={application.auditLogs.map((log) => ({
                  id: log.id,
                  title: log.action,
                  subtitle: log.summary,
                  meta: `${log.actor?.fullName ?? "System"} | ${formatDateTime(log.createdAt)}`,
                }))}
              />
            </Panel>
          </section>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ActionPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-lg shadow-slate-200/40">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60">
      <h3 className="font-[family-name:var(--font-display)] text-2xl text-slate-950">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function InfoPanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; title: string; subtitle: string; aside: string }>;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-500">{item.subtitle}</p>
              </div>
              <p className="text-sm font-medium text-slate-700">{item.aside}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineList({
  items,
}: {
  items: Array<{ id: string; title: string; subtitle: string; meta: string }>;
}) {
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
          <p className="font-semibold text-slate-900">{item.title}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">{item.subtitle}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">{item.meta}</p>
        </div>
      ))}
    </div>
  );
}
