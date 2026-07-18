"use client";

/**
 * What this file does: Lets the user switch between seeded demo roles without reloading the app.
 * What calls it: `src/components/dashboard/dashboard-client.tsx`.
 * What it calls: `src/hooks/use-session.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Building a separate auth page when the project's teaching goal is to inspect role behavior
 * inside the actual product surface.
 */
import { useState } from "react";

import { useLoginMutation, type SessionResponse } from "@/hooks/use-session";

export function SessionSwitcher({
  sessionResponse,
}: {
  sessionResponse: SessionResponse;
}) {
  const [selectedUserId, setSelectedUserId] = useState(
    sessionResponse.session?.id ?? sessionResponse.demoUsers[0]?.id ?? "",
  );
  const loginMutation = useLoginMutation();

  return (
    <div className="rounded-3xl border border-white/60 bg-white/90 p-5 shadow-lg shadow-slate-200/50 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
        Demo Session
      </p>
      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <select
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
        >
          {sessionResponse.demoUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName} ({user.role})
            </option>
          ))}
        </select>
        <button
          className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => loginMutation.mutate(selectedUserId)}
          disabled={loginMutation.isPending || !selectedUserId}
          type="button"
        >
          {loginMutation.isPending ? "Switching..." : "Switch Role"}
        </button>
      </div>
      {sessionResponse.session ? (
        <p className="mt-3 text-sm text-slate-600">
          Active session:{" "}
          <span className="font-semibold text-slate-900">
            {sessionResponse.session.fullName}
          </span>{" "}
          as {sessionResponse.session.role}.
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          Pick a role to inspect how the permission model changes the workflow.
        </p>
      )}
    </div>
  );
}
