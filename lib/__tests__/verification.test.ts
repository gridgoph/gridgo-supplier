import { ApiError } from "@/lib/api";
import * as api from "@/lib/api";
import * as files from "@/lib/files";
import {
  DOCUMENTS_NOT_OPEN_YET,
  documentDefinition,
  PIN_NOT_OPEN_YET,
  saveShopLocation,
  sendDocument,
  summariseDocumentSend,
  VERIFICATION_DOCUMENTS,
} from "@/lib/verification";

const PIN = { lat: 7.0644, lng: 125.6085, label: "C.M. Recto St, Davao City" };
const PICKED = {
  uri: "file:///permit.jpg",
  fileName: "permit.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
};

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Two routes the platform is adding in parallel with this app. Until they land
 * they answer 404, and a shop must not be shown a red failure for GRIDGO's own
 * release schedule.
 */
describe("a route the platform has not opened yet", () => {
  it("is a third outcome on the pin, not an error", async () => {
    jest.spyOn(api, "updateShopLocation").mockRejectedValue(new ApiError(404, { error: "not_found" }));
    expect(await saveShopLocation(PIN)).toEqual({ status: "not_open_yet" });
  });

  it("is a third outcome on a document, whichever half is missing", async () => {
    jest
      .spyOn(files, "uploadFile")
      .mockResolvedValue({ ok: false, error: "…", code: "invalid_file_purpose" });
    expect(await sendDocument("business_permit", PICKED)).toEqual({ status: "not_open_yet" });

    jest.spyOn(files, "uploadFile").mockResolvedValue({ ok: true, fileId: "file_1" });
    jest
      .spyOn(api, "attachVerificationDocument")
      .mockRejectedValue(new ApiError(404, { error: "not_found" }));
    expect(await sendDocument("business_permit", PICKED)).toEqual({ status: "not_open_yet" });
  });

  it("explains it without naming a status code or a route", () => {
    for (const message of [PIN_NOT_OPEN_YET, DOCUMENTS_NOT_OPEN_YET]) {
      expect(message).toMatch(/Operations/);
      expect(message).not.toMatch(/404|\/auth|_/);
    }
  });
});

describe("a real failure", () => {
  it("stays a failure, with a fix in it", async () => {
    jest
      .spyOn(api, "updateShopLocation")
      .mockRejectedValue(new ApiError(400, { error: "invalid_shop" }));
    const outcome = await saveShopLocation(PIN);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.message).toMatch(/Davao City/);
      expect(outcome.message).not.toMatch(/_/);
    }
  });

  it("keeps the shop's own account out of it once the account exists", () => {
    const summary = summariseDocumentSend([
      { kind: "business_permit", outcome: { status: "saved" } },
      { kind: "valid_id", outcome: { status: "failed", message: "…" } },
    ]);
    expect(summary).toMatch(/Your account is open/);
    expect(summary).toMatch(/valid id/i);
  });

  it("says nothing at all when everything landed", () => {
    expect(
      summariseDocumentSend([{ kind: "business_permit", outcome: { status: "saved" } }]),
    ).toBeNull();
    expect(summariseDocumentSend([])).toBeNull();
  });
});

describe("what Operations asks for", () => {
  it("expects a permit and an ID, and treats sample work as optional", () => {
    expect(VERIFICATION_DOCUMENTS.filter((d) => d.expected).map((d) => d.kind)).toEqual([
      "business_permit",
      "valid_id",
    ]);
    expect(documentDefinition("sample_work").expected).toBe(false);
  });

  it("says why each one is wanted, in plain language", () => {
    for (const definition of VERIFICATION_DOCUMENTS) {
      expect(definition.detail.length).toBeGreaterThan(20);
      expect(`${definition.title} ${definition.detail}`).not.toMatch(/_/);
    }
  });
});
