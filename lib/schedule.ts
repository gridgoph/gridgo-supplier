import type { Order } from "@/lib/api";

export type AgendaSectionId = "today" | "next7" | "later" | "undated";

export type AgendaSection = {
  id: AgendaSectionId;
  title: string;
  jobs: Order[];
};

/**
 * Agenda grouping for the Schedule tab.
 *
 * Small screens get a chronological list by design — Today, then Next 7 days,
 * then anything further out. Only accepted-and-beyond jobs with a date belong
 * on the production agenda; assignment-pending work lives on Jobs.
 */
export function buildAgenda(
  jobs: Order[],
  now: Date = new Date(),
): AgendaSection[] {
  const startOfToday = startOfLocalDay(now);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfNext7 = new Date(startOfToday);
  endOfNext7.setDate(endOfNext7.getDate() + 8);

  const eligible = jobs.filter((j) => isAgendaEligible(j));

  const today: Order[] = [];
  const next7: Order[] = [];
  const later: Order[] = [];
  const undated: Order[] = [];

  for (const job of eligible) {
    const raw = job.promisedDate || job.deadline;
    if (!raw) {
      undated.push(job);
      continue;
    }
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) {
      undated.push(job);
      continue;
    }
    if (when >= startOfToday && when < endOfToday) {
      today.push(job);
    } else if (when >= endOfToday && when < endOfNext7) {
      next7.push(job);
    } else if (when >= endOfNext7) {
      later.push(job);
    } else {
      // Past due but still active — keep visible under Today so it is not lost.
      today.push(job);
    }
  }

  const byDate = (a: Order, b: Order) =>
    String(a.promisedDate || a.deadline || "").localeCompare(
      String(b.promisedDate || b.deadline || ""),
    );

  today.sort(byDate);
  next7.sort(byDate);
  later.sort(byDate);

  const sections: AgendaSection[] = [
    { id: "today", title: "Today", jobs: today },
    { id: "next7", title: "Next 7 days", jobs: next7 },
  ];
  if (later.length) sections.push({ id: "later", title: "Later", jobs: later });
  if (undated.length) sections.push({ id: "undated", title: "No date set", jobs: undated });
  return sections;
}

/** Accepted (or later) jobs that the shop has committed to produce. */
export function isAgendaEligible(job: Pick<Order, "state">): boolean {
  const blocked = new Set([
    "draft",
    "submitted",
    "needs_qa",
    "client_correction",
    "proof_approval",
    "approved_for_matching",
    "supplier_assigned",
  ]);
  return !blocked.has(job.state);
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
