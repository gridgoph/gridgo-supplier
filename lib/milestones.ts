import type {
  MilestoneCode,
  Order,
  PayoutMilestone,
  PayoutPlanVersion,
  PayoutReleaseRequirement,
} from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * The parts a shop is paid in, and the evidence each one waits on.
 *
 * This is the only place that reads `payoutMilestones`. Two rules from the
 * platform shape every screen built on it, and neither is this app's to bend:
 *
 * - **Shares split the shop's own price**, never the client's total. GRIDGO's
 *   commission and the delivery fee sit outside the split entirely, and the
 *   commission is withheld from this app by the server — if an amount here ever
 *   looked like the client's total, the wrong field was read.
 * - **Nobody in this app releases money.** A shop attaches a Proof of
 *   Fulfilment; Operations reviews it and releases. So "done" here means
 *   *evidence filed*, and the screen must not imply the money has moved.
 *
 * Each order snapshots the plan it was committed under (`payoutPlanVersion`,
 * `docs/OPERATIONAL_MODEL_V2_API.md#supplier-payout-milestones` in gridgo-api):
 * plan 2 pays 40% at the start of production on the shop's photo, 35% on the
 * rider's delivery evidence and 25% once the client's window to report a
 * problem closes; plan 1, every older order, pays printing, packaging,
 * delivered and retention. Stages render in the API's order with the API's
 * `label`, and who owes the evidence comes from `releaseRequires` — the table
 * below only supplies proof wording and a fallback for an older API that sent
 * neither. A code it does not know is never borrowed from another stage.
 */

/**
 * Who has to produce a part's evidence: the shop, the rider, nobody because
 * it rides on the delivered proof (legacy retention), or nobody because it
 * waits on the client's window closing (plan 2).
 */
export type ProofOwner = "shop" | "rider" | "inherited" | "window";

export type MilestoneDefinition = {
  code: MilestoneCode;
  /** What the shop calls this part of the job, when GRIDGO sent no label. */
  label: string;
  /** The evidence that releases it, in the shop's own words. */
  proofLabel: string;
  /** Who has to produce that evidence. */
  proofOwner: ProofOwner;
  /** What the shop should photograph, when the proof is theirs to file. */
  proofHint: string;
  /** The proof in a button: "Add {proofName} proof". */
  proofName: string;
};

/** Every stage either plan has used, keyed by its code. Not a sequence. */
const KNOWN_MILESTONES: readonly MilestoneDefinition[] = [
  {
    code: "production_started",
    label: "Start of production",
    proofLabel: "Photo that production has started",
    proofOwner: "shop",
    proofHint:
      "Show this job under way on your floor — the loaded material, the first sheets off the press, or the set-up — enough of it to recognise the job.",
    proofName: "start-of-production",
  },
  {
    code: "printing",
    label: "Printing",
    proofLabel: "Photo of the printed run",
    proofOwner: "shop",
    proofHint:
      "Show the finished print on your floor — enough of it to recognise the job, with the colour and the trim readable.",
    proofName: "printing",
  },
  {
    code: "packaging_qc",
    label: "Packaging",
    proofLabel: "Photo of the packed job",
    proofOwner: "shop",
    proofHint:
      "Show the job boxed or wrapped as the rider will collect it, labelled and ready to move on a motorcycle.",
    proofName: "packaging",
  },
  {
    code: "delivered",
    label: "Delivered",
    proofLabel: "The rider's delivery evidence",
    proofOwner: "rider",
    proofHint: "",
    proofName: "delivery",
  },
  {
    code: "retention",
    label: "Retention",
    proofLabel: "Carried over from the delivery evidence",
    proofOwner: "inherited",
    proofHint: "",
    proofName: "retention",
  },
  {
    code: "issue_window",
    label: "Issue window closed",
    proofLabel: "No file — the client's window to report a problem closing",
    proofOwner: "window",
    proofHint: "",
    proofName: "issue window",
  },
];

/** Codes only the four-stage plan used. Their presence marks a plan-1 order. */
const LEGACY_ONLY_CODES: readonly MilestoneCode[] = ["printing", "packaging_qc", "retention"];

/** The plan every new commitment is placed under. */
export const CURRENT_PAYOUT_PLAN: PayoutPlanVersion = 2;

/**
 * The plan this order pays under. An API that predates the field sends the
 * four legacy codes, so those mark plan 1; an order with no stages yet will be
 * committed under the current plan.
 */
export function payoutPlanOf(order: Pick<Order, "payoutMilestones" | "payoutPlanVersion">): PayoutPlanVersion {
  if (order.payoutPlanVersion === 1 || order.payoutPlanVersion === 2) return order.payoutPlanVersion;
  const legacy = (order.payoutMilestones ?? []).some((m) => LEGACY_ONLY_CODES.includes(m.code));
  return legacy ? 1 : CURRENT_PAYOUT_PLAN;
}

function ownerFor(code: MilestoneCode, requires: PayoutReleaseRequirement | null | undefined): ProofOwner | null {
  if (requires === "shop_proof") return "shop";
  if (requires === "delivery_proof") return "rider";
  if (requires === "issue_window_closed") return code === "retention" ? "inherited" : "window";
  return null;
}

/** "some_stage" → "Some stage", for a code GRIDGO sent with no label. */
function humanizeCode(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Payout";
}

/**
 * The wording for one stage. GRIDGO's own `label` and `releaseRequires` win
 * whenever they arrive; a code this app has never seen gets neutral words
 * rather than another stage's, so a new plan can never read as "Printing".
 */
export function milestoneDefinition(
  code: MilestoneCode,
  from: Pick<PayoutMilestone, "label" | "releaseRequires"> = {},
): MilestoneDefinition {
  const known = KNOWN_MILESTONES.find((m) => m.code === code);
  const label = from.label?.trim() || known?.label || humanizeCode(code);
  const owner = ownerFor(code, from.releaseRequires) ?? known?.proofOwner ?? "window";
  if (known && known.proofOwner === owner) return { ...known, label };
  return {
    code,
    label,
    proofLabel:
      owner === "shop"
        ? `Photo for ${label.toLowerCase()}`
        : owner === "rider"
          ? "The rider's delivery evidence"
          : "No file for this part",
    proofOwner: owner,
    proofHint: owner === "shop" ? "Show the work this part of the job pays for, enough of it to recognise the job." : "",
    proofName: label.toLowerCase(),
  };
}

/** True when this shop files the evidence for this part itself. */
export function isShopProof(milestone: Pick<PayoutMilestone, "code" | "label" | "releaseRequires">): boolean {
  return milestoneDefinition(milestone.code, milestone).proofOwner === "shop";
}

/**
 * What a milestone is waiting on, from this shop's point of view.
 *
 * `held` outranks everything unreleased: while a claim is open, filing more
 * evidence changes nothing, and a screen that still said "awaiting release"
 * would be quietly wrong about why the money has not arrived.
 */
export type MilestoneStage =
  | "released"
  | "held"
  | "awaiting_release"
  | "needs_shop_proof"
  /** The shop's to evidence, but the job has not got there yet. */
  | "not_reached"
  | "waiting_on_delivery"
  /** Plan 2's last part: nothing to file, waiting on the client's window. */
  | "waiting_on_window";

export type MilestoneView = {
  code: MilestoneCode;
  label: string;
  sharePercent: number;
  amountMinor: number;
  stage: MilestoneStage;
  statusLabel: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** One sentence naming whose move it is. */
  detail: string;
  /** Who produces this part's evidence. */
  proofOwner: ProofOwner;
  /** The proof in a button: "Add {proofName} proof". */
  proofName: string;
  proofCount: number;
  /** Proof of Fulfilment files GRIDGO holds for this part. */
  pofFileIds: string[];
  /** True when this shop can file the evidence right now. */
  canAddProof: boolean;
  /** The wallet receipt Operations kept when this part was sent. Null until released with one. */
  receiptFileId: string | null;
  /** The wallet's reference for that transfer. Null until released with one. */
  reference: string | null;
};

/** Production or later: a shop's own evidence has something to photograph. */
const PRODUCING = new Set([
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "awaiting_collection",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/** The client has the job and may still report a problem. */
const WINDOW_OPEN = new Set(["delivered", "issue_window_open"]);
/** The window has closed with nothing held: Operations may release the last part. */
const WINDOW_CLOSED = new Set(["completed", "payout_released"]);

export function viewMilestone(order: Order, milestone: PayoutMilestone): MilestoneView {
  const definition = milestoneDefinition(milestone.code, milestone);
  const held = order.payoutHold === true;
  const pofFileIds = milestone.pofFileIds ?? [];
  const proofCount = pofFileIds.length;
  const owner = definition.proofOwner;

  const base = {
    code: milestone.code,
    label: definition.label,
    sharePercent: milestone.sharePercent,
    amountMinor: milestone.amountMinor,
    proofOwner: owner,
    proofName: definition.proofName,
    proofCount,
    pofFileIds,
    receiptFileId: milestone.status === "released" ? (milestone.receiptFileId ?? null) : null,
    reference: milestone.status === "released" ? (milestone.reference ?? null) : null,
  };

  if (milestone.status === "released") {
    return {
      ...base,
      stage: "released",
      statusLabel: "Released",
      tone: "success",
      icon: "circle-check",
      detail: "GRIDGO has released this part of your earnings.",
      canAddProof: false,
    };
  }

  if (held) {
    return {
      ...base,
      stage: "held",
      statusLabel: "Held",
      tone: "error",
      icon: "triangle-alert",
      detail:
        "The client has reported a problem with this job, so GRIDGO is holding what is left of your earnings until it is settled.",
      canAddProof: false,
    };
  }

  // Plan 2's last part takes no file: it stays `pending_pof` until Operations
  // releases it, so its status says nothing about the window. The job does.
  if (owner === "window") {
    if (WINDOW_CLOSED.has(order.state)) {
      return {
        ...base,
        stage: "awaiting_release",
        statusLabel: "With GRIDGO",
        tone: "info",
        icon: "clock",
        detail:
          "The client's window to report a problem has closed. GRIDGO reviews the job and releases this part.",
        canAddProof: false,
      };
    }
    return {
      ...base,
      stage: "waiting_on_window",
      statusLabel: WINDOW_OPEN.has(order.state) ? "Window open" : "After delivery",
      tone: "neutral",
      icon: "clock",
      detail: WINDOW_OPEN.has(order.state)
        ? "The client can still report a problem. This part can be released once that window closes with nothing reported. Nothing for you to file."
        : "This part can be released once the client has the job and their window to report a problem closes. Nothing for you to file.",
      canAddProof: false,
    };
  }

  if (milestone.status === "pof_attached") {
    return {
      ...base,
      stage: "awaiting_release",
      statusLabel: "With GRIDGO",
      tone: "info",
      icon: "clock",
      detail:
        owner === "inherited"
          ? "Retention releases on its own once the client's window to report a problem closes."
          : owner === "rider"
            ? "The rider's delivery evidence is filed. GRIDGO reviews it and releases this part."
            : "Your evidence is filed. GRIDGO reviews it and releases this part.",
      canAddProof: false,
    };
  }

  if (owner === "shop") {
    // "Proof needed" on a job that has not started production reads as a job
    // the shop is behind on. It is not — there is nothing to photograph yet,
    // and a chip that asks for work nobody can do is the kind of thing a shop
    // learns to ignore, taking the real ones with it.
    if (!PRODUCING.has(order.state)) {
      return {
        ...base,
        stage: "not_reached",
        statusLabel: "Not started",
        tone: "neutral",
        icon: "clock",
        detail: `${definition.proofLabel} releases this part, once the job gets there.`,
        canAddProof: false,
      };
    }
    return {
      ...base,
      stage: "needs_shop_proof",
      statusLabel: "Proof needed",
      tone: "warning",
      icon: "square-pen",
      detail: `${definition.proofLabel} releases this part. GRIDGO cannot pay it without one.`,
      canAddProof: true,
    };
  }

  return {
    ...base,
    stage: "waiting_on_delivery",
    statusLabel: "After delivery",
    tone: "neutral",
    icon: "clock",
    detail:
      owner === "rider"
        ? "The rider's delivery evidence releases this part. Nothing for you to file."
        : "Retention rides on the same delivery evidence, and releases after the client's window to report a problem closes.",
    canAddProof: false,
  };
}

export function milestoneViews(order: Order): MilestoneView[] {
  return (order.payoutMilestones ?? []).map((milestone) => viewMilestone(order, milestone));
}

/** The next proof this shop owes on a job, or null when it owes none. */
export function nextShopProof(order: Order): MilestoneView | null {
  return milestoneViews(order).find((view) => view.canAddProof) ?? null;
}

export function findMilestoneView(
  order: Order,
  code: string | undefined,
): MilestoneView | null {
  if (!code) return null;
  return milestoneViews(order).find((view) => view.code === code) ?? null;
}

/**
 * How a job pays out, before GRIDGO has split it into parts, in the words of
 * the plan it will be — or was — committed under.
 */
export function payoutPlanCopy(order: Pick<Order, "payoutMilestones" | "payoutPlanVersion">): {
  /** "paid in {parts} parts". */
  parts: string;
  /** One or two sentences: what each part waits on, and what the shop files. */
  howItReachesYou: string;
} {
  if (payoutPlanOf(order) === 1) {
    return {
      parts: "four",
      howItReachesYou:
        "In four parts as the job moves — printing, packaging, delivery, and a retention part that lands once the client's window to report a problem closes. Each needs evidence before it is released, and you file the first two here.",
    };
  }
  return {
    parts: "three",
    howItReachesYou:
      "In three parts as the job moves — 40% once you file a photo that production has started, 35% on the rider's delivery evidence, and 25% once the client's window to report a problem closes with nothing reported. Operations releases each part, and the first one's evidence is yours to file here.",
  };
}

/**
 * What a job is worth to this shop, split by where each part has got to.
 *
 * `needsProofMinor` is the sharp one and it means exactly one thing: money the
 * shop could release **today** by photographing something. A part the job has
 * not reached, and the rider's delivered share, are not that — they belong in
 * `laterMinor`. Folding them together was quietly telling a shop that a print
 * run it has not started is evidence it owes, which is how a real warning
 * learns to be ignored.
 */
export type EarningsSplit = {
  /** Everything the parts add up to — the shop's own price. */
  totalMinor: number;
  releasedMinor: number;
  awaitingReleaseMinor: number;
  /** Only what this shop can evidence right now. */
  needsProofMinor: number;
  /** Not reached yet, or the rider's to evidence. Nothing for the shop to do. */
  laterMinor: number;
  heldMinor: number;
  /** True when a claim is holding whatever has not been released. */
  held: boolean;
};

export function earningsSplit(order: Order): EarningsSplit {
  const split: EarningsSplit = {
    totalMinor: 0,
    releasedMinor: 0,
    awaitingReleaseMinor: 0,
    needsProofMinor: 0,
    laterMinor: 0,
    heldMinor: 0,
    held: order.payoutHold === true,
  };

  for (const view of milestoneViews(order)) {
    split.totalMinor += view.amountMinor;
    if (view.stage === "released") split.releasedMinor += view.amountMinor;
    else if (view.stage === "held") split.heldMinor += view.amountMinor;
    else if (view.stage === "awaiting_release") split.awaitingReleaseMinor += view.amountMinor;
    else if (view.stage === "needs_shop_proof") split.needsProofMinor += view.amountMinor;
    else split.laterMinor += view.amountMinor;
  }

  return split;
}

export function addSplits(splits: EarningsSplit[]): EarningsSplit {
  return splits.reduce<EarningsSplit>(
    (sum, s) => ({
      totalMinor: sum.totalMinor + s.totalMinor,
      releasedMinor: sum.releasedMinor + s.releasedMinor,
      awaitingReleaseMinor: sum.awaitingReleaseMinor + s.awaitingReleaseMinor,
      needsProofMinor: sum.needsProofMinor + s.needsProofMinor,
      laterMinor: sum.laterMinor + s.laterMinor,
      heldMinor: sum.heldMinor + s.heldMinor,
      held: sum.held || s.held,
    }),
    {
      totalMinor: 0,
      releasedMinor: 0,
      awaitingReleaseMinor: 0,
      needsProofMinor: 0,
      laterMinor: 0,
      heldMinor: 0,
      held: false,
    },
  );
}
