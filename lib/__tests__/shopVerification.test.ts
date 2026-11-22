import {
  moneyVerifyBanner,
  papersOnFile,
  readShopVerification,
  readVerification,
  todoVerifyNotice,
  verificationBenefits,
  waitingPayouts,
  waitingReasonLine,
  type ShopVerification,
} from "@/lib/shopVerification";

/** A fresh unverified shop, as `GET /me/supplier-verification` sends it. */
const FRESH = {
  verified: false,
  verificationState: "not_submitted",
  startedAt: "2026-11-20T00:00:00.000Z",
  deadlineAt: "2026-12-20T00:00:00.000Z",
  daysLeft: 28,
  countdownDays: null as number | null,
  payoutCapMinor: 500000,
  paidBeforeVerificationMinor: 124000,
  remainingCapMinor: 376000,
  capReached: false,
  heldMinor: 0,
  recoveryDueMinor: 0,
  paidOpenRegularJobs: 1,
  newOrdersPaused: false,
};

function summary(patch: Partial<typeof FRESH> = {}): ShopVerification {
  const v = readVerification({ ...FRESH, ...patch });
  if (!v) throw new Error("expected a summary");
  return v;
}

const NEGATIVE = /unverified|not verified|lost|penalt|fine\b|held back|blocked|fail/i;

describe("reading the verification route", () => {
  it("returns null for an API that sends no summary, so nothing new is drawn", () => {
    expect(readShopVerification(null)).toBeNull();
    expect(readShopVerification({})).toBeNull();
    expect(readVerification({ verificationState: "verified" })).toBeNull();
  });

  it("reads the figures from GRIDGO and never invents a cap", () => {
    const v = summary({ payoutCapMinor: 250000 });
    expect(v.payoutCapMinor).toBe(250000);
    expect(v.paidBeforeVerificationMinor).toBe(124000);
    expect(v.countdownDays).toBeNull();
  });

  it("keeps only the papers it knows, and the newest of each", () => {
    const read = readShopVerification({
      verification: FRESH,
      verificationDocuments: [
        { fileId: "f1", readyAt: "2026-11-21T01:00:00Z", references: [{ type: "user", documentType: "valid_id" }] },
        { fileId: "f2", readyAt: "2026-11-21T02:00:00Z", references: [{ type: "user", documentType: "valid_id" }] },
        { fileId: "f3", readyAt: "2026-11-21T02:00:00Z", verificationDocumentType: "id_selfie" },
        { fileId: "f4", readyAt: "2026-11-21T02:00:00Z", references: [{ documentType: "sample_work" }] },
      ],
      ledger: [],
    });
    const papers = papersOnFile(read!.files);
    expect(papers.valid_id?.fileId).toBe("f2");
    expect(papers.id_selfie?.fileId).toBe("f3");
    expect(papers.business_permit).toBeUndefined();
  });
});

describe("payouts waiting on verification", () => {
  it("lists a stage whose latest ledger entry is still held, with its reason", () => {
    const waiting = waitingPayouts([
      { payoutKey: "o1:production_started", orderId: "o1", kind: "held", amountMinor: 86000, data: { reason: "verification_payout_cap" } },
      { payoutKey: "o2:delivered", orderId: "o2", kind: "held", amountMinor: 30000, data: { reason: "verification_open_jobs" } },
      { payoutKey: "o3:delivered", orderId: "o3", kind: "held", amountMinor: 20000, data: { reason: "verification_payout_cap" } },
      { payoutKey: "o3:delivered", orderId: "o3", kind: "available", amountMinor: 20000 },
      { payoutKey: "reminder:s1:7", kind: "reminder", amountMinor: 0 },
    ]);
    expect(waiting).toEqual([
      { key: "o1:production_started", orderId: "o1", amountMinor: 86000, reason: "cap" },
      { key: "o2:delivered", orderId: "o2", amountMinor: 30000, reason: "open_jobs" },
    ]);
  });

  it("says waiting, never lost", () => {
    expect(waitingReasonLine("cap")).toMatch(/Paid once you're verified/);
    expect(waitingReasonLine("open_jobs")).toMatch(/delivered/);
    for (const reason of ["cap", "open_jobs"] as const) expect(waitingReasonLine(reason)).not.toMatch(NEGATIVE);
  });
});

describe("the To do card", () => {
  it("is a short pitch for a fresh shop, with no countdown", () => {
    const notice = todoVerifyNotice(summary())!;
    expect(notice.title).toBe("Get verified, get more jobs");
    expect(notice.chip).toBeNull();
    expect(notice.action).toBe("Get verified");
    expect(notice.tone).toBe("neutral");
  });

  it("counts down only in the last seven days", () => {
    const notice = todoVerifyNotice(summary({ daysLeft: 5, countdownDays: 5 }))!;
    expect(notice.chip).toBe("5 days left");
    expect(notice.body).toMatch(/New orders pause/);
    expect(todoVerifyNotice(summary({ daysLeft: 1, countdownDays: 1 }))!.chip).toBe("1 day left");
  });

  it("notes the cap from GRIDGO's figure when it is reached", () => {
    const notice = todoVerifyNotice(
      summary({ capReached: true, paidBeforeVerificationMinor: 500000, remainingCapMinor: 0 }),
    )!;
    expect(notice.title).toBe("Payouts over ₱5,000.00 are waiting");
    expect(notice.body).toMatch(/The rest is paid in full once you're verified/);
    expect(todoVerifyNotice(summary({ capReached: true, payoutCapMinor: 300000 }))!.title).toMatch(/₱3,000/);
  });

  it("explains the pause at the end of the window, and that open jobs finish", () => {
    const notice = todoVerifyNotice(summary({ daysLeft: 0, countdownDays: 0, newOrdersPaused: true }))!;
    expect(notice.tone).toBe("warning");
    expect(notice.title).toBe("New orders are paused");
    expect(notice.body).toMatch(/open jobs still finish/);
    expect(notice.action).toBe("Get verified");
  });

  it("tells a shop paused after a dropped job why, and what comes out of its payouts", () => {
    const notice = todoVerifyNotice(summary({ recoveryDueMinor: 86000, newOrdersPaused: true }))!;
    expect(notice.title).toBe("New orders are paused");
    expect(notice.body).toMatch(/₱860\.00 will come out of your next payouts/);
  });

  it("goes quiet once the papers are being checked, until the last week", () => {
    expect(todoVerifyNotice(summary({ verificationState: "being_checked" }))).toBeNull();
    const late = todoVerifyNotice(summary({ verificationState: "being_checked", countdownDays: 3 }))!;
    expect(late.title).toBe("GRIDGO is checking your papers");
    expect(late.action).toBeNull();
  });

  it("draws nothing for a verified shop", () => {
    expect(todoVerifyNotice(summary({ verified: true, verificationState: "verified" }))).toBeNull();
  });

  it("never uses a word that shames the shop", () => {
    const states = [
      summary(),
      summary({ countdownDays: 2 }),
      summary({ capReached: true }),
      summary({ newOrdersPaused: true }),
      summary({ recoveryDueMinor: 1000 }),
      summary({ verificationState: "being_checked", countdownDays: 2 }),
    ];
    for (const v of states) {
      const n = todoVerifyNotice(v)!;
      expect(`${n.title} ${n.body}`).not.toMatch(NEGATIVE);
      const m = moneyVerifyBanner(v)!;
      expect(`${m.title} ${m.body}`).not.toMatch(NEGATIVE);
    }
  });
});

describe("the Money banner", () => {
  it("shows how much of the cap is used while unverified", () => {
    const banner = moneyVerifyBanner(summary())!;
    expect(banner.title).toBe("Get verified to unlock payouts over ₱5,000.00");
    expect(banner.body).toBe("₱1,240.00 of ₱5,000.00 paid out so far.");
    expect(banner.action).toBe("Get verified");
  });

  it("says the money over the cap is waiting once reached", () => {
    expect(moneyVerifyBanner(summary({ capReached: true }))!.title).toBe("Payouts over ₱5,000.00 are waiting");
  });

  it("drops the button once the papers are with GRIDGO", () => {
    const banner = moneyVerifyBanner(summary({ verificationState: "being_checked" }))!;
    expect(banner.action).toBeNull();
    expect(banner.body).toMatch(/checking your papers/);
  });

  it("says what a dropped job takes from the next payouts", () => {
    expect(moneyVerifyBanner(summary({ recoveryDueMinor: 86000 }))!.body).toBe(
      "₱1,240.00 of ₱5,000.00 paid out so far. ₱860.00 from a dropped job will come out of your next payouts.",
    );
  });

  it("is gone once verified", () => {
    expect(moneyVerifyBanner(summary({ verified: true }))).toBeNull();
  });
});

describe("the benefits", () => {
  it("names the cap from GRIDGO's setting", () => {
    expect(verificationBenefits(summary({ payoutCapMinor: 750000 })).map((b) => b.detail).join(" ")).toMatch(
      /₱7,500\.00/,
    );
  });
});
