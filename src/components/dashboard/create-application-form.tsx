"use client";

/**
 * What this file does: Collects a new borrower application and posts it through the create API.
 * What calls it: `src/components/dashboard/dashboard-client.tsx`.
 * What it calls: `src/hooks/use-applications.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Mixing create-form state into the dashboard table component until neither concern is easy to read.
 */
import { useState } from "react";

import {
  useCreateApplicationMutation,
  type CreateApplicationInput,
} from "@/hooks/use-applications";
import type { SessionResponse } from "@/hooks/use-session";

export function CreateApplicationForm({
  session,
}: {
  session: SessionResponse["session"];
}) {
  const createMutation = useCreateApplicationMutation();
  const [includeCoApplicant, setIncludeCoApplicant] = useState(false);
  const [form, setForm] = useState<CreateApplicationInput>({
    productType: "CONVENTIONAL",
    purpose: "Purchase primary residence in Seattle metro area",
    requestedAmount: 425000,
    primaryApplicant: {
      firstName: session?.fullName.split(" ")[0] ?? "Priya",
      lastName: session?.fullName.split(" ").slice(1).join(" ") || "Borrower",
      email: session?.email ?? "borrower@example.com",
      annualIncome: 155000,
      userId: session?.role === "BORROWER" ? session.id : undefined,
    },
  });

  const coApplicant = form.coApplicant;

  return (
    <form
      className="rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60"
      onSubmit={(event) => {
        event.preventDefault();
        createMutation.mutate({
          ...form,
          coApplicant: includeCoApplicant ? coApplicant : undefined,
        });
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            New File
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-slate-950">
            Start a loan application
          </h2>
        </div>
        <button
          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={createMutation.isPending}
          type="submit"
        >
          {createMutation.isPending ? "Creating..." : "Create Application"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Product
          <select
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            value={form.productType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                productType: event.target.value as CreateApplicationInput["productType"],
              }))
            }
          >
            <option value="CONVENTIONAL">Conventional</option>
            <option value="FHA">FHA</option>
            <option value="VA">VA</option>
            <option value="HELOC">HELOC</option>
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Requested amount
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            type="number"
            value={form.requestedAmount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                requestedAmount: Number(event.target.value),
              }))
            }
          />
        </label>

        <label className="md:col-span-2 text-sm text-slate-600">
          Purpose
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            value={form.purpose}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                purpose: event.target.value,
              }))
            }
          />
        </label>

        <label className="text-sm text-slate-600">
          Primary first name
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            value={form.primaryApplicant.firstName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                primaryApplicant: {
                  ...current.primaryApplicant,
                  firstName: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="text-sm text-slate-600">
          Primary last name
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            value={form.primaryApplicant.lastName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                primaryApplicant: {
                  ...current.primaryApplicant,
                  lastName: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="text-sm text-slate-600">
          Primary email
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            value={form.primaryApplicant.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                primaryApplicant: {
                  ...current.primaryApplicant,
                  email: event.target.value,
                },
              }))
            }
          />
        </label>

        <label className="text-sm text-slate-600">
          Primary income
          <input
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            type="number"
            value={form.primaryApplicant.annualIncome}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                primaryApplicant: {
                  ...current.primaryApplicant,
                  annualIncome: Number(event.target.value),
                },
              }))
            }
          />
        </label>
      </div>

      <label className="mt-5 flex items-center gap-3 text-sm font-medium text-slate-700">
        <input
          checked={includeCoApplicant}
          onChange={(event) => {
            setIncludeCoApplicant(event.target.checked);
            if (event.target.checked && !form.coApplicant) {
              setForm((current) => ({
                ...current,
                coApplicant: {
                  firstName: "Marcus",
                  lastName: "Coapplicant",
                  email: "coapplicant@example.com",
                  annualIncome: 93000,
                },
              }));
            }
          }}
          type="checkbox"
        />
        Include a co-applicant
      </label>

      {includeCoApplicant && form.coApplicant ? (
        <div className="mt-4 grid gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Co-applicant first name
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              value={form.coApplicant.firstName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  coApplicant: current.coApplicant
                    ? {
                        ...current.coApplicant,
                        firstName: event.target.value,
                      }
                    : undefined,
                }))
              }
            />
          </label>
          <label className="text-sm text-slate-600">
            Co-applicant last name
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              value={form.coApplicant.lastName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  coApplicant: current.coApplicant
                    ? {
                        ...current.coApplicant,
                        lastName: event.target.value,
                      }
                    : undefined,
                }))
              }
            />
          </label>
          <label className="text-sm text-slate-600">
            Co-applicant email
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              value={form.coApplicant.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  coApplicant: current.coApplicant
                    ? {
                        ...current.coApplicant,
                        email: event.target.value,
                      }
                    : undefined,
                }))
              }
            />
          </label>
          <label className="text-sm text-slate-600">
            Co-applicant income
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              type="number"
              value={form.coApplicant.annualIncome}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  coApplicant: current.coApplicant
                    ? {
                        ...current.coApplicant,
                        annualIncome: Number(event.target.value),
                      }
                    : undefined,
                }))
              }
            />
          </label>
        </div>
      ) : null}
    </form>
  );
}
