import type { Order } from "@/lib/api";
import { awaitsCounterCode, expressView, isExpressDocumentOrder } from "@/lib/expressOrder";
import { actionsForJob, primaryAction, type SupplierActionKind, type SupplierActionRoute } from "@/lib/jobState";

/**
 * The words To do puts on a job (gridgo-supplier#269): how the client paid,
 * who collects it, how many pages, and the one button a row may carry.
 *
 * Ranking is not here. `lib/homeBoard.ts` decides what comes first; this file
 * only says what each card and row reads.
 */

/* -------------------------------------------------------------------------- */
/* How the client paid                                                         */

export type PaymentKind = "in_app" | "cash" | "voucher";

/**
 * How the client paid, from the method GRIDGO recorded on the first payment.
 *
 * The shop never sees the client's reference or proof — only the method, which
 * is what tells it whether cash changes hands at all. A method this app does
 * not know reads as nothing rather than a guess.
 */
export function paymentKind(order: Pick<Order, "paymentMethod" | "payments">): PaymentKind | null {
  const method = order.payments?.initial?.method ?? order.paymentMethod ?? null;
  if (method === "cash") return "cash";
  if (method === "gridgo_voucher") return "voucher";
  if (method === "qr_manual") return "in_app";
  return null;
}

const PAYMENT_LINE: Record<PaymentKind, string> = {
  in_app: "Paid in app",
  cash: "Cash to the rider",
  voucher: "Paid by voucher",
};

export function paymentLine(order: Pick<Order, "paymentMethod" | "payments">): string | null {
  const kind = paymentKind(order);
  return kind ? PAYMENT_LINE[kind] : null;
}

/**
 * Nothing to collect at the counter: only when GRIDGO says the client paid in
 * the app or by voucher. A missing or unknown method says nothing, because
 * "Don't collect cash" on a guess could cost the shop the job's money.
 */
export function alreadyPaidAtCounter(order: Pick<Order, "paymentMethod" | "payments">): boolean {
  const kind = paymentKind(order);
  return kind === "in_app" || kind === "voucher";
}

/* -------------------------------------------------------------------------- */
/* Who collects it, and what it is                                             */

export function fulfilmentLine(order: Pick<Order, "fulfillmentMode">): string {
  return order.fulfillmentMode === "delivery" ? "Rider delivers" : "Client picks up";
}

/** "24 pages · B&W" for an Express order; the job's own title for any other. */
export function workLine(
  order: Pick<Order, "title"> & Partial<Pick<Order, "orderType" | "expressOrder" | "fulfillmentMode">>,
): string {
  const view = expressView(order);
  if (!view) return order.title;
  const pages = view.totalPages == null ? null : view.totalPages === 1 ? "1 page" : `${view.totalPages} pages`;
  const colours = new Set(view.prints.map((print) => print.colour).filter(Boolean));
  const colour =
    colours.size === 1 ? (colours.has("bw") ? "B&W" : "Colour") : colours.size > 1 ? "B&W and colour" : null;
  const line = [pages, colour].filter(Boolean).join(" · ");
  return line || order.title;
}

/** Paper, sides and copies under the headline, when every file shares them. */
export function settingsLine(order: Partial<Pick<Order, "orderType" | "expressOrder" | "fulfillmentMode">>): string | null {
  const view = expressView(order);
  if (!view || !view.prints.length) return null;
  const prints = view.prints;
  const same = <T,>(pick: (p: (typeof prints)[number]) => T): T | null => {
    const first = pick(prints[0]);
    return prints.every((p) => pick(p) === first) ? first : null;
  };
  const paper = same((p) => p.paper);
  const sides = same((p) => p.sides);
  const copies = same((p) => p.copies);
  return (
    [
      paper ? ({ a4: "A4", short: "Short", long: "Long" } as Record<string, string>)[paper] ?? paper : null,
      sides === "two" ? "2 sides" : sides === "one" ? "1 side" : null,
      copies != null ? (copies === 1 ? "1 copy" : `${copies} copies`) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/* -------------------------------------------------------------------------- */
/* The one button a To do row may carry                                        */

export type QuickAction = {
  label: "Ready" | "Code" | "Photos";
  route: SupplierActionRoute;
  kind: SupplierActionKind;
};

const PHOTO_STEPS: SupplierActionKind[] = [
  "add_production_photo",
  "add_packing_photo",
  "send_finished_photos",
  "add_proof",
];

/**
 * Ready, Code or Photos, straight from the row (gridgo-supplier#269).
 *
 * Only these three: each opens the same step the job screen would, so nothing
 * on a row commits anything a shop has not seen. Accepting, declining and
 * every other step stay on the job.
 */
export function quickAction(order: Order, now: Date = new Date()): QuickAction | null {
  // The client is at the counter: the code comes before any photo owed, which waits for no one.
  if (awaitsCounterCode(order)) return { label: "Code", route: "/job/[id]/counter-code", kind: "enter_counter_code" };
  const action = primaryAction(order, now);
  if (!action) return null;
  if (action.kind === "enter_counter_code") return { label: "Code", route: "/job/[id]/counter-code", kind: action.kind };
  if (action.kind === "ready_for_pickup") return { label: "Ready", route: "/job/[id]/handoff", kind: action.kind };
  if (PHOTO_STEPS.includes(action.kind)) {
    const route: SupplierActionRoute =
      action.kind === "add_production_photo"
        ? "/job/[id]/progress-photo"
        : action.kind === "send_finished_photos"
          ? "/job/[id]/finished"
          : action.kind === "add_proof"
            ? "/job/[id]/fulfilment"
            : "/job/[id]/handoff";
    return { label: "Photos", route, kind: action.kind };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Express: the card on top                                                    */

export type ExpressStage = "offer" | "working" | "counter";

/**
 * Where an Express job stands for its card: still an offer, accepted and on
 * the press, or ready and waiting for the client's code.
 */
export function expressStage(order: Order): ExpressStage | null {
  if (!isExpressDocumentOrder(order)) return null;
  if (order.state === "supplier_assigned") return "offer";
  if (["payment_authorized", "production", "supplier_self_qc"].includes(order.state)) return "working";
  if (awaitsCounterCode(order)) return "counter";
  return null;
}

/**
 * The transitions behind "It's ready", in order.
 *
 * An accepted Express job is first put on the press, then marked ready —
 * GRIDGO keeps both steps, so one tap sends both. When GRIDGO wants something
 * else first (a photo, its own check), the list is empty and the card opens
 * that step instead.
 */
export function expressReadySteps(order: Order, now: Date = new Date()): string[] {
  if (expressStage(order) !== "working") return [];
  const actions = actionsForJob(order, now);
  if (order.state === "payment_authorized") {
    return actions.some((a) => a.kind === "start_production") ? ["production", "ready_for_dispatch"] : [];
  }
  // A photo owed for pay takes the job's yellow, but It's ready still means ready.
  return actions.some((a) => a.kind === "ready_for_pickup") ? ["ready_for_dispatch"] : [];
}

/**
 * When It's ready cannot send anything yet, the photo step GRIDGO wants on
 * the way to ready — never the pay evidence, which is a different errand.
 */
export function expressReadyPhotoStep(order: Order, now: Date = new Date()): SupplierActionKind | null {
  const kinds = actionsForJob(order, now).map((a) => a.kind);
  return (["send_finished_photos", "add_production_photo"] as const).find((kind) => kinds.includes(kind)) ?? null;
}

/** The timeline note each step leaves on the client's order. */
export const EXPRESS_STEP_NOTE: Record<string, string> = {
  production: "Printing",
  ready_for_dispatch: "Ready",
};

/** Things on To do, said as a count in the title. */
export function todoTitle(count: number): string {
  if (count === 0) return "All done for now";
  return count === 1 ? "1 thing to do" : `${count} things to do`;
}
