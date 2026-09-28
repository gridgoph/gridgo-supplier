import {
  isRefundAlert,
  presentRefundAlert,
  presentRefundTimelineNote,
  refundNotice,
  refundStanding,
  refundStatus,
} from "@/lib/refund";

const none = { releasedMinor: 0, settlementMinor: 0 };

describe("refundStanding", () => {
  it("reads nothing, a pause, or a settlement", () => {
    expect(refundStanding({})).toBe("none");
    expect(refundStanding({ refundHold: false, refundDisposition: null })).toBe("none");
    expect(refundStanding({ refundHold: true, refundDisposition: null })).toBe("paused");
    // Still true while the client's transfer is paid, but the job is settled.
    expect(refundStanding({ refundHold: true, refundDisposition: "cancelled" })).toBe("settled");
    expect(refundStanding({ refundHold: false, refundDisposition: "fulfilled_with_refund" })).toBe("settled");
  });

  it("has no chip and no panel for a job no refund touches", () => {
    expect(refundStatus({})).toBeNull();
    expect(refundNotice({}, none)).toBeNull();
  });
});

describe("refundNotice", () => {
  it("tells a paused shop to stop, and that released money stays theirs", () => {
    const notice = refundNotice({ refundHold: true }, none);
    expect(notice?.title).toBe("Work is paused for a refund review");
    expect(notice?.body).toMatch(/Do not print, pack or hand anything over/);
    expect(notice?.body).toMatch(/money already released to you stays yours/);
    expect(notice?.tone).toBe("warning");
  });

  it("names what a settled shop keeps, and how it reaches them", () => {
    const body = refundNotice(
      { refundDisposition: "cancelled" },
      { releasedMinor: 40000, settlementMinor: 20000 },
    )?.body;
    expect(body).toMatch(/this job is closed/);
    expect(body).toMatch(
      /You keep ₱600\.00 in total: ₱400\.00 already released to you, and a ₱200\.00 settlement payout from Operations\./,
    );
  });

  it("covers a settlement paid only as the payout, only as released stages, or neither", () => {
    expect(refundNotice({ refundDisposition: "cancelled" }, { releasedMinor: 0, settlementMinor: 30000 })?.body).toMatch(
      /You keep ₱300\.00, paid as one settlement payout/,
    );
    expect(refundNotice({ refundDisposition: "cancelled" }, { releasedMinor: 40000, settlementMinor: 0 })?.body).toMatch(
      /You keep the ₱400\.00 already released to you\. Nothing more is due/,
    );
    expect(refundNotice({ refundDisposition: "cancelled" }, none)?.body).toMatch(/No payout is due/);
  });

  it("says a settlement after delivery happened after delivery", () => {
    const notice = refundNotice(
      { refundDisposition: "fulfilled_with_refund" },
      { releasedMinor: 75000, settlementMinor: 0 },
    );
    expect(notice?.title).toBe("Settled after delivery");
    expect(notice?.body).not.toMatch(/closed/);
  });

  it("never names the client's refund amount or transfer", () => {
    const notices = [
      refundNotice({ refundHold: true }, none),
      refundNotice({ refundDisposition: "cancelled" }, { releasedMinor: 40000, settlementMinor: 20000 }),
    ];
    for (const notice of notices) {
      expect(notice?.body).not.toMatch(/QR|reference|transfer to the client|₱710/);
    }
  });
});

describe("presentRefundAlert", () => {
  const types = [
    "refund_requested",
    "refund_reviewed",
    "refund_settled",
    "refund_rejected",
    "refund_withdrawn",
    "refund_paid",
    "refund_supplier_paid",
    "refund_destination",
    "refund_attempt",
    "refund_unknown",
    "refund_failed",
  ];

  it("rewrites every notice the platform sends a shop about a refund", () => {
    for (const type of types) {
      const alert = presentRefundAlert({ type });
      expect(alert?.title).toBeTruthy();
      expect(alert?.body).toBeTruthy();
      // The client's side of the transfer is not the shop's business.
      expect(alert?.body).not.toMatch(/receiving QR|reserved|reconcil|send another transfer/i);
    }
  });

  it("tells a shop what to do when work stops and when it can pick the job up again", () => {
    expect(presentRefundAlert({ type: "refund_requested" })?.body).toMatch(/Stop work on this job/);
    expect(presentRefundAlert({ type: "refund_rejected" })?.body).toMatch(/pause is lifted/);
    expect(presentRefundAlert({ type: "refund_withdrawn" })?.body).toMatch(/pause is lifted/);
  });

  it("calls the shop's own settlement payout's evidence transfer evidence, never a receipt", () => {
    const alert = presentRefundAlert({ type: "refund_supplier_paid" });
    expect(alert?.title).toBe("Settlement payout sent");
    expect(alert?.body).toMatch(/wallet transfer evidence/);
    expect(alert?.body).not.toMatch(/receipt/i);
  });

  it("gives an unknown refund type neutral words, and ignores other alerts", () => {
    expect(presentRefundAlert({ type: "refund_something_new" })?.title).toBe("Refund update");
    expect(presentRefundAlert({ type: "shop_job_assigned" })).toBeNull();
    expect(presentRefundAlert({})).toBeNull();
    expect(isRefundAlert("refund_paid")).toBe(true);
    expect(isRefundAlert(undefined)).toBe(false);
  });
});

describe("presentRefundTimelineNote", () => {
  it("drops the client's transfer status from the settlement entry", () => {
    expect(presentRefundTimelineNote("Refund settlement approved; no client transfer recorded yet.")).toBe(
      "Operations settled the refund on this job.",
    );
    expect(presentRefundTimelineNote("Production started")).toBe("Production started");
  });
});
