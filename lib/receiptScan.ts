import type { Order } from "@/lib/api";

/**
 * The shop's own receipt or invoice for an order, scanned before a rider is
 * called (gridgo-api `docs/SHOP_RECEIPT_SCAN_API.md`, gridgo-supplier#64).
 *
 * This is the paper the shop already keeps from its own records, sent as a
 * photo or PDF so Operations sees it at once instead of at the monthly paper
 * collection. It is never a receipt GRIDGO issues, and no copy here may call
 * it official.
 *
 * GRIDGO decides whether it is needed: a Finance switch, off by default. Off,
 * nothing about calling a rider changes. On, "Ready for dispatch" waits until a
 * scan is on the job — this module is the only place that reads the switch's
 * answer (`transitionReadiness.ready_for_dispatch.receiptScan`).
 */

export type ReceiptScan = { required: boolean; attached: boolean };

/** GRIDGO's upload limit for a scan (`supplier_invoice`): 15 MiB. */
export const RECEIPT_SCAN_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Why "Ready for dispatch" waits, when GRIDGO sent no sentence of its own.
 * GRIDGO's own (in `missing` and in its refusal) is the same idea in its words.
 */
export const RECEIPT_SCAN_NEEDED =
  "Scan or upload this order's shop invoice or receipt and attach it before calling a rider. GRIDGO needs the scan before dispatch.";

type ScanOrder = Pick<Order, "state" | "transitionReadiness">;

/** Where the scan stands for a job on the shop's floor, or null when GRIDGO said nothing. */
export function receiptScanOf(order: ScanOrder): ReceiptScan | null {
  if (order.state !== "production" && order.state !== "supplier_self_qc") return null;
  const raw = order.transitionReadiness?.ready_for_dispatch?.receiptScan;
  if (!raw || typeof raw !== "object") return null;
  return { required: raw.required === true, attached: raw.attached === true };
}

/** GRIDGO will not take "Ready for dispatch" until a scan is attached. */
export function owesReceiptScan(order: ScanOrder): boolean {
  const scan = receiptScanOf(order);
  return Boolean(scan?.required && !scan.attached);
}
