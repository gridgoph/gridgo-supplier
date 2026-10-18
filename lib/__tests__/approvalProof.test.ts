import {
  approvalRowSummary,
  approvalSummaryOf,
  filesLine,
  latestApproval,
  parseApprovalProofs,
  recordsNewestFirst,
} from "@/lib/approvalProof";
import { workspaceBriefSections } from "@/lib/jobBrief";
import type { Order } from "@/lib/api";

const snapshot = {
  orderId: "ord_1",
  items: [
    {
      id: "line_1",
      itemNameSnapshot: "Flyers",
      quantity: 500,
      specialInstructions: "Keep the logo away from the fold.",
      artworkLinks: [{ url: "https://example.test/design" }],
      options: [
        { groupNameSnapshot: "Paper", optionLabelSnapshot: "130gsm gloss" },
        { groupNameSnapshot: "Size", optionLabelSnapshot: "A5" },
      ],
    },
  ],
  quoteLines: [],
  specification: {},
  artwork: [{ fileId: "file_art", contentSha256: "abc" }],
};

const drawn = {
  id: "apr_1",
  version: 1,
  phase: "checkout",
  status: "approved",
  method: "drawn",
  at: "2026-10-17T07:40:00.000Z",
  account: { id: "usr_1", name: "Juan Dela Cruz", email: "client@example.test", accountType: "individual" },
  device: { id: "install-1", platform: "android", appVersion: "2.4.8" },
  userAgent: "GRIDGO/2.4.8",
  statement: "I approve this order",
  signatureFileId: "file_sig",
  samplePhotoFileId: null,
  evidence: [],
  snapshot,
  snapshotSha256: "3f9a21c0d4e5f60718293a4b5c6d7e8f",
};

describe("what the client approved", () => {
  it("summarises a drawn signature, a one-tap approval and a signed sample", () => {
    const at = "2026-10-17T07:40:00.000Z";
    const row = (records: unknown[]) => approvalRowSummary(approvalSummaryOf({ approvalProof: { records } })!);
    expect(row([{ id: "a", phase: "checkout", status: "approved", method: "drawn", at }])).toEqual({
      summary: "Signed by the client · Oct 17, 3:40 PM",
      empty: false,
    });
    expect(row([{ id: "a", phase: "checkout", status: "approved", method: "one_tap", at }]).summary).toBe(
      "Approved in one tap · Oct 17, 3:40 PM",
    );
    expect(row([{ id: "a", phase: "sample", status: "approved", method: "drawn", at }]).summary).toBe(
      "Sample signed · Oct 17, 3:40 PM",
    );
  });

  it("never calls an unrecorded approval signed or approved", () => {
    const summary = approvalSummaryOf({
      approvalProof: {
        records: [{ id: "a", phase: "checkout", status: "legacy_unrecorded", method: "drawn", at: "2026-10-17T07:40:00.000Z" }],
      },
    })!;
    expect(latestApproval(summary.records)).toBeNull();
    expect(summary.records[0].method).toBeNull();
    expect(approvalRowSummary(summary).summary).toBe("No approval was collected for this order");
  });

  it("draws no row for an order with no record and no requirement", () => {
    expect(approvalSummaryOf({ approvalProof: { requirement: null, records: [] } })).toBeNull();
    expect(approvalSummaryOf({})).toBeNull();
    const waiting = approvalSummaryOf({ approvalProof: { requirement: { required: true, method: "drawn" }, records: [] } })!;
    expect(approvalRowSummary(waiting)).toEqual({ summary: "Waiting for the client's approval", empty: true });
  });

  it("drops the client's account, device and user agent before anything reaches a screen", () => {
    const [record] = parseApprovalProofs([drawn]);
    const flat = JSON.stringify(record);
    expect(flat).not.toContain("Juan");
    expect(flat).not.toContain("client@example.test");
    expect(flat).not.toContain("install-1");
    expect(flat).not.toContain("GRIDGO/2.4.8");
    expect(record).toMatchObject({
      statement: "I approve this order",
      signatureFileId: "file_sig",
      samplePhotoFileId: null,
      reference: "3F9A21C0D4E5",
      artworkCount: 1,
      designLinkCount: 1,
    });
    expect(record.items).toEqual([
      {
        name: "Flyers",
        quantity: 500,
        options: ["Paper: 130gsm gloss", "Size: A5"],
        instructions: "Keep the logo away from the fold.",
      },
    ]);
    expect(filesLine(record)).toBe("Approved with 1 print file and 1 design link");
  });

  it("keeps the approved snapshot when the order is edited afterwards", () => {
    const stored = structuredClone(drawn);
    const [record] = parseApprovalProofs([stored]);
    const before = structuredClone(record);
    // A later edit to the order's lines must not reach what was signed.
    stored.snapshot.items[0].quantity = 900;
    stored.snapshot.items[0].itemNameSnapshot = "Posters";
    stored.snapshot.items[0].options.push({ groupNameSnapshot: "Finish", optionLabelSnapshot: "Matte" });
    stored.snapshot.artwork.push({ fileId: "file_new", contentSha256: "def" });
    expect(record).toEqual(before);
    expect(record.items[0]).toMatchObject({ name: "Flyers", quantity: 500, options: ["Paper: 130gsm gloss", "Size: A5"] });
  });

  it("keeps a sample photo only on a sample approval, and no signature on one tap", () => {
    const [sample, tap] = parseApprovalProofs([
      { ...drawn, id: "apr_2", phase: "sample", samplePhotoFileId: "file_sample", at: "2026-10-18T01:00:00.000Z" },
      { ...drawn, id: "apr_3", method: "one_tap", signatureFileId: "file_ignored", samplePhotoFileId: "file_ignored" },
    ]);
    expect(sample.samplePhotoFileId).toBe("file_sample");
    expect(tap.signatureFileId).toBeNull();
    expect(tap.samplePhotoFileId).toBeNull();
    expect(recordsNewestFirst([tap, sample]).map((row) => row.id)).toEqual(["apr_2", "apr_3"]);
  });

  it("reads a quoted job's lines from the quote", () => {
    const [record] = parseApprovalProofs([
      {
        ...drawn,
        snapshot: { items: [], quoteLines: [{ label: "Tarpaulin", quantity: 2, size: "3 x 6 ft", material: "13oz" }] },
      },
    ]);
    expect(record.items).toEqual([{ name: "Tarpaulin", quantity: 2, options: ["3 x 6 ft", "13oz"], instructions: null }]);
  });

  it("adds the docket row only when GRIDGO holds a record", () => {
    const base = { state: "production", timeline: [], productionItems: [] } as unknown as Order;
    expect(workspaceBriefSections(base)).not.toContain("approval");
    const approved = {
      ...base,
      approvalProof: { records: [{ id: "a", phase: "checkout", status: "approved", method: "one_tap", at: drawn.at }] },
    } as unknown as Order;
    expect(workspaceBriefSections(approved)).toContain("approval");
  });
});
