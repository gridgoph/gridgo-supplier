import type { Order } from "@/lib/api";
import { actionsForJob } from "@/lib/jobState";
import { findMilestoneView, payoutPlanOf } from "@/lib/milestones";

/**
 * What the shop still owes, in shop words, from the live job.
 *
 * Proof comes first when that is the yellow step. Otherwise the line follows
 * where the job is standing. Only a legacy (plan 1) job has a printing or
 * packaging proof to name; without the job, the plan is unknown, so the line
 * names the press and the pack and no proof at all.
 */
export function owedProductionMove(
  order:
    | Pick<Order, "state" | "payoutMilestones" | "payoutHold" | "payoutPlanVersion">
    | null
    | undefined,
  fallbackState?: string | null,
): string {
  if (order) {
    const proof = actionsForJob(order)[0];
    if (proof?.kind === "add_proof" && proof.milestoneCode) {
      if (proof.milestoneCode === "packaging_qc") return "Pack it or file packaging proof";
      const owed = findMilestoneView(order as Order, proof.milestoneCode);
      return `Update the press or file ${owed?.proofName ?? "your"} proof`;
    }
    if (order.state === "payment_authorized") return "Start production";
    const legacy = payoutPlanOf(order) === 1;
    if (order.state === "supplier_self_qc") {
      return legacy ? "Pack it or file packaging proof" : "Pack it for pickup";
    }
    return legacy ? "Update the press or file printing proof" : "Update the press or pack it for pickup";
  }
  if (fallbackState === "payment_authorized") return "Start production";
  if (fallbackState === "supplier_self_qc") return "Pack it for pickup";
  return "Update the press or pack it for pickup";
}

/** Where Open job goes. The same job screen the rest of the inbox already uses. */
export function jobScreenHref(orderId: string): { pathname: "/job/[id]"; params: { id: string } } {
  return { pathname: "/job/[id]", params: { id: orderId } };
}
