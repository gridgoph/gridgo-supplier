/**
 * How a shop looks at its Jobs tab.
 *
 * The floor already splits "needs you" from "in flight". This is the second
 * cut: find a docket by name, stamp a stage, and choose how the list is
 * ordered. Late is a stamp, not a sort — due date already puts the soonest
 * (and therefore overdue) work first. All of it is local — the list is
 * already on the phone.
 */
import type { Order } from "@/lib/api";
import { deadlineUrgency } from "@/lib/urgency";

export type JobStageFilter =
  | "all"
  | "late"
  | "on_press"
  | "self_qc"
  | "packed"
  | "with_rider"
  | "waiting_on_client";

export type JobSort = "due_first" | "newest" | "name";

export type JobBoardQuery = {
  q: string;
  stage: JobStageFilter;
  sort: JobSort;
};

export const DEFAULT_JOB_BOARD_QUERY: JobBoardQuery = {
  q: "",
  stage: "all",
  sort: "due_first",
};

/** Rubber-stamp labels a press would actually shout across the floor. */
export const JOB_STAGE_TICKETS: readonly { value: JobStageFilter; label: string }[] = [
  { value: "all", label: "All jobs" },
  { value: "late", label: "Late" },
  { value: "on_press", label: "On press" },
  { value: "self_qc", label: "Self-QC" },
  { value: "packed", label: "Packed" },
  { value: "with_rider", label: "With rider" },
  { value: "waiting_on_client", label: "Waiting on client" },
];

export const JOB_SORTS: readonly { value: JobSort; label: string; detail: string }[] = [
  {
    value: "due_first",
    label: "Due date first",
    detail: "Soonest due at the top. Late work is already first.",
  },
  { value: "newest", label: "Newest first", detail: "The job that landed last." },
  { value: "name", label: "A–Z", detail: "By the name you would ask for." },
];

export function sortLabel(sort: JobSort): string {
  return JOB_SORTS.find((row) => row.value === sort)?.label ?? JOB_SORTS[0].label;
}

export function isJobSort(value: string): value is JobSort {
  return JOB_SORTS.some((row) => row.value === value);
}

/** What is actually on the floor after find and stamp. */
export function jobBoardCountCopy(shown: number, total: number): string {
  if (shown === total) return shown === 1 ? "1 job" : `${shown} jobs`;
  return `${shown} of ${total} jobs`;
}

export function isJobBoardNarrowed(query: JobBoardQuery): boolean {
  return query.q.trim().length > 0 || query.stage !== "all";
}

export function jobDueAt(job: Pick<Order, "promisedDate" | "deadline" | "readyBy">): string | null {
  return job.promisedDate || job.deadline || job.readyBy || null;
}

export function jobMatchesFind(job: Pick<Order, "title">, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return job.title.toLowerCase().includes(needle);
}

export function jobMatchesStage(
  job: Pick<Order, "state" | "promisedDate" | "deadline" | "readyBy">,
  stage: JobStageFilter,
  now: Date = new Date(),
): boolean {
  if (stage === "all") return true;
  if (stage === "late") return deadlineUrgency(jobDueAt(job), now).level === "overdue";
  if (stage === "on_press") {
    return job.state === "payment_authorized" || job.state === "production";
  }
  if (stage === "self_qc") return job.state === "supplier_self_qc";
  if (stage === "packed") return job.state === "ready_for_dispatch";
  if (stage === "with_rider") {
    return (
      job.state === "rider_assigned" ||
      job.state === "picked_up" ||
      job.state === "out_for_delivery"
    );
  }
  return (
    job.state === "awaiting_collection" ||
    job.state === "client_correction" ||
    job.state === "awaiting_downpayment" ||
    job.state === "awaiting_checkout" ||
    job.state === "issue_window_open"
  );
}

export function sortJobs<T extends Pick<Order, "promisedDate" | "deadline" | "readyBy" | "createdAt" | "title" | "id">>(
  jobs: readonly T[],
  sort: JobSort,
  now: Date = new Date(),
): T[] {
  const copy = [...jobs];
  copy.sort((a, b) => {
    if (sort === "name") {
      const byName = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      return byName || a.id.localeCompare(b.id);
    }
    if (sort === "newest") {
      return String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id);
    }
    const aDue = jobDueAt(a);
    const bDue = jobDueAt(b);
    if (!aDue && !bDue) return a.id.localeCompare(b.id);
    if (!aDue) return 1;
    if (!bDue) return -1;
    const byDate = aDue.localeCompare(bDue);
    return byDate || a.id.localeCompare(b.id);
  });
  return copy;
}

export function filterJobs<T extends Pick<Order, "title" | "state" | "promisedDate" | "deadline" | "readyBy" | "createdAt" | "id">>(
  jobs: readonly T[],
  query: JobBoardQuery,
  now: Date = new Date(),
): T[] {
  const matched = jobs.filter(
    (job) => jobMatchesFind(job, query.q) && jobMatchesStage(job, query.stage, now),
  );
  return sortJobs(matched, query.sort, now);
}

export function jobStageCounts(
  jobs: readonly Pick<Order, "state" | "promisedDate" | "deadline" | "readyBy">[],
  now: Date = new Date(),
): Record<JobStageFilter, number> {
  const counts = {
    all: jobs.length,
    late: 0,
    on_press: 0,
    self_qc: 0,
    packed: 0,
    with_rider: 0,
    waiting_on_client: 0,
  } satisfies Record<JobStageFilter, number>;
  for (const job of jobs) {
    for (const ticket of JOB_STAGE_TICKETS) {
      if (ticket.value === "all") continue;
      if (jobMatchesStage(job, ticket.value, now)) counts[ticket.value] += 1;
    }
  }
  return counts;
}

export function emptyJobBoardCopy(query: JobBoardQuery): { title: string; body: string } {
  if (query.q.trim()) {
    return {
      title: "No job by that name",
      body: "Nothing on this floor matches what you typed. Clear the find, or stamp a different stage.",
    };
  }
  if (query.stage === "late") {
    return {
      title: "Nothing is late",
      body: "Every dated job is still inside its window. The rest of the floor is under All jobs.",
    };
  }
  if (query.stage !== "all") {
    const ticket = JOB_STAGE_TICKETS.find((row) => row.value === query.stage);
    return {
      title: `Nothing is ${ticket?.label.toLowerCase() ?? "here"}`,
      body: "No job on this floor is in that stage right now. Pick another stamp, or show all jobs.",
    };
  }
  return {
    title: "No assignments yet",
    body: "When GRIDGO matches a job to your shop, it lands here for accept or decline.",
  };
}
