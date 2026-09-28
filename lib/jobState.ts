import type { MilestoneCode, Order, PayoutPlanVersion } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { CURRENT_PAYOUT_PLAN, nextShopProof } from "@/lib/milestones";
import { counterCheck, presentCheckCodes } from "@/lib/pickupCheck";
import { needsProductionPhoto } from "@/lib/productionPhoto";
import { presentRefundTimelineNote, refundStanding, refundStatus } from "@/lib/refund";

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
  | "ready_for_pickup"
  | "add_production_photo"
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
      return { label: "Packaging", tone: "success", icon: "circle-check" };
    case "ready_for_dispatch":
      return { label: "Ready for pickup", tone: "success", icon: "circle-check" };
    case "rider_assigned":
      return { label: "Rider assigned", tone: "info", icon: "clock" };
    case "picked_up":
      return { label: "Picked up", tone: "info", icon: "circle-check" };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "info", icon: "clock" };
    // The client collects this one. It reached GRIDGO's counter and waits there
    // for them, which is a step past the shop's own work either way.
    case "awaiting_collection":
      return { label: "Waiting for the client", tone: "info", icon: "clock" };
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
    case "cancelled":
      return { label: "Cancelled", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "In progress", tone: "neutral", icon: "clock" };
  }
}

/**
 * The chip for one job. The state alone says "Rider assigned" while a failed
 * counter check has the package stuck at the shop, so a check that is holding
 * the pickup speaks over it. A refund speaks over both: the state still reads
 * "In production" while GRIDGO has stopped the work.
 */
export function presentJobStatus(
  order: Pick<
    Order,
    "state" | "title" | "timeline" | "pickupChecklist" | "pickupCountItems" | "refundHold" | "refundDisposition"
  >,
): StatePresentation {
  const refund = refundStatus(order);
  if (refund) return refund;
  if (order.state === "rider_assigned") {
    const check = counterCheck(order);
    if (check && check.stage !== "passed") {
      return { label: check.status, tone: check.tone, icon: check.icon };
    }
  }
  return presentOrderState(order.state);
}

/**
 * The steps valid for a job right now. An invalid one must not be rendered as
 * an enabled control.
 *
 * Where the shop owes evidence, that comes first and takes the yellow: the
 * proof is what releases the shop's first part of the job's money, and a shop
 * that walks the job forward without it has quietly worked for nothing. The
 * forward step stays available underneath — the platform lets a job move
 * without its proof, so this app warns rather than blocks.
 *
 * A refund request stops everything, proof included: GRIDGO refuses the next
 * step with `refund_fulfillment_stopped`, and a settlement closes the job.
 */
export function actionsForJob(order: JobActionOrder): SupplierAction[] {
  if (refundStanding(order) !== "none") return [];
  const state = order.state;
  const owed = nextShopProof(order as Order);
  // Packing waits on a photo, and a proof filed as a picture is one.
  const photoOwed = needsProductionPhoto(order);
  const proofStep: SupplierAction | null = owed
    ? {
        kind: "add_proof",
        label: `Add ${owed.proofName} proof`,
        targetState: null,
        primary: true,
        consequence:
          `GRIDGO releases ${percentText(owed.sharePercent)} of your earnings on this job once it has your evidence for ${owed.label.toLowerCase()}.` +
          (photoOwed ? " A photo also counts as the production photo you need before packing." : ""),
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
    // Older clients may still leave a job at this state.
    case "supplier_self_qc":
      // GRIDGO will not let the job be packed without a photo of the work, so
      // the step that would be refused is replaced by the one that opens it.
      if (photoOwed) {
        return demote(proofStep, {
          kind: "add_production_photo",
          label: "Add a production photo",
          targetState: null,
          primary: true,
          consequence:
            "GRIDGO needs one photo of this job on your floor before it can be packaged. The client sees it on their order.",
          resultLabel: "Photo on the job",
        });
      }
      return demote(proofStep, {
        kind: "ready_for_pickup",
        label: "Package for pickup",
        targetState: "ready_for_dispatch",
        primary: true,
        consequence:
          "GRIDGO notifies riders that the package is ready. Check it together at the counter after a rider accepts, before it leaves your shop.",
        resultLabel: "Ready for pickup",
      });
    default:
      // Past the shop's floor, an unfiled proof is still the shop's money.
      return proofStep ? [proofStep] : [];
  }
}

/** What `actionsForJob` reads. Every field but the state may be absent on an older API. */
export type JobActionOrder = Pick<
  Order,
  "state" | "payoutMilestones" | "payoutHold" | "refundHold" | "refundDisposition" | "productionProgress"
>;

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
  | "/job/[id]/handoff"
  | "/job/[id]/progress-photo";

/** The flow screen an action opens. Nothing state-changing is a bare row tap. */
export function routeForAction(kind: SupplierActionKind): SupplierActionRoute {
  switch (kind) {
    case "accept":
      return "/job/[id]/accept";
    case "decline":
      return "/job/[id]/decline";
    case "add_proof":
      return "/job/[id]/fulfilment";
    case "ready_for_pickup":
      return "/job/[id]/handoff";
    case "add_production_photo":
      return "/job/[id]/progress-photo";
    default:
      return "/job/[id]/advance";
  }
}

export function findAction(
  order: JobActionOrder,
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
  { id: "production", label: "Production & packing", states: ["payment_authorized", "production", "supplier_self_qc"] },
  { id: "pickup", label: "Pickup", states: ["ready_for_dispatch", "rider_assigned"] },
  {
    id: "delivery",
    label: "Delivery",
    states: ["picked_up", "out_for_delivery", "awaiting_collection", "delivered"],
  },
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
  order: JobActionOrder,
): SupplierAction | null {
  return actionsForJob(order).find((a) => a.primary) ?? null;
}

/** Jobs still waiting on the supplier to accept or decline. */
export function isAwaitingDecision(order: Pick<Order, "state">): boolean {
  return order.state === "supplier_assigned";
}

/** Jobs the shop is actively producing (downpayment in, through packing). */
export function isInProductionPipeline(order: Pick<Order, "state">): boolean {
  return (
    order.state === "payment_authorized" ||
    order.state === "production" ||
    order.state === "supplier_self_qc"
  );
}

/** Jobs that still need a supplier action on this device. */
export function needsSupplierAction(
  order: JobActionOrder,
): boolean {
  return actionsForJob(order).some((a) => a.primary);
}

/**
 * What the shop is waiting for when it has no action of its own. A screen that
 * only says "nothing to do" leaves a supplier guessing whose move it is.
 *
 * `plan` is the order's payout plan (`payoutPlanOf`): only a legacy order has
 * a retention part to talk about.
 */
export function waitingOn(
  state: string,
  plan: PayoutPlanVersion = CURRENT_PAYOUT_PLAN,
): { title: string; body: string } {
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
        body: "Riders have been notified that the package is ready. Keep it at your counter until a rider accepts and arrives for the joint pickup checks.",
      };
    case "rider_assigned":
      return {
        title: "Rider on the way",
        body: "When the rider arrives, run the six pickup checks together at the counter. The rider records them in their app; the package leaves only after all six pass.",
      };
    case "picked_up":
    case "out_for_delivery":
      return {
        title: "With the rider",
        body: "The job has left your shop. The delivered part of your earnings releases on the rider's evidence.",
      };
    case "awaiting_collection":
      return {
        title: "Waiting for the client",
        body: "The job reached GRIDGO's counter and the client is collecting it there. Nothing here is yours to do.",
      };
    case "delivered":
    case "issue_window_open":
      return {
        title: "Delivered",
        body:
          plan === 1
            ? "The client has the job and a window to report a problem. Retention releases once that window closes."
            : "The client has the job and a window to report a problem. GRIDGO can release the last part of your earnings once that window closes with nothing reported.",
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
 * A timeline note, with anything the platform wrote in its own vocabulary
 * turned into the shop's.
 *
 * Notes are mostly written by people and pass through untouched. The exception
 * is the ones the platform composes from check codes — "Pickup blocked and
 * escalated: visible_defects" — and those are the ones a shop cannot read.
 */
export function presentTimelineNote(note: string): string {
  return presentRefundTimelineNote(presentCheckCodes(note));
}
