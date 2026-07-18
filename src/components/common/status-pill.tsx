/**
 * What this file does: Renders a compact badge for workflow stages and statuses.
 * What calls it: Dashboard and application detail components.
 * What it calls: No downstream modules.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Hard-coding badge classes in every table row and card instead of centralizing the mapping.
 */
const toneMap: Record<string, string> = {
  INTAKE: "bg-slate-100 text-slate-700",
  VERIFICATION: "bg-amber-100 text-amber-800",
  CREDIT_DECISIONING: "bg-cyan-100 text-cyan-800",
  CONDITIONS: "bg-orange-100 text-orange-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  DISBURSEMENT: "bg-indigo-100 text-indigo-800",
  SERVICING_HANDOFF: "bg-fuchsia-100 text-fuchsia-800",
  DENIED: "bg-rose-100 text-rose-800",
  PASSED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  PENDING: "bg-slate-200 text-slate-700",
  OPEN: "bg-amber-100 text-amber-800",
  SATISFIED: "bg-emerald-100 text-emerald-800",
  WAIVED: "bg-violet-100 text-violet-800",
  APPROVED_DECISION: "bg-emerald-100 text-emerald-800",
  REFER: "bg-cyan-100 text-cyan-800",
  DECLINED: "bg-rose-100 text-rose-800",
};

export function StatusPill({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) {
    return null;
  }

  const key = value === "APPROVED" ? "APPROVED_DECISION" : value;
  const tone = toneMap[key] ?? "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-[0.18em] ${tone} ${className}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
