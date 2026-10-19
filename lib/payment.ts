import type { Order } from "@/lib/api";

/**
 * Whether the client paid this job in one transfer, with no balance to come.
 *
 * New orders are paid 100% up front; older ones were split 75/25. The client's
 * money is not this app's business, but a chip that says "Downpayment in" on a
 * job the client paid in full contradicts what the client's own app tells them.
 * Same rule as gridgo-client `lib/payment.ts`: any one signal is enough — the
 * snapshotted percentage, a zero balance, or a balance marked `not_required`.
 */
export function paysInFull(
  order: Partial<Pick<Order, "payments" | "downpaymentPercent" | "balanceMinor">>,
): boolean {
  if (order.downpaymentPercent === 100) return true;
  if (order.balanceMinor === 0) return true;
  const balance = order.payments?.final_online ?? order.payments?.balance;
  return balance?.status === "not_required";
}
