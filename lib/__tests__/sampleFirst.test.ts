import { presentAlertBody, presentAlertTitle } from "@/lib/alertStages";
import { draftFrom, listingSavePatch, samplePatch, sampleHold } from "@/lib/listingDraft";
import { normalizeListing, type Listing } from "@/lib/listings";
import { pushTargetRoute } from "@/lib/push";
import {
  linkedSampleJob,
  presentSampleAlert,
  sampleAlertReason,
  sampleDecisionOf,
  sampleTagOf,
  showsSampleDecision,
  SAMPLE_PRICE_NEEDED,
} from "@/lib/sampleFirst";

const listing: Listing = {
  id: "sci_1",
  serviceLineId: "svc_1",
  subcategoryCode: "business_cards",
  name: "Business cards",
  description: "",
  basePriceMinor: 50000,
  pricingUnit: "per_unit",
  packageQty: null,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  printerMaxWidthFeet: null,
  printLayouts: [],
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "inherit",
  turnaround: null,
  fileFormatMode: "inherit",
  formatCodes: [],
  onTheBoard: true,
  sortOrder: 0,
  photos: [],
  groups: [],
  version: 3,
  updatedAt: null,
};

describe("Sample First tags", () => {
  it("reads the batch tag over the sample tag, and nothing from an older API", () => {
    expect(sampleTagOf({ orderTags: ["sample"] })).toBe("sample");
    expect(sampleTagOf({ orderTags: ["batch_from_sample"] })).toBe("batch_from_sample");
    expect(sampleTagOf({ orderTags: [] })).toBeNull();
    expect(sampleTagOf({})).toBeNull();
    expect(sampleTagOf(null)).toBeNull();
  });

  it("links a batch to its sample and a sample to its batch", () => {
    expect(linkedSampleJob({ orderTags: ["batch_from_sample"], sampleOrderId: "ord_s" })).toEqual({
      id: "ord_s",
      label: "Open the sample job",
    });
    expect(linkedSampleJob({ orderTags: ["sample"], batchOrderId: "ord_b" })).toEqual({
      id: "ord_b",
      label: "Open the batch job",
    });
    expect(linkedSampleJob({ orderTags: ["sample"], batchOrderId: null })).toBeNull();
  });
});

describe("the client's decision", () => {
  it("reads an approval with its photo and note", () => {
    expect(
      sampleDecisionOf({
        sampleDecision: {
          draftId: "sbd_1",
          decision: "approved",
          method: "tick",
          at: "2026-11-02T03:00:00.000Z",
          samplePhotoFileId: "file_photo",
          note: " Colours are right ",
        },
      }),
    ).toEqual({ decision: "approved", at: "2026-11-02T03:00:00.000Z", samplePhotoFileId: "file_photo", note: "Colours are right" });
  });

  it("treats an unknown approval method as approved, with its photo", () => {
    const decision = sampleDecisionOf({
      sampleDecision: { decision: "approved", method: "signed", samplePhotoFileId: "file_sig_photo" },
    });
    expect(decision).toEqual(expect.objectContaining({ decision: "approved", samplePhotoFileId: "file_sig_photo" }));
  });

  it("reads a rejection with its reason and next step", () => {
    expect(
      sampleDecisionOf({ sampleDecision: { decision: "rejected", at: null, reason: "Too dark", next: "resample" } }),
    ).toEqual({ decision: "rejected", at: null, reason: "Too dark", next: "resample" });
  });

  it("is nothing before a decision, or on a shape it does not know", () => {
    expect(sampleDecisionOf({ sampleDecision: null })).toBeNull();
    expect(sampleDecisionOf({ sampleDecision: { decision: "maybe" } })).toBeNull();
    expect(sampleDecisionOf({})).toBeNull();
  });

  it("draws a panel only on a tagged job with a decision or a link", () => {
    expect(showsSampleDecision({ orderTags: ["sample"] })).toBe(false);
    expect(showsSampleDecision({ orderTags: ["sample"], sampleDecision: { decision: "rejected", reason: "x" } })).toBe(true);
    expect(showsSampleDecision({ orderTags: ["batch_from_sample"], sampleOrderId: "ord_s" })).toBe(true);
    expect(showsSampleDecision({ sampleDecision: { decision: "approved" } })).toBe(false);
  });
});

describe("sample alerts", () => {
  it("says what happened instead of GRIDGO's generic words", () => {
    const approved = { type: "shop_sample_approved", title: "Sample approved", body: "Open GRIDGO to see the client's decision on the sample." };
    const rejected = { type: "shop_sample_rejected", title: "Sample rejected", body: "Open GRIDGO to see the client's decision on the sample." };
    expect(presentAlertTitle(approved)).toBe("Sample approved");
    expect(presentAlertBody(approved)).toMatch(/approved your sample/);
    expect(presentAlertTitle(rejected)).toBe("Sample not approved");
    expect(presentAlertBody(rejected)).toBe("The client turned down your sample. Open the job to read why.");
    expect(presentSampleAlert({ type: "shop_job_assigned" })).toBeNull();
  });

  it("names the rejection reason once the job is on the phone", () => {
    const job = { sampleDecision: { decision: "rejected", reason: "Too dark", next: "resample" } };
    expect(sampleAlertReason({ type: "shop_sample_rejected" }, job)).toBe("Too dark");
    expect(sampleAlertReason({ type: "shop_sample_approved" }, job)).toBeNull();
    expect(sampleAlertReason({ type: "shop_sample_rejected" }, null)).toBeNull();
  });

  it("opens the sample job from a push", () => {
    expect(pushTargetRoute({ notificationId: "ntf_1", type: "shop_sample_approved", orderId: "ord_s", at: "2026-11-02T00:00:00Z" })).toBe("/job/ord_s");
    expect(pushTargetRoute({ notificationId: "ntf_2", type: "shop_sample_rejected", orderId: "ord_s", at: "2026-11-02T00:00:00Z" })).toBe("/job/ord_s");
  });
});

describe("the listing's sample offer", () => {
  it("reads the offer from GRIDGO, and shows nothing from one without Sample First", () => {
    const withOffer = normalizeListing({ item: { id: "sci_1", sampleAvailable: true, samplePriceMinor: 15000 } });
    expect(withOffer).toEqual(expect.objectContaining({ sampleAvailable: true, samplePriceMinor: 15000 }));
    expect(draftFrom(withOffer as Listing)).toEqual(expect.objectContaining({ sampleAvailable: true, samplePrice: "150.00" }));

    const older = normalizeListing({ item: { id: "sci_2" } }) as Listing;
    expect(older.sampleAvailable).toBeUndefined();
    expect(draftFrom(older).sampleAvailable).toBeNull();
    expect(listingSavePatch(draftFrom(older), 0)).not.toHaveProperty("sampleAvailable");
  });

  it("never offers a sample on a quote listing", () => {
    const quote = normalizeListing({ item: { id: "sci_q", quoteRequestId: "qr_1", sampleAvailable: false } }) as Listing;
    expect(draftFrom(quote).sampleAvailable).toBeNull();
  });

  it("sends the switch and the price only when the shop changed them", () => {
    const stored = { ...listing, sampleAvailable: false, samplePriceMinor: null };
    expect(samplePatch(draftFrom(stored), stored)).toEqual({});
    const on = { ...draftFrom(stored), sampleAvailable: true, samplePrice: "120" };
    expect(listingSavePatch(on, 50000, undefined, stored)).toEqual(
      expect.objectContaining({ sampleAvailable: true, samplePriceMinor: 12000 }),
    );
  });

  it("keeps the price when the offer is switched off", () => {
    const stored = { ...listing, sampleAvailable: true, samplePriceMinor: 12000 };
    const off = { ...draftFrom(stored), sampleAvailable: false };
    expect(samplePatch(off, stored)).toEqual({ sampleAvailable: false, samplePriceMinor: 12000 });
  });

  it("holds an offer without a price, or at zero, on the phone", () => {
    const stored = { ...listing, sampleAvailable: false, samplePriceMinor: null };
    expect(sampleHold({ ...draftFrom(stored), sampleAvailable: true, samplePrice: "" })).toBe(SAMPLE_PRICE_NEEDED);
    expect(sampleHold({ ...draftFrom(stored), sampleAvailable: true, samplePrice: "0" })).toBe(SAMPLE_PRICE_NEEDED);
    expect(sampleHold({ ...draftFrom(stored), sampleAvailable: true, samplePrice: "1.234" })).toMatch(/./);
    expect(sampleHold({ ...draftFrom(stored), sampleAvailable: true, samplePrice: "0.01" })).toBeNull();
    expect(sampleHold({ ...draftFrom(stored), sampleAvailable: false, samplePrice: "" })).toBeNull();
  });

  it("saves the offer off on a colour-priced listing, which cannot have one", () => {
    const stored = { ...listing, pricingUnit: "per_page" as const, colourSupported: true, pricedByColour: false, sampleAvailable: true, samplePriceMinor: 5000 };
    const colour = { ...draftFrom(stored), pricedByColour: true };
    expect(samplePatch(colour, stored)).toEqual({ sampleAvailable: false, samplePriceMinor: 5000 });
    expect(sampleHold({ ...colour, samplePrice: "" })).toBeNull();
  });
});
