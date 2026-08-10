import type { Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * Supplier-facing order state: plain labels, tones, and the single next action
 * the mobile surface may offer. No API snake_case reaches the UI.
 */

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "send_proof"
  | "resend_proof"
  | "request_payment"
  | "start_production"
  | "self_qc"
  | "ready_for_pickup";

export type SupplierAction = {
  kind: SupplierActionKind;
  /** Verb on the yellow CTA (or secondary for decline). */
  label: string;
  /**
   * Target state for POST /orders/:id/transition, or null when the step is not
   * a transition at all — sending a proof moves the order by attaching a file.
   */
  targetState: string | null;
  /** Primary (yellow) vs secondary (monochrome). Only one primary is valid. */
  primary: boolean;
  /** Destructive actions need confirmation. */
  destructive?: boolean;
  /** What the shop is committing to, in one sentence. */
  consequence: string;
  /** The state name the shop will see afterwards — same verb, past tense. */
  resultLabel: string;
};

export type StatePresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
};

/** Map every API state the supplier may see to plain language + chip chrome. */
export function presentOrderState(state: string): StatePresentation {
  switch (state) {
    case "supplier_assigned":
      return { label: "Needs decision", tone: "warning", icon: "triangle-alert" };
    case "supplier_accepted":
      return { label: "Proof needed", tone: "warning", icon: "square-pen" };
    case "supplier_proof_review":
      return { label: "Proof with client", tone: "info", icon: "clock" };
    case "supplier_proof_changes_requested":
      return { label: "Changes requested", tone: "warning", icon: "triangle-alert" };
    case "supplier_proof_approved":
      return { label: "Proof approved", tone: "success", icon: "circle-check" };
    case "awaiting_payment":
      return { label: "Awaiting payment", tone: "warning", icon: "clock" };
    case "payment_authorized":
      // A status says where the job stands; the button says what to do about
      // it. Naming the next action here made both read the same words twice.
      return { label: "Paid", tone: "info", icon: "circle-check" };
    case "production":
      return { label: "In production", tone: "info", icon: "square-pen" };
    case "supplier_self_qc":
      return { label: "Self-QC done", tone: "success", icon: "circle-check" };
    case "ready_for_dispatch":
      return { label: "Ready for pickup", tone: "success", icon: "circle-check" };
    case "rider_assigned":
      return { label: "Rider assigned", tone: "info", icon: "clock" };
    case "picked_up":
      return { label: "Picked up", tone: "info", icon: "circle-check" };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "info", icon: "clock" };
    case "delivered":
      return { label: "Delivered", tone: "success", icon: "circle-check" };
    case "issue_window_open":
      return { label: "Delivery issue window", tone: "warning", icon: "clock" };
    case "completed":
      return { label: "Completed", tone: "success", icon: "circle-check" };
    case "payout_released":
      return { label: "Payout released", tone: "success", icon: "circle-check" };
    case "approved_for_matching":
      return { label: "Returned for rematch", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "In progress", tone: "neutral", icon: "clock" };
  }
}

/**
 * The single set of actions valid for a job in its current state.
 * An invalid action must not be rendered as an enabled control.
 */
export function actionsForJob(state: string): SupplierAction[] {
  switch (state) {
    case "supplier_assigned":
      return [
        {
          kind: "accept",
          label: "Accept job",
          targetState: "supplier_accepted",
          primary: true,
          consequence:
            "Your shop commits to producing this job by the finish time you promise.",
          resultLabel: "Accepted",
        },
        {
          kind: "decline",
          label: "Decline job",
          targetState: "approved_for_matching",
          primary: false,
          destructive: true,
          consequence:
            "The job returns to GRIDGO for rematching and is not offered to your shop again.",
          resultLabel: "Declined",
        },
      ];
    case "supplier_accepted":
      return [
        {
          kind: "send_proof",
          label: "Send proof to client",
          targetState: null,
          primary: true,
          consequence:
            "The client reviews your proof before anything is printed. They can approve it or ask for changes.",
          resultLabel: "Proof with client",
        },
      ];
    case "supplier_proof_changes_requested":
      return [
        {
          kind: "resend_proof",
          label: "Send a corrected proof",
          targetState: null,
          primary: true,
          consequence:
            "The client sees the corrected proof and reviews it again. Read what they asked for on the timeline first.",
          resultLabel: "Proof with client",
        },
      ];
    case "supplier_proof_approved":
      return [
        {
          kind: "request_payment",
          label: "Send for payment",
          targetState: "awaiting_payment",
          primary: true,
          consequence:
            "The client is asked to pay. Production starts once payment clears.",
          resultLabel: "Sent for payment",
        },
      ];
    case "payment_authorized":
      return [
        {
          kind: "start_production",
          label: "Start production",
          targetState: "production",
          primary: true,
          consequence:
            "The client sees production has started, with the note you write below.",
          resultLabel: "In production",
        },
      ];
    case "production":
      return [
        {
          kind: "self_qc",
          label: "Complete self-QC",
          targetState: "supplier_self_qc",
          primary: true,
          consequence:
            "Your checks become the quality record Operations and the client rely on.",
          resultLabel: "Self-QC done",
        },
      ];
    case "supplier_self_qc":
      return [
        {
          kind: "ready_for_pickup",
          label: "Mark ready for pickup",
          targetState: "ready_for_dispatch",
          primary: true,
          consequence:
            "GRIDGO assigns a rider to collect from your shop. The job must be packed and staged before you confirm.",
          resultLabel: "Ready for pickup",
        },
      ];
    default:
      return [];
  }
}

/** Flow-screen routes. Literal so Expo Router's typed routes can check them. */
export type SupplierActionRoute =
  | "/job/[id]/accept"
  | "/job/[id]/decline"
  | "/job/[id]/proof"
  | "/job/[id]/advance"
  | "/job/[id]/self-qc"
  | "/job/[id]/handoff";

/** The flow screen an action opens. Nothing state-changing is a bare row tap. */
export function routeForAction(kind: SupplierActionKind): SupplierActionRoute {
  switch (kind) {
    case "accept":
      return "/job/[id]/accept";
    case "decline":
      return "/job/[id]/decline";
    case "send_proof":
    case "resend_proof":
      return "/job/[id]/proof";
    case "self_qc":
      return "/job/[id]/self-qc";
    case "ready_for_pickup":
      return "/job/[id]/handoff";
    default:
      return "/job/[id]/advance";
  }
}

export function findAction(state: string, kind: string): SupplierAction | null {
  return actionsForJob(state).find((a) => a.kind === kind) ?? null;
}

/**
 * The job's journey through the shop. This *is* a sequence, so the workspace
 * numbers it — the shop needs to know what is left, not only what happened.
 */
export const JOB_JOURNEY = [
  { id: "decision", label: "Decision", states: ["supplier_assigned"] },
  { id: "accepted", label: "Accepted", states: ["supplier_accepted"] },
  {
    id: "proof",
    label: "Proof",
    states: [
      "supplier_proof_review",
      "supplier_proof_changes_requested",
      "supplier_proof_approved",
    ],
  },
  { id: "payment", label: "Payment", states: ["awaiting_payment", "payment_authorized"] },
  { id: "production", label: "Production", states: ["production"] },
  { id: "self_qc", label: "Self-QC", states: ["supplier_self_qc"] },
  { id: "pickup", label: "Pickup", states: ["ready_for_dispatch", "rider_assigned"] },
  {
    id: "delivery",
    label: "Delivery",
    states: [
      "picked_up",
      "out_for_delivery",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ],
  },
] as const;

/** Index into `JOB_JOURNEY`, or -1 when the job left the supplier's path. */
export function journeyIndex(state: string): number {
  return JOB_JOURNEY.findIndex((step) => step.states.some((s) => s === state));
}

export function primaryAction(state: string): SupplierAction | null {
  return actionsForJob(state).find((a) => a.primary) ?? null;
}

/** Jobs still waiting on the supplier to accept or decline. */
export function isAwaitingDecision(order: Pick<Order, "state">): boolean {
  return order.state === "supplier_assigned";
}

/** Jobs the shop is actively producing (paid through self-QC). */
export function isInProductionPipeline(order: Pick<Order, "state">): boolean {
  return (
    order.state === "payment_authorized" ||
    order.state === "production" ||
    order.state === "supplier_self_qc"
  );
}

/** Jobs that still need a supplier action on this device. */
export function needsSupplierAction(order: Pick<Order, "state">): boolean {
  return actionsForJob(order.state).some((a) => a.primary);
}

/**
 * Most urgent pending job: needs decision first (by earliest deadline), then
 * other actionable states by deadline.
 */
export function mostUrgentJob(jobs: Order[]): Order | null {
  const actionable = jobs.filter(needsSupplierAction);
  if (!actionable.length) return null;

  const rank = (j: Order): number => {
    if (j.state === "supplier_assigned") return 0;
    if (j.state === "supplier_proof_changes_requested") return 1;
    if (j.state === "supplier_accepted") return 2;
    if (j.state === "payment_authorized") return 3;
    if (j.state === "production") return 4;
    if (j.state === "supplier_self_qc") return 5;
    if (j.state === "supplier_proof_approved") return 6;
    return 7;
  };

  return [...actionable].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const da = a.deadline || a.promisedDate || "9999";
    const db = b.deadline || b.promisedDate || "9999";
    return da.localeCompare(db);
  })[0];
}

/**
 * What the shop is waiting for when it has no action of its own. A screen that
 * only says "nothing to do" leaves a supplier guessing whose move it is.
 */
export function waitingOn(state: string): { title: string; body: string } {
  switch (state) {
    case "supplier_proof_review":
      return {
        title: "Waiting on the client",
        body: "They are reviewing your proof. You will see here whether they approve it or ask for changes — do not start printing yet.",
      };
    case "awaiting_payment":
      return {
        title: "Waiting on payment",
        body: "The client has been asked to pay. Production opens up as soon as it clears.",
      };
    case "ready_for_dispatch":
      return {
        title: "Waiting on a rider",
        body: "GRIDGO is assigning someone to collect. Keep the packed job at your counter.",
      };
    case "rider_assigned":
      return {
        title: "Rider on the way",
        body: "Hand the job over and let the rider confirm the pickup before they leave.",
      };
    case "picked_up":
    case "out_for_delivery":
      return {
        title: "With the rider",
        body: "The job has left your shop. Protected payment settles after delivery.",
      };
    case "delivered":
    case "issue_window_open":
      return {
        title: "Delivered",
        body: "The client has the job. Operations settles protected payment after the issue window closes.",
      };
    case "completed":
    case "payout_released":
      return {
        title: "Job finished",
        body: "Nothing further is needed from your shop.",
      };
    default:
      return {
        title: "Nothing to do right now",
        body: "Pull down to refresh for the next update on this job.",
      };
  }
}

/** Timeline row label — actor-facing, never the raw user id alone. */
export function presentTimelineActor(by: string): string {
  if (by === "system") return "GRIDGO";
  if (by === "user_client") return "Client";
  if (by === "user_supplier") return "You";
  if (by === "user_rider") return "Rider";
  if (by === "user_ops" || by === "user_admin") return "Operations";
  if (by.startsWith("user_")) return "Team";
  return by;
}

export function presentTimelineState(state: string): string {
  return presentOrderState(state).label;
}

/** Self-QC checklist items implied by production handoff. */
export const SELF_QC_CHECKS = [
  { id: "artwork", label: "Print matches approved artwork" },
  { id: "size", label: "Size and material match the spec" },
  { id: "quantity", label: "Quantity complete" },
  { id: "finish", label: "Finish and cut quality checked" },
  { id: "pack", label: "Packed and labelled for pickup" },
] as const;

export function allSelfQcComplete(checked: Record<string, boolean>): boolean {
  return SELF_QC_CHECKS.every((item) => checked[item.id] === true);
}
