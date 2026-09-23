import type { Order } from "@/lib/api";
import { actionsForJob } from "@/lib/jobState";

/**
 * What the shop still owes, in shop words, from the live job.
 *
 * Proof comes first when that is the yellow step. Otherwise the line follows
 * where the job is standing.
 */
export function owedProductionMove(
  order: Pick<Order, "state" | "payoutMilestones" | "payoutHold"> | null | undefined,
  fallbackState?: string | null,
): string {
  if (order) {
    const proof = actionsForJob(order)[0];
    if (proof?.kind === "add_proof" && proof.milestoneCode === "printing") {
      return "Update the press or file printing proof";
    }
    if (proof?.kind === "add_proof" && proof.milestoneCode === "packaging_qc") {
      return "Pack it or file packaging proof";
    }
    if (order.state === "payment_authorized") return "Start production";
    if (order.state === "supplier_self_qc") return "Pack it or file packaging proof";
    return "Update the press or file printing proof";
  }
  if (fallbackState === "payment_authorized") return "Start production";
  if (fallbackState === "supplier_self_qc") return "Pack it or file packaging proof";
  return "Update the press or file printing proof";
}

/** Where Open job goes. The same job screen the rest of the inbox already uses. */
export function jobScreenHref(orderId: string): { pathname: "/job/[id]"; params: { id: string } } {
  return { pathname: "/job/[id]", params: { id: orderId } };
}
