import type { Order } from "@/lib/api";
import { buildTodo } from "@/lib/homeBoard";
import {
  alreadyPaidAtCounter,
  expressReadySteps,
  expressStage,
  fulfilmentLine,
  paymentLine,
  quickAction,
  settingsLine,
  todoTitle,
  workLine,
} from "@/lib/todo";

const NOW = new Date("2026-11-21T02:00:00.000Z");
const print = { fileId: "f", pages: { total: 24, range: null, printed: 24 }, copies: 1, colour: "bw", paper: "a4", sides: "one", layout: "fit_to_paper", note: "" };

function express(overrides: Partial<Order> & Record<string, unknown> = {}): Order {
  return {
    id: "ord_express",
    title: "Express documents",
    state: "supplier_assigned",
    orderType: "express",
    fulfillmentMode: "pickup",
    supplierPriceMinor: 7200,
    paymentMethod: "qr_manual",
    payments: { initial: { method: "qr_manual", status: "confirmed" } },
    expressOrder: { status: "sending", printSettings: [print], events: [] },
    shopAcceptance: { assignedAt: "2026-11-21T01:58:00.000Z", deadlineAt: "2026-11-21T02:03:00.000Z", workingMinutes: 5, status: "pending" },
    timeline: [],
    ...overrides,
  } as unknown as Order;
}

function regular(overrides: Partial<Order> & Record<string, unknown> = {}): Order {
  return {
    id: "ord_regular",
    title: "Flyers",
    state: "ready_for_dispatch",
    fulfillmentMode: "delivery",
    paymentMethod: "cash",
    payments: { initial: { method: "cash", status: "confirmed" } },
    timeline: [],
    readyBy: "2026-11-21T06:00:00.000Z",
    ...overrides,
  } as unknown as Order;
}

describe("how the client paid", () => {
  it("names in-app, cash to the rider and voucher, and nothing it does not know", () => {
    expect(paymentLine(express())).toBe("Paid in app");
    expect(paymentLine(regular())).toBe("Cash to the rider");
    expect(paymentLine(express({ payments: { initial: { method: "gridgo_voucher" } } } as never))).toBe("Paid by voucher");
    expect(paymentLine(express({ paymentMethod: null, payments: {} } as never))).toBeNull();
  });

  it("only cash is collected; everything else is already paid at the counter", () => {
    expect(alreadyPaidAtCounter(express())).toBe(true);
    expect(alreadyPaidAtCounter(regular())).toBe(false);
  });
});

describe("what an Express card says", () => {
  it("reads pages and colour, paper, sides and copies", () => {
    expect(workLine(express())).toBe("24 pages · B&W");
    expect(settingsLine(express())).toBe("A4 · 1 side · 1 copy");
    expect(fulfilmentLine(express())).toBe("Client picks up");
    expect(workLine(regular())).toBe("Flyers");
  });

  it("knows each stage", () => {
    expect(expressStage(express())).toBe("offer");
    expect(expressStage(express({ state: "payment_authorized" }))).toBe("working");
    expect(expressStage(express({ state: "ready_for_dispatch" }))).toBe("counter");
    expect(expressStage(regular())).toBeNull();
  });
});

describe("It's ready", () => {
  it("puts an accepted job on the press and marks it ready in one tap", () => {
    expect(expressReadySteps(express({ state: "payment_authorized" }), NOW)).toEqual(["production", "ready_for_dispatch"]);
    expect(expressReadySteps(express({ state: "production" }), NOW)).toEqual(["ready_for_dispatch"]);
  });

  it("sends nothing when GRIDGO wants a photo first", () => {
    const waiting = express({ state: "production", productionProgress: { status: "waiting_for_photo", required: true } } as never);
    expect(expressReadySteps(waiting, NOW)).toEqual([]);
  });

  it("sends nothing for an offer", () => {
    expect(expressReadySteps(express(), NOW)).toEqual([]);
  });
});

describe("row buttons", () => {
  it("offers Code for an Express job waiting at the counter", () => {
    expect(quickAction(express({ state: "ready_for_dispatch" }), NOW)?.label).toBe("Code");
  });

  it("offers Code before a photo owed: the client is standing at the counter", () => {
    const owed = express({
      state: "ready_for_dispatch",
      payoutMilestones: [{ code: "production_started", label: "Production started", status: "pending", amountMinor: 1440, releaseRequires: "supplier_evidence" }],
    } as never);
    expect(quickAction(owed, NOW)?.label).toBe("Code");
  });

  it("offers Ready for a regular job ready to pack, on today's handoff screen", () => {
    const quick = quickAction(regular({ state: "production" }), NOW);
    expect(quick).toMatchObject({ label: "Ready", route: "/job/[id]/handoff" });
  });

  it("offers nothing for a decision", () => {
    expect(quickAction(regular({ state: "supplier_assigned" }), NOW)).toBeNull();
  });
});

describe("To do", () => {
  it("puts Express offers then accepted Express jobs on top, and the rest after", () => {
    const offer = express();
    const working = express({ id: "ord_working", state: "payment_authorized", shopAcceptance: null } as never);
    const counter = express({ id: "ord_counter", state: "ready_for_dispatch", shopAcceptance: null } as never);
    const board = buildTodo([counter, working, regular({ state: "production" }), offer], NOW);
    expect(board.express.map((job) => job.id)).toEqual(["ord_express", "ord_working"]);
    expect(board.after.map((row) => row.orderId).sort()).toEqual(["ord_counter", "ord_regular"]);
  });

  it("drops an offer whose five minutes ran out", () => {
    const late = new Date("2026-11-21T02:06:00.000Z");
    expect(buildTodo([express()], late).express).toEqual([]);
  });

  it("counts the things to do in the title", () => {
    expect(todoTitle(0)).toBe("All done for now");
    expect(todoTitle(1)).toBe("1 thing to do");
    expect(todoTitle(3)).toBe("3 things to do");
  });
});
