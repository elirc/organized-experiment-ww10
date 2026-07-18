/**
 * What this file does: Formats money and timestamps into consistent UI strings.
 * What calls it: Dashboard and application detail components.
 * What it calls: `luxon`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Repeating date and money formatting inline in every component until the dashboard becomes
 * inconsistent and harder to scan.
 */
import { DateTime } from "luxon";

export function formatCurrency(amount: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not yet";
  }

  return DateTime.fromISO(value).toLocaleString(DateTime.DATETIME_MED);
}
