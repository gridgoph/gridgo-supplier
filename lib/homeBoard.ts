import type { Order } from "@/lib/api";
import {
  isAwaitingDecision,
  presentOrderState,
  primaryAction,
  routeForAction,
  type StatePresentation,
  type SupplierActionRoute,
} from "@/lib/jobState";
import { summarizePayouts, unreleasedMinor } from "@/lib/payout";
import { deadlineUrgency, type UrgencyLevel } from "@/lib/urgency";

/**
 * What a shop opens this app to find out.
 *
 * Not "how am I doing" — a shop owner knows that. The question is whether
 * anything is at risk this morning, and the two answers that matter are money
 * that has stopped moving and work that has a clock on it. So the floor is one
 * figure and a list of obligations, and nothing else competes with them.
 *
 * ## Why the headline is money at risk, not earnings to date
 *
 * Earnings to date is the obvious pick and it is the wrong one: it only ever
 * goes up, it is the same number at 6 AM and 6 PM, and a shop can do nothing
 * about it. The figure this screen leads with is the shop's own money that is
 * **not moving**, and the label under it says which kind of stuck it is.
 *
 * The order is deliberate. Money waiting on evidence the shop still owes comes
 * first, because that is the only stuck money a shop can unstick by itself —
 * work already done, already delivered in some cases, and unpaid because
 * nobody took a photograph. Money with GRIDGO comes next; released money last,
 * because by then it is history. A shop with no jobs yet gets told what the
 * figure will mean rather than a decorative zero.
 *
 * ## Why there is one ranking in this app
 *
 * The obligation list below is the only place jobs are ranked by urgency. An
 * app with two rankings teaches a shop that the order of a list means nothing.
 */

export type HeadlineTone = "at_risk" | "with_gridgo" | "released" | "none";

export type HomeHeadline = {
  amountMinor: number;
  /** What the figure is, in four or five words under it. */
  label: string;
  /** One sentence: why it is stuck and whose move it is. */
  detail: string;
  tone: HeadlineTone;
};

export function homeHeadline(jobs: Order[]): HomeHeadline {
  const payout = summarizePayouts(jobs);

  if (payout.jobCount === 0) {
    return {
      amountMinor: 0,
      label: "Earned so far",
      detail:
        "Accept a job and name your price, and what GRIDGO owes you shows up here as you work through it.",
      tone: "none",
    };
  }

  if (payout.needsProofMinor > 0) {
    return {
      amountMinor: payout.needsProofMinor,
      label: "Waiting on proof from you",
      detail:
        "You have done this work. GRIDGO cannot release it without your evidence — that is the fastest money on this screen.",
      tone: "at_risk",
    };
  }

  const withGridgo = payout.awaitingReleaseMinor + payout.heldMinor;
  if (withGridgo > 0) {
    return {
      amountMinor: withGridgo,
      label: payout.held ? "Held while a report is settled" : "With GRIDGO to release",
      detail: payout.held
        ? "A client has reported a problem, so GRIDGO is holding what is left until it is settled. Operations will tell you what they need."
        : "Every proof you owe is filed. Operations reviews the evidence and releases each part.",
      tone: "with_gridgo",
    };
  }

  return {
    amountMinor: payout.releasedMinor,
    label: "Released to your shop",
    detail: "Nothing is stuck. Everything you have earned so far has been released.",
    tone: "released",
  };
}

/** Everything not yet in the shop's hands, for the line under the headline. */
export function outstandingMinor(jobs: Order[]): number {
  return unreleasedMinor(summarizePayouts(jobs));
}

/* -------------------------------------------------------------------------- */

export type ObligationKind = "proof" | "decide" | "produce" | "pickup";

export type Obligation = {
  /** Stable across reloads so a list does not re-key under a thumb. */
  id: string;
  orderId: string;
  kind: ObligationKind;
  /** The job, so a shop always knows what it is acting on. */
  title: string;
  /** What is owed and by when, in one line. */
  detail: string;
  /** The verb on the row's action. */
  actionLabel: string;
  route: SupplierActionRoute | "/job/[id]";
  /** Passed through to the flow screen so it knows which step it is running. */
  actionKind?: string;
  /** Where the job stands, in the vocabulary `lib/jobState` owns. */
  status: StatePresentation;
  /** Drives the row's emphasis, never colour on its own. */
  urgency: UrgencyLevel;
  /** Set on a proof row: what filing it releases. */
  amountMinor?: number;
};

/**
 * Rank, in the order a shop should work through the day.
 *
 * 0 — evidence owed. Money already earned and stopped, and the only thing here
 *     nobody else can do for the shop.
 * 1 — a job to accept or decline. It has a clock and losing it costs the work.
 * 2 — a production step. Its own deadline governs, and it is already in hand.
 * 3 — a pickup. Standing instruction rather than a task: keep it at the counter.
 */
const RANK: Record<ObligationKind, number> = {
  proof: 0,
  decide: 1,
  produce: 2,
  pickup: 3,
};

function when(job: Order): number {
  const raw = job.promisedDate || job.deadline;
  const at = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

/** Jobs staged for a rider, which the shop must keep packed and to hand. */
function isAwaitingPickup(job: Order): boolean {
  return job.state === "ready_for_dispatch" || job.state === "rider_assigned";
}

export function buildObligations(jobs: Order[], now: Date = new Date()): Obligation[] {
  const out: Obligation[] = [];

  for (const job of jobs) {
    const urgency = deadlineUrgency(job.promisedDate || job.deadline, now);
    const status = presentOrderState(job.state);
    const action = primaryAction(job);

    if (action?.kind === "add_proof") {
      out.push({
        id: `${job.id}:proof`,
        orderId: job.id,
        kind: "proof",
        title: job.title,
        detail: action.consequence,
        actionLabel: action.label,
        route: routeForAction(action.kind),
        actionKind: action.kind,
        status,
        urgency: urgency.level,
        amountMinor: proofAmount(job),
      });
      continue;
    }

    if (isAwaitingDecision(job) && action) {
      out.push({
        id: `${job.id}:decide`,
        orderId: job.id,
        kind: "decide",
        title: job.title,
        detail:
          urgency.level === "undated"
            ? "GRIDGO has offered you this job. Name your price to take it."
            : `${urgency.label} — GRIDGO has offered you this job. Name your price to take it.`,
        actionLabel: action.label,
        route: routeForAction(action.kind),
        actionKind: action.kind,
        status,
        urgency: urgency.level,
      });
      continue;
    }

    if (action) {
      out.push({
        id: `${job.id}:produce`,
        orderId: job.id,
        kind: "produce",
        title: job.title,
        detail: urgency.level === "undated" ? action.consequence : urgency.label,
        actionLabel: action.label,
        route: routeForAction(action.kind),
        actionKind: action.kind,
        status,
        urgency: urgency.level,
      });
      continue;
    }

    if (isAwaitingPickup(job)) {
      out.push({
        id: `${job.id}:pickup`,
        orderId: job.id,
        kind: "pickup",
        title: job.title,
        detail:
          job.state === "rider_assigned"
            ? "A rider is on the way. Keep it packed at your counter for the six pickup checks."
            : "Packed and waiting on a rider. Keep it at your counter.",
        actionLabel: "Open job",
        route: "/job/[id]",
        status,
        urgency: urgency.level,
      });
    }
  }

  return out.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      when(byId(jobs, a.orderId)) - when(byId(jobs, b.orderId)) ||
      a.title.localeCompare(b.title),
  );
}

function byId(jobs: Order[], id: string): Order {
  return jobs.find((job) => job.id === id) ?? jobs[0];
}

/** What the outstanding proof on this job is worth, for the row that owes it. */
function proofAmount(job: Order): number | undefined {
  const owed = (job.payoutMilestones ?? []).find(
    (milestone) =>
      milestone.status === "pending_pof" &&
      (milestone.code === "printing" || milestone.code === "packaging_qc"),
  );
  return owed?.amountMinor;
}

/* -------------------------------------------------------------------------- */

/**
 * The greeting.
 *
 * One line, because the captain traded fold space for it and it has to earn
 * that. Time of day is the part that makes an app feel like it knows a person
 * is standing there; anything more would be filler.
 */
export function greeting(name: string | undefined, now: Date = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
