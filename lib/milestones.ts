import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";
import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * The four parts a shop is paid in, and the evidence each one waits on.
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
 * Who provides which proof is fixed by the platform: the shop for printing and
 * packing, the rider for delivery, and retention inherits the rider's delivered
 * proof rather than taking one of its own.
 */

export type ProofOwner = "shop" | "rider" | "inherited";

export type MilestoneDefinition = {
  code: MilestoneCode;
  /** What the shop calls this part of the job. */
  label: string;
  /** The evidence that releases it, in the shop's own words. */
  proofLabel: string;
  /** Who has to produce that evidence. */
  proofOwner: ProofOwner;
  /** What the shop should photograph, when the proof is theirs to file. */
  proofHint: string;
};

/** Order matters: this is the sequence money is released in. */
export const MILESTONES: readonly MilestoneDefinition[] = [
  {
    code: "printing",
    label: "Printing",
    proofLabel: "Photo of the printed run",
    proofOwner: "shop",
    proofHint:
      "Show the finished print on your floor — enough of it to recognise the job, with the colour and the trim readable.",
  },
  {
    code: "packaging_qc",
    label: "Packing & quality check",
    proofLabel: "Photo of the packed job",
    proofOwner: "shop",
    proofHint:
      "Show the job boxed or wrapped as the rider will collect it, labelled and ready to move on a motorcycle.",
  },
  {
    code: "delivered",
    label: "Delivered",
    proofLabel: "The rider's delivery evidence",
    proofOwner: "rider",
    proofHint: "",
  },
  {
    code: "retention",
    label: "Retention",
    proofLabel: "Carried over from the delivery evidence",
    proofOwner: "inherited",
    proofHint: "",
  },
] as const;

export function milestoneDefinition(code: MilestoneCode): MilestoneDefinition {
  return MILESTONES.find((m) => m.code === code) ?? MILESTONES[0];
}

/** The milestones a shop files evidence for itself. */
export const SHOP_PROOF_CODES: readonly MilestoneCode[] = ["printing", "packaging_qc"];

export function isShopProof(code: MilestoneCode): boolean {
  return SHOP_PROOF_CODES.includes(code);
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
  | "waiting_on_delivery";

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
  proofCount: number;
  /** True when this shop can file the evidence right now. */
  canAddProof: boolean;
};

/** Milestone codes the job's own state has not reached yet. */
function reachedForProof(code: MilestoneCode, state: string): boolean {
  const producing = new Set([
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
  if (code === "printing") return producing.has(state);
  if (code === "packaging_qc") return producing.has(state);
  return false;
}

export function viewMilestone(order: Order, milestone: PayoutMilestone): MilestoneView {
  const definition = milestoneDefinition(milestone.code);
  const held = order.payoutHold === true;
  const proofCount = milestone.pofFileIds?.length ?? 0;
  const shopProof = isShopProof(milestone.code);

  const base = {
    code: milestone.code,
    label: definition.label,
    sharePercent: milestone.sharePercent,
    amountMinor: milestone.amountMinor,
    proofCount,
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

  if (milestone.status === "pof_attached") {
    return {
      ...base,
      stage: "awaiting_release",
      statusLabel: "With GRIDGO",
      tone: "info",
      icon: "clock",
      detail:
        milestone.code === "retention"
          ? "Retention releases on its own once the client's window to report a problem closes."
          : "Your evidence is filed. GRIDGO reviews it and releases this part.",
      canAddProof: false,
    };
  }

  if (shopProof) {
    // "Proof needed" on a job that has not started printing reads as a job the
    // shop is behind on. It is not — there is nothing to photograph yet, and a
    // chip that asks for work nobody can do is the kind of thing a shop learns
    // to ignore, taking the real ones with it.
    if (!reachedForProof(milestone.code, order.state)) {
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
      milestone.code === "delivered"
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
  /** Everything the four parts add up to — the shop's own price. */
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
