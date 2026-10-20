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
  api.setToken(null);
  jest.restoreAllMocks();
});

function answer(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

/**
 * gridgo-api `src/attachments.js`: a `verification_document` attach accepts
 * `documentType` and `replaceFileId` only, and anything else is
 * `400 unexpected_target_field` — which is how every paper failed while the
 * app sent `documentKind`.
 */
describe("attaching a paper", () => {
  it("sends documentType and nothing else", async () => {
    api.setToken("supplier-token");
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(answer(200, { file: { fileId: "file_1", purpose: "verification_document" } }));

    await api.attachVerificationDocument("file_1", "valid_id");

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/files\/file_1\/attach$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ documentType: "valid_id" });
  });

  it("names each paper with a code GRIDGO accepts", () => {
    // gridgo-api `VERIFICATION_DOCUMENT_TYPES`.
    expect(VERIFICATION_DOCUMENTS.map((d) => d.kind).sort()).toEqual(
      ["business_permit", "sample_work", "valid_id"],
    );
  });

  it("is sent only once GRIDGO has bound it", async () => {
    jest.spyOn(files, "uploadFile").mockResolvedValue({ ok: true, fileId: "file_1" });
    const attach = jest
      .spyOn(api, "attachVerificationDocument")
      .mockResolvedValue({ fileId: "file_1" } as api.StoredFile);

    expect(await sendDocument("business_permit", PICKED)).toEqual({ status: "saved" });
    expect(attach).toHaveBeenCalledWith("file_1", "business_permit");
  });

  it("stays a failure the shop can send again when GRIDGO refuses the attach", async () => {
    jest.spyOn(files, "uploadFile").mockResolvedValue({ ok: true, fileId: "file_1" });
    jest
      .spyOn(api, "attachVerificationDocument")
      .mockRejectedValue(new ApiError(400, { error: "unexpected_target_field" }));

    const outcome = await sendDocument("business_permit", PICKED);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.message).toMatch(/Try again/);
      expect(outcome.message).not.toMatch(/_|400/);
    }
  });
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
