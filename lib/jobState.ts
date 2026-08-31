import type { MilestoneCode, Order } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { nextShopProof } from "@/lib/milestones";

/**
 * Supplier-facing order state: plain labels, tones, and the steps the mobile
 * surface may offer. No API snake_case reaches the UI.
 *
 * Two things a shop used to do here are gone with operational model v2: it no
 * longer sends the client a proof to approve, and it no longer asks for
 * payment. The client pays 75% up front and 25% on the balance, both handled
 * outside this app, and the shop's evidence now buys its own money back one
 * milestone at a time rather than unlocking the press.
 */

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "start_production"
  | "self_qc"
  | "ready_for_pickup"
  | "add_proof";

export type SupplierAction = {
  kind: SupplierActionKind;
  /** Verb on the yellow CTA (or secondary for decline). */
  label: string;
  /**
   * Target state for POST /orders/:id/transition, or null when the step is not
   * a transition at all — filing a Proof of Fulfilment moves money, not state.
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
  /** Set on `add_proof`: which part of the payout the evidence backs. */
  milestoneCode?: MilestoneCode;
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
    case "awaiting_downpayment":
      return { label: "Awaiting downpayment", tone: "warning", icon: "clock" };
    case "downpayment_review":
      return { label: "Checking payment", tone: "info", icon: "clock" };
    case "payment_authorized":
      // A status says where the job stands; the button says what to do about
      // it. Naming the next action here made both read the same words twice.
      return { label: "Downpayment in", tone: "success", icon: "circle-check" };
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
      return { label: "Client can still report", tone: "warning", icon: "clock" };
    case "completed":
      return { label: "Completed", tone: "success", icon: "circle-check" };
    case "payout_released":
      return { label: "Paid in full", tone: "success", icon: "circle-check" };
    case "approved_for_matching":
      return { label: "Returned for rematch", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "In progress", tone: "neutral", icon: "clock" };
  }
}

/**
 * The steps valid for a job right now. An invalid one must not be rendered as
 * an enabled control.
 *
 * Where the shop owes evidence, that comes first and takes the yellow: the
 * proof is what releases half the job's money, and a shop that walks the job
 * forward without it has quietly worked for nothing. The forward step stays
 * available underneath — the platform lets a job move without its proof, so
 * this app warns rather than blocks.
 */
export function actionsForJob(order: Pick<Order, "state" | "payoutMilestones" | "payoutHold">): SupplierAction[] {
  const state = order.state;
  const owed = nextShopProof(order as Order);
  const proofStep: SupplierAction | null = owed
    ? {
        kind: "add_proof",
        label: `Add ${owed.label.toLowerCase()} proof`,
        targetState: null,
        primary: true,
        consequence: `GRIDGO releases ${percentText(owed.sharePercent)} of your earnings on this job once it has your evidence for ${owed.label.toLowerCase()}.`,
        resultLabel: "Proof filed",
        milestoneCode: owed.code,
      }
    : null;

  switch (state) {
    case "supplier_assigned":
      return [
        {
          kind: "accept",
          label: "Accept job",
          // The client chose this shop's listing, paid its price and was given
          // a date, all before the job arrived here. Accepting is confirming
          // the shop can run it — there is nothing left to quote.
          targetState: "payment_authorized",
          primary: true,
          consequence:
            "Your shop commits to producing this job at the price on your board, by the date GRIDGO has already promised the client.",
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
      return demote(proofStep, {
        kind: "self_qc",
        label: "Complete self-QC",
        targetState: "supplier_self_qc",
        primary: true,
        consequence:
          "Your checks become the quality record Operations and the client rely on.",
        resultLabel: "Self-QC done",
      });
    case "supplier_self_qc":
      return demote(proofStep, {
        kind: "ready_for_pickup",
        label: "Mark ready for pickup",
        targetState: "ready_for_dispatch",
        primary: true,
        consequence:
          "GRIDGO assigns a rider to collect from your shop. The job must be packed and staged before you confirm.",
        resultLabel: "Ready for pickup",
      });
    default:
      // Past the shop's floor, an unfiled proof is still the shop's money.
      return proofStep ? [proofStep] : [];
  }
}

/** Put the outstanding proof first and hand the forward step the quiet slot. */
function demote(proof: SupplierAction | null, forward: SupplierAction): SupplierAction[] {
  if (!proof) return [forward];
  return [proof, { ...forward, primary: false }];
}

function percentText(share: number): string {
  return `${share}%`;
}

/** Flow-screen routes. Literal so Expo Router's typed routes can check them. */
export type SupplierActionRoute =
  | "/job/[id]/accept"
  | "/job/[id]/decline"
  | "/job/[id]/fulfilment"
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
    case "add_proof":
      return "/job/[id]/fulfilment";
    case "self_qc":
      return "/job/[id]/self-qc";
    case "ready_for_pickup":
      return "/job/[id]/handoff";
    default:
      return "/job/[id]/advance";
  }
}

export function findAction(
  order: Pick<Order, "state" | "payoutMilestones" | "payoutHold">,
  kind: string,
): SupplierAction | null {
  return actionsForJob(order).find((a) => a.kind === kind) ?? null;
}

/**
 * The job's journey through the shop. This *is* a sequence, so the workspace
 * numbers it — the shop needs to know what is left, not only what happened.
 */
export const JOB_JOURNEY = [
  { id: "decision", label: "Decision", states: ["supplier_assigned"] },
  {
    id: "downpayment",
    label: "Downpayment",
    states: ["supplier_accepted", "awaiting_downpayment", "downpayment_review"],
  },
  { id: "production", label: "Production", states: ["payment_authorized", "production"] },
  { id: "self_qc", label: "Self-QC", states: ["supplier_self_qc"] },
  { id: "pickup", label: "Pickup", states: ["ready_for_dispatch", "rider_assigned"] },
  { id: "delivery", label: "Delivery", states: ["picked_up", "out_for_delivery", "delivered"] },
  {
    id: "settled",
    label: "Payout",
    states: ["issue_window_open", "completed", "payout_released"],
  },
] as const;

/** Index into `JOB_JOURNEY`, or -1 when the job left the supplier's path. */
export function journeyIndex(state: string): number {
  return JOB_JOURNEY.findIndex((step) => step.states.some((s) => s === state));
}

export function primaryAction(
  order: Pick<Order, "state" | "payoutMilestones" | "payoutHold">,
): SupplierAction | null {
  return actionsForJob(order).find((a) => a.primary) ?? null;
}

/** Jobs still waiting on the supplier to accept or decline. */
export function isAwaitingDecision(order: Pick<Order, "state">): boolean {
  return order.state === "supplier_assigned";
}

/** Jobs the shop is actively producing (downpayment in, through self-QC). */
export function isInProductionPipeline(order: Pick<Order, "state">): boolean {
  return (
    order.state === "payment_authorized" ||
    order.state === "production" ||
    order.state === "supplier_self_qc"
  );
}

/** Jobs that still need a supplier action on this device. */
export function needsSupplierAction(
  order: Pick<Order, "state" | "payoutMilestones" | "payoutHold">,
): boolean {
  return actionsForJob(order).some((a) => a.primary);
}

/**
 * What the shop is waiting for when it has no action of its own. A screen that
 * only says "nothing to do" leaves a supplier guessing whose move it is.
 */
export function waitingOn(state: string): { title: string; body: string } {
  switch (state) {
    case "supplier_accepted":
    case "awaiting_downpayment":
      return {
        title: "Waiting on the client's downpayment",
        body: "The client has your price and has been asked to pay 75% of their total. Production opens up once GRIDGO confirms it — do not start printing yet.",
      };
    case "downpayment_review":
      return {
        title: "GRIDGO is checking the payment",
        body: "The client has sent their downpayment and Operations is confirming it. You will be able to start production here as soon as they do.",
      };
    case "ready_for_dispatch":
      return {
        title: "Waiting on a rider",
        body: "GRIDGO is assigning someone to collect. Keep the packed job at your counter.",
      };
    case "rider_assigned":
      return {
        title: "Rider on the way",
        body: "Hand the job over and let the rider work through their six pickup checks before they leave.",
      };
    case "picked_up":
    case "out_for_delivery":
      return {
        title: "With the rider",
        body: "The job has left your shop. The delivered part of your earnings releases on the rider's evidence.",
      };
    case "delivered":
    case "issue_window_open":
      return {
        title: "Delivered",
        body: "The client has the job and a window to report a problem. Retention releases once that window closes.",
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

/**
 * The rider's six pickup checks, in the words a shop would use for them.
 *
 * These reach this app inside a timeline note the platform writes — a failed
 * pickup is recorded as "Pickup blocked and escalated: visible_defects" — so a
 * raw code lands on a shop's screen unless it is translated on the way past.
 */
const PICKUP_CHECK_LABELS: Record<string, string> = {
  quantity_match: "the count against the order",
  specification_match: "the item against the spec",
  visible_defects: "visible defects",
  packaging_integrity: "the packing",
  documentation: "the paperwork",
  supplier_sign_off: "your sign-off",
};

/**
 * A timeline note, with anything the platform wrote in its own vocabulary
 * turned into the shop's.
 *
 * Notes are mostly written by people and pass through untouched. The exception
 * is the ones the platform composes from codes, and those are the ones a shop
 * cannot read.
 */
export function presentTimelineNote(note: string): string {
  let out = note;
  for (const [code, label] of Object.entries(PICKUP_CHECK_LABELS)) {
    out = out.replaceAll(code, label);
  }
  return out;
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
