"use client";

/**
 * What this file does: Renders the primary operations dashboard with session context, pipeline
 * metrics, create-file flow, and the application list.
 * What calls it: `src/app/page.tsx`.
 * What it calls: React Query hooks plus dashboard/common components.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Turning the page into a monolith that owns auth, mutations, formatting, and table logic with no
 * intermediate abstractions.
 */
import Link from "next/link";

import { CreateApplicationForm } from "@/components/dashboard/create-application-form";
import { SessionSwitcher } from "@/components/common/session-switcher";
import { StatusPill } from "@/components/common/status-pill";
import { useApplicationsQuery } from "@/hooks/use-applications";
import { useSessionQuery } from "@/hooks/use-session";
import { formatCurrency, formatDateTime } from "@/lib/formatting";

export function DashboardClient() {
  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data?.session ?? null;
  const applicationsQuery = useApplicationsQuery(Boolean(session));
  const applications = applicationsQuery.data?.applications ?? [];

  const countsByStage = applications.reduce<Record<string, number>>((accumulator, application) => {
    accumulator[application.stage] = (accumulator[application.stage] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(253,230,138,0.42),_transparent_32%),linear-gradient(180deg,_#f7f5ef_0%,_#eef3ff_100%)]">
      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2.5rem] border border-white/60 bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-300/60">
            <p className="text-xs font-semibold uppercase tracking-[0.38em] text-amber-300">
              Loan Origination + Underwriting
            </p>
            <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight md:text-5xl">
              Stateful underwriting built for out-of-order external events.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
              Intake, verification, credit decisioning, conditions, approval, disbursement,
              and servicing hand-off stay in one reviewable workflow with explicit RBAC.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Applications</p>
                <p className="mt-2 text-3xl font-semibold">{applications.length}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Conditions</p>
                <p className="mt-2 text-3xl font-semibold">{countsByStage.CONDITIONS ?? 0}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ready to fund</p>
                <p className="mt-2 text-3xl font-semibold">{countsByStage.APPROVED ?? 0}</p>
              </div>
            </div>
          </div>

          {sessionQuery.data ? (
            <SessionSwitcher sessionResponse={sessionQuery.data} />
          ) : (
            <div className="rounded-3xl border border-white/60 bg-white/90 p-5">
              Loading session...
            </div>
          )}
        </section>

        {session ? (
          <>
            <section className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <CreateApplicationForm session={session} />

              <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Role posture
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-slate-950">
                  {session.fullName} is acting as {session.role}
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Borrowers can create and submit their own files. Loan officers manage intake
                  and verification. Underwriters own decisions and conditions. Operations funds and
                  hands off to servicing. Servicing only sees funded loans.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {Object.entries(countsByStage).map(([stage, count]) => (
                    <div
                      key={stage}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <StatusPill value={stage} />
                      <p className="mt-3 text-2xl font-semibold text-slate-950">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Pipeline
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-slate-950">
                    Scoped application list
                  </h2>
                </div>
                <p className="text-sm text-slate-500">
                  Every row here is already filtered through the centralized repository visibility
                  rule for the active session.
                </p>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    <tr>
                      <th className="pb-4">Application</th>
                      <th className="pb-4">Borrower</th>
                      <th className="pb-4">Amount</th>
                      <th className="pb-4">Stage</th>
                      <th className="pb-4">Decision</th>
                      <th className="pb-4">Assigned officer</th>
                      <th className="pb-4">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applications.map((application) => (
                      <tr key={application.publicId} className="align-top">
                        <td className="py-4">
                          <Link
                            className="font-semibold text-slate-950 underline-offset-4 hover:underline"
                            href={`/applications/${application.publicId}`}
                          >
                            {application.publicId}
                          </Link>
                          <p className="mt-2 max-w-xs text-slate-500">{application.purpose}</p>
                        </td>
                        <td className="py-4">
                          <p className="font-medium text-slate-900">
                            {application.primaryApplicant?.fullName ?? "Unassigned"}
                          </p>
                          <p className="text-slate-500">{application.primaryApplicant?.email}</p>
                        </td>
                        <td className="py-4 font-medium text-slate-900">
                          {formatCurrency(application.requestedAmount)}
                        </td>
                        <td className="py-4">
                          <StatusPill value={application.stage} />
                          <p className="mt-2 max-w-xs text-slate-500">{application.stageReason}</p>
                        </td>
                        <td className="py-4">
                          <StatusPill value={application.decisionOutcome} />
                        </td>
                        <td className="py-4 text-slate-600">
                          {application.assignedOfficer?.fullName ?? "Not assigned"}
                        </td>
                        <td className="py-4 text-slate-600">
                          {formatDateTime(application.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {applications.length === 0 ? (
                  <p className="py-8 text-sm text-slate-500">
                    No applications are visible for this session yet.
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <section className="mt-8 rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-10 text-center text-slate-600">
            Choose a demo user above to load the pipeline with the correct role-based permissions.
          </section>
        )}
      </main>
    </div>
  );
}
