import type { MilestoneCode, Order, PayoutPlanVersion } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";
import { acceptWindow } from "@/lib/acceptWindow";
import { CURRENT_PAYOUT_PLAN, milestoneDefinition, nextShopProof } from "@/lib/milestones";
import { counterCheck, presentCheckCodes } from "@/lib/pickupCheck";
import { needsPackingPhoto } from "@/lib/packingPhoto";
import { packagingCheck, packagingHeld } from "@/lib/packagingReadiness";
import { paysInFull } from "@/lib/payment";
import { needsProductionPhoto } from "@/lib/productionPhoto";
import { presentRefundTimelineNote, refundStanding, refundStatus } from "@/lib/refund";
import { rescheduleNotice } from "@/lib/reschedule";
import { shopRelease } from "@/lib/shopRecovery";
import {
  DO_NOT_PACK_YET,
  finishedStage,
  handoverFlowOf,
  riderPacking,
  ridersPack,
  type HandoverFlow,
} from "@/lib/shopHandover";

/**
 * Supplier-facing order state: plain labels, tones, and the steps the mobile
 * surface may offer. No API snake_case reaches the UI.
 *
 * Two things a shop used to do here are gone with operational model v2: it no
 * longer sends the client a proof to approve, and it no longer asks for
 * payment. The client pays in full up front (older orders: 75% and a 25%
 * balance), all handled outside this app, and the shop's evidence now buys
 * its own money back one milestone at a time rather than unlocking the press.
 */

export type SupplierActionKind =
  | "accept"
  | "decline"
  | "start_production"
  | "ready_for_pickup"
  | "add_production_photo"
  | "add_packing_photo"
  /** Newer handover: photograph the finished, unpacked products for GRIDGO's review. */
  | "send_finished_photos"
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

/**
 * Map every API state the supplier may see to plain language + chip chrome.
 * Pass the order where there is one: a job the client paid in full up front
 * must not read as a downpayment.
 */
export function presentOrderState(
  state: string,
  payment?: Partial<Pick<Order, "payments" | "downpaymentPercent" | "balanceMinor">>,
): StatePresentation {
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
      // "Client" because "Paid in full" alone is the shop's own payout below.
      if (payment && paysInFull(payment)) {
        return { label: "Client paid in full", tone: "success", icon: "circle-check" };
      }
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
    | "state"
    | "title"
    | "timeline"
    | "pickupChecklist"
    | "pickupCountItems"
    | "refundHold"
    | "refundDisposition"
    | "shopAcceptance"
    | "shopRecovery"
    | "rescheduleRequest"
    | "handoverFlow"
    | "shopHandover"
  > &
    Partial<Pick<Order, "supplierId" | "riderId" | "payments" | "downpaymentPercent" | "balanceMinor">>,
): StatePresentation {
  const refund = refundStatus(order);
  if (refund) return refund;
  // A job the shop let go keeps its old state until the client chooses.
  const released = shopRelease(order);
  if (released) return released.chip;
  // So does one the client's decline on a new deadline has stopped.
  if (order.rescheduleRequest?.workHeld) {
    return { label: "Paused", tone: "warning", icon: "clock" };
  }
  if (order.state === "rider_assigned") {
    const check = counterCheck(order);
    if (check && check.stage !== "passed") {
      return { label: check.status, tone: check.tone, icon: check.icon };
    }
  }
  return ridersPack(order)
    ? presentRiderPacksStatus(order) ?? presentOrderState(order.state, order)
    : presentOrderState(order.state, order);
}

/**
 * The chip on the newer handover, where the state alone says the wrong thing:
 * `supplier_self_qc` is GRIDGO's review, not packing, and a rider at the
 * counter is checking, then waiting on the shop to pack, then on its signature.
 */
function presentRiderPacksStatus(
  order: Pick<Order, "state" | "handoverFlow" | "shopHandover" | "pickupChecklist"> &
    Partial<Pick<Order, "supplierId" | "riderId">>,
): StatePresentation | null {
  const finished = finishedStage(order);
  if (finished?.stage === "not_sent" && finished.correction) {
    return { label: "Needs a fix", tone: "warning", icon: "triangle-alert" };
  }
  if (finished?.stage === "in_review" || finished?.stage === "with_gridgo") {
    return { label: "GRIDGO reviewing", tone: "info", icon: "clock" };
  }
  if (finished?.stage === "approved") return { label: "Approved", tone: "success", icon: "circle-check" };
  if (order.state === "ready_for_dispatch") {
    return { label: "Ready for rider pickup", tone: "success", icon: "circle-check" };
  }
  const counter = riderPacking(order);
  if (counter?.step === "pack") return { label: "Pack it now", tone: "warning", icon: "clock" };
  if (counter?.step === "sign") return { label: "Sign to hand over", tone: "warning", icon: "square-pen" };
  return null;
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
export function actionsForJob(order: JobActionOrder, now: Date = new Date()): SupplierAction[] {
  if (refundStanding(order) !== "none") return [];
  // A job the shop let go, or one a declined deadline request stopped, is held
  // by GRIDGO while the client chooses; it refuses every step.
  if (shopRelease(order)) return [];
  if (order.rescheduleRequest && rescheduleNotice(order.rescheduleRequest).stopped) return [];
  // The hour to answer has run out; GRIDGO would refuse a late acceptance.
  if (acceptWindow(order, now).kind === "expired") return [];
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
          // Its own route, not a transition: it carries a required reason.
          targetState: null,
          primary: false,
          destructive: true,
          consequence:
            "The job goes back to GRIDGO and is not offered to your shop again. It goes on your shop's record.",
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
      if (ridersPack(order)) return riderPacksSteps(order, proofStep);
      // A claim, or a stop the shop cannot lift, stands in the way: GRIDGO
      // would refuse every packing step, so none is offered. The job's
      // checklist says what is holding it and who can clear it.
      if (packagingHeld(packagingCheck(order))) return proofStep ? [proofStep] : [];
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
      if (needsPackingPhoto(order)) {
        return demote(proofStep, {
          kind: "add_packing_photo", label: "Add a packing photo", targetState: null,
          primary: true, consequence: "Show the finished prints packed and ready. The client and Operations can see the photo.",
          resultLabel: "Packing photo sent",
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

/**
 * The shop's steps before pickup on the newer handover (`lib/shopHandover.ts`).
 *
 * There is no packing photo and no packing at all yet: the shop sends photos
 * of the finished, unpacked products, waits for GRIDGO's review, and only then
 * marks the job ready for rider pickup — with packing materials prepared and
 * the products still unpacked, because the rider checks them first.
 */
function riderPacksSteps(order: JobActionOrder, proofStep: SupplierAction | null): SupplierAction[] {
  if (packagingHeld(packagingCheck(order))) return proofStep ? [proofStep] : [];
  const finished = finishedStage(order);
  if (finished?.stage === "not_sent") {
    return demote(proofStep, {
      kind: "send_finished_photos",
      label: finished.correction ? "Send new finished photos" : "Send finished photos",
      targetState: null,
      primary: true,
      consequence:
        "GRIDGO checks photos of the finished, unpacked products before a rider is called. Your production time pauses while it reviews.",
      resultLabel: "Sent for review",
    });
  }
  if (finished?.stage === "approved") {
    return demote(proofStep, {
      kind: "ready_for_pickup",
      label: "Ready for rider pickup",
      targetState: "ready_for_dispatch",
      primary: true,
      consequence: `Riders are notified. ${DO_NOT_PACK_YET}`,
      resultLabel: "Ready for rider pickup",
    });
  }
  // GRIDGO is reviewing, or holds the step itself: nothing forward is the shop's.
  return proofStep ? [proofStep] : [];
}

/** What `actionsForJob` reads. Every field but the state may be absent on an older API. */
export type JobActionOrder = Pick<
  Order,
  | "state"
  | "handoverFlow"
  | "shopHandover"
  | "payoutMilestones"
  | "payoutHold"
  | "refundHold"
  | "refundDisposition"
  | "productionProgress"
  | "packingProgress"
  | "transitionReadiness"
  | "shopAcceptance"
  | "shopRecovery"
  | "rescheduleRequest"
> &
  Partial<Pick<Order, "supplierId">>;

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
  | "/job/[id]/progress-photo"
  | "/job/[id]/finished";

/** The flow screen an action opens. Nothing state-changing is a bare row tap. */
export function routeForAction(kind: SupplierActionKind): SupplierActionRoute {
  switch (kind) {
    case "accept":
      return "/job/[id]/accept";
    case "decline":
      return "/job/[id]/decline";
    case "add_proof":
      return "/job/[id]/fulfilment";
    case "add_packing_photo":
    case "ready_for_pickup":
      return "/job/[id]/handoff";
    case "add_production_photo":
      return "/job/[id]/progress-photo";
    case "send_finished_photos":
      return "/job/[id]/finished";
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

/**
 * The journey's step names on the newer handover, where packing moved from
 * the shop's floor to the counter: production ends in GRIDGO's review, and the
 * pickup is where the job is packed.
 */
export function journeyLabel(id: (typeof JOB_JOURNEY)[number]["id"], flow: HandoverFlow = "legacy"): string {
  if (flow === "rider_packs" && id === "production") return "Production & review";
  if (flow === "rider_packs" && id === "pickup") return "Pickup & packing";
  return JOB_JOURNEY.find((step) => step.id === id)?.label ?? "";
}

/** Index into `JOB_JOURNEY`, or -1 when the job left the supplier's path. */
export function journeyIndex(state: string): number {
  return JOB_JOURNEY.findIndex((step) => step.states.some((s) => s === state));
}

export function primaryAction(
  order: JobActionOrder,
  now: Date = new Date(),
): SupplierAction | null {
  return actionsForJob(order, now).find((a) => a.primary) ?? null;
}

/** Jobs still waiting on the supplier to accept or decline. */
export function isAwaitingDecision(order: Pick<Order, "state">): boolean {
  return order.state === "supplier_assigned";
}

/** No deadline countdown once fulfilment has ended, even if payouts remain. */
export function isFulfilmentFinished(order: Pick<Order, "state" | "refundDisposition">): boolean {
  return Boolean(order.refundDisposition) || [
    "cancelled",
    "delivered",
    "issue_window_open",
    "completed",
    "payout_released",
  ].includes(order.state);
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
  flow: HandoverFlow = "legacy",
): { title: string; body: string } {
  if (flow === "rider_packs") {
    const newer = riderPacksWaiting(state);
    if (newer) return newer;
  }
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

/** Whose move it is on the newer handover, where it differs from the older one. */
function riderPacksWaiting(state: string): { title: string; body: string } | null {
  switch (state) {
    case "supplier_self_qc":
      return {
        title: "GRIDGO is checking your finished products",
        body: "Operations is reviewing your photos of the finished, unpacked products. Your production time is paused until it answers. Do not pack yet.",
      };
    case "ready_for_dispatch":
      return {
        title: "Waiting on a rider",
        body: `Riders have been notified. ${DO_NOT_PACK_YET}`,
      };
    case "rider_assigned":
      return {
        title: "Rider on the way",
        body: "Keep the products unpacked and your packing materials ready. The rider checks the unpacked products first, then you pack in front of them and sign on their phone.",
      };
    default:
      return null;
  }
}

/**
 * Whose move it is on this job: `waitingOn` for the job's own handover, with
 * the counter's current step when a rider is there on the newer one.
 */
export function waitingOnJob(
  order: Pick<Order, "state" | "handoverFlow" | "shopHandover" | "pickupChecklist"> &
    Partial<Pick<Order, "supplierId" | "riderId">>,
  plan: PayoutPlanVersion = CURRENT_PAYOUT_PLAN,
): { title: string; body: string } {
  const counter = riderPacking(order);
  if (counter?.step === "pack") {
    return {
      title: "Pack it now, in front of the rider",
      body: "Every check on the unpacked products passed. Pack the job at the counter while the rider watches; the rider photographs the packed job.",
    };
  }
  if (counter?.step === "sign") {
    return {
      title: "Sign on the rider's phone",
      body: "The rider photographed the packed job. Your signature on their phone hands it over; until then it stays with your shop.",
    };
  }
  if (counter?.arrivedPacked) {
    return {
      title: "Unpack it for the rider's check",
      body: "Keep the products unpacked until every check passes. Then you pack in front of the rider and sign on their phone.",
    };
  }
  return waitingOn(order.state, plan, handoverFlowOf(order));
}

/** Timeline row label — actor-facing, never the raw user id alone. */
export function presentTimelineActor(by: unknown): string {
  if (typeof by !== "string" || !by.trim()) return "GRIDGO";
  if (by === "system") return "GRIDGO";
  if (by === "user_client") return "Client";
  if (by === "user_supplier") return "You";
  if (by === "user_rider") return "Rider";
  if (by === "user_ops" || by === "user_admin") return "Operations";
  if (by.startsWith("user_")) return "Team";
  return by;
}

export function presentTimelineState(state: string, flow: HandoverFlow = "legacy"): string {
  // On the newer handover this state is GRIDGO's review of the finished products, not packing.
  if (flow === "rider_packs" && state === "supplier_self_qc") return "Finished, with GRIDGO";
  if (flow === "rider_packs" && state === "ready_for_dispatch") return "Ready for rider pickup";
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
  return presentRefundTimelineNote(presentCheckCodes(note)).replace(
    PAYOUT_STAGE_CODES,
    (code) => milestoneDefinition(code as MilestoneCode).label,
  );
}

/**
 * Payout stage codes an older GRIDGO left in a note ("Proof filed for
 * production_started"). GRIDGO now writes the stage's own name; this keeps an
 * older note from showing a shop the internal label (report 6C695C15).
 */
const PAYOUT_STAGE_CODES = /\b(production_started|packaging_qc|issue_window)\b/g;
