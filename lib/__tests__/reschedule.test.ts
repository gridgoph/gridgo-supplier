import type { Order, RescheduleRequest } from "@/lib/api";
import {
  canRequestNewDeadline,
  normalizeRescheduleRequest,
  normalizeRescheduleRequests,
  presentRescheduleAlert,
  proposedDeadlineError,
  reasonError,
  rescheduleNotice,
} from "@/lib/reschedule";

type AskOrder = Parameters<typeof canRequestNewDeadline>[0];

const ACTIVE: AskOrder = {
  state: "production",
  readyAt: null,
  readyBy: "2026-10-07T09:00:00.000Z",
  rescheduleRequest: undefined,
  shopRecovery: null,
  refundHold: false,
  refundDisposition: null,
};

function request(partial: Partial<RescheduleRequest> = {}): RescheduleRequest {
  return {
    id: "resched_1",
    orderId: "ord_1",
    reason: "Laminator broke down",
    status: "pending",
    requestedAt: "2026-10-05T06:00:00.000Z",
    expiresAt: "2026-10-06T06:00:00.000Z",
    answeredAt: null,
    resolution: null,
    workHeld: false,
    originalReadyBy: "2026-10-07T09:00:00.000Z",
    proposedReadyBy: "2026-10-09T09:00:00.000Z",
    ...partial,
  };
}

describe("asking for a new deadline", () => {
  it("is offered during production and packing, before the job is ready", () => {
    expect(canRequestNewDeadline(ACTIVE)).toBe(true);
    expect(canRequestNewDeadline({ ...ACTIVE, state: "supplier_self_qc" })).toBe(true);
  });

  it.each(["payment_authorized", "ready_for_dispatch", "supplier_assigned"])("is not offered at %s", (state) => {
    expect(canRequestNewDeadline({ ...ACTIVE, state })).toBe(false);
  });

  it("is offered once per job, whatever became of the first request", () => {
    for (const status of ["pending", "accepted", "declined", "expired", "operations_required"] as const) {
      expect(canRequestNewDeadline({ ...ACTIVE, rescheduleRequest: request({ status }) })).toBe(false);
    }
  });

  it("is not offered on a job that is ready, released, refunded or undated", () => {
    expect(canRequestNewDeadline({ ...ACTIVE, readyAt: "2026-10-06T00:00:00Z" })).toBe(false);
    expect(canRequestNewDeadline({ ...ACTIVE, shopRecovery: { id: "e", status: "awaiting_client" } })).toBe(false);
    expect(canRequestNewDeadline({ ...ACTIVE, refundHold: true })).toBe(false);
    expect(canRequestNewDeadline({ ...ACTIVE, readyBy: null })).toBe(false);
  });

  it("wants a time after both now and the current ready-by", () => {
    const now = new Date("2026-10-05T06:00:00.000Z");
    expect(proposedDeadlineError(null, ACTIVE.readyBy, now)).toMatch(/Choose/);
    expect(proposedDeadlineError(new Date("2026-10-05T05:00:00.000Z"), ACTIVE.readyBy, now)).toMatch(/passed/);
    expect(proposedDeadlineError(new Date("2026-10-07T08:00:00.000Z"), ACTIVE.readyBy, now)).toMatch(/after your current/);
    expect(proposedDeadlineError(new Date("2026-10-08T08:00:00.000Z"), ACTIVE.readyBy, now)).toBeNull();
  });

  it("requires a reason of a sensible length", () => {
    expect(reasonError("   ")).toMatch(/why/);
    expect(reasonError("x".repeat(2001))).toMatch(/2,000/);
    expect(reasonError("Part arrives Thursday")).toBeNull();
  });
});

describe("where a request stands", () => {
  it("keeps the shop on its current ready-by while the client decides", () => {
    const notice = rescheduleNotice(request());
    expect(notice.chip.label).toBe("Waiting for the client");
    expect(notice.body).toMatch(/keep working/);
    expect(notice.holdsTo).toBe("2026-10-07T09:00:00.000Z");
    expect(notice.stopped).toBe(false);
  });

  it("moves the ready-by once the client accepts", () => {
    const notice = rescheduleNotice(request({ status: "accepted" }));
    expect(notice.chip.label).toBe("Accepted");
    expect(notice.holdsTo).toBe("2026-10-09T09:00:00.000Z");
  });

  it("stops the work when the client declines", () => {
    for (const resolution of [null, "rematch_offered", "no_match", "refund_requested", "operations_required"] as const) {
      const notice = rescheduleNotice(request({ status: "declined", resolution, workHeld: true }));
      expect(notice.chip.label).toBe("Declined");
      expect(notice.stopped).toBe(true);
    }
  });

  it("lets the job carry on once Operations resolves a decline", () => {
    const notice = rescheduleNotice(request({ status: "declined", resolution: "resolved" }));
    expect(notice.stopped).toBe(false);
    expect(notice.title).toMatch(/original deadline/);
  });

  it("keeps the original date when nobody answered", () => {
    const notice = rescheduleNotice(request({ status: "expired" }));
    expect(notice.chip.label).toBe("Not answered");
    expect(notice.body).toMatch(/Operations/);
    expect(notice.holdsTo).toBe("2026-10-07T09:00:00.000Z");
  });

  it("hands it to Operations when a deduction already applies", () => {
    expect(rescheduleNotice(request({ status: "operations_required", workHeld: true })).stopped).toBe(true);
    expect(rescheduleNotice(request({ status: "operations_required", workHeld: false })).stopped).toBe(false);
  });
});

describe("reading requests from GRIDGO", () => {
  it("reads one request from an order or a {request} body", () => {
    expect(normalizeRescheduleRequest({ request: request() })?.id).toBe("resched_1");
    expect(normalizeRescheduleRequest(request({ resolution: "nope" as never }))?.resolution).toBeNull();
    expect(normalizeRescheduleRequest({ request: null })).toBeNull();
    expect(normalizeRescheduleRequest({ id: "x", status: "weird" })).toBeNull();
  });

  it("reads the shop's lifetime record", () => {
    const record = normalizeRescheduleRequests({ totalRequests: 3, requests: [request(), { junk: true }] });
    expect(record?.total).toBe(3);
    expect(record?.requests).toHaveLength(1);
    expect(normalizeRescheduleRequests({})).toBeNull();
  });
});

describe("deadline request notices", () => {
  it("ignores other alerts", () => {
    expect(presentRescheduleAlert({ type: "shop_job_assigned" })).toBeNull();
  });

  it.each([
    "order_reschedule_requested",
    "order_reschedule_accepted",
    "order_reschedule_declined",
    "order_reschedule_expired",
    "order_reschedule_operations_required",
    "order_reschedule_rematched",
    "order_reschedule_refund_requested",
    "order_reschedule_resolved",
    "order_reschedule_rematch_refreshed",
  ])("says %s in the shop's words", (type) => {
    const alert = presentRescheduleAlert({ type });
    expect(alert?.title).toBeTruthy();
    expect(alert?.body).not.toMatch(/_/);
  });
});

// Keeps the Order type honest: the projection field this module reads.
const _typed: Pick<Order, "rescheduleRequest"> = { rescheduleRequest: request() };
void _typed;
