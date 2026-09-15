import { ApiError, type PayoutAccount } from "@/lib/api";
import * as api from "@/lib/api";
import * as files from "@/lib/files";
import {
  draftFromAccount,
  hasPayoutChanges,
  loadPayoutAccount,
  PAYOUT_NOT_OPEN_YET,
  payoutPatch,
  payoutProblems,
  savePayoutAccount,
  sendQrPicture,
  type PayoutDraft,
} from "@/lib/payoutAccount";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getPayoutAccount: jest.fn(),
  updatePayoutAccount: jest.fn(),
}));

jest.mock("@/lib/files", () => ({
  ...jest.requireActual<typeof files>("@/lib/files"),
  uploadFile: jest.fn(),
}));

const getPayoutAccount = api.getPayoutAccount as jest.MockedFunction<typeof api.getPayoutAccount>;
const updatePayoutAccount = api.updatePayoutAccount as jest.MockedFunction<typeof api.updatePayoutAccount>;
const uploadFile = files.uploadFile as jest.MockedFunction<typeof files.uploadFile>;

const ACCOUNT: PayoutAccount = {
  supplierId: "usr_1",
  provider: "gcash",
  accountName: "Ben S.",
  accountNumber: "+639171234567",
  institution: null,
  qr: { fileId: "file_qr", originalFilename: "gcash.jpg", detectedContentType: "image/jpeg", size: 1000, readyAt: "2026-09-15T00:00:00.000Z" },
  version: 2,
  updatedAt: "2026-09-15T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the draft", () => {
  it("starts empty for a shop with no account and mirrors a saved one", () => {
    expect(draftFromAccount(null)).toEqual({
      provider: null,
      accountName: "",
      accountNumber: "",
      institution: "",
      qr: { fileId: null, localUri: null, removed: false },
    });
    expect(draftFromAccount(ACCOUNT).qr.fileId).toBe("file_qr");
    expect(hasPayoutChanges(ACCOUNT, draftFromAccount(ACCOUNT))).toBe(false);
  });

  it("sends only what moved, and everything for a new account", () => {
    const edited: PayoutDraft = { ...draftFromAccount(ACCOUNT), accountName: " Ben Santos " };
    expect(payoutPatch(ACCOUNT, edited)).toEqual({ accountName: "Ben Santos" });

    const fresh: PayoutDraft = {
      provider: "bank",
      accountName: "Lovis Printshop",
      accountNumber: "1234",
      institution: "BPI",
      qr: { fileId: "file_new", localUri: "file:///qr.jpg", removed: false },
    };
    expect(payoutPatch(null, fresh)).toEqual({
      provider: "bank",
      accountName: "Lovis Printshop",
      accountNumber: "1234",
      institution: "BPI",
      qrFileId: "file_new",
    });
  });

  it("binds a newly sent plate and takes down a saved one explicitly", () => {
    const replaced: PayoutDraft = {
      ...draftFromAccount(ACCOUNT),
      qr: { fileId: "file_two", localUri: null, removed: false },
    };
    expect(payoutPatch(ACCOUNT, replaced)).toEqual({ qrFileId: "file_two" });

    const removed: PayoutDraft = {
      ...draftFromAccount(ACCOUNT),
      qr: { fileId: null, localUri: null, removed: true },
    };
    expect(payoutPatch(ACCOUNT, removed)).toEqual({ qrFileId: null });

    // Taking down a plate that was never saved is not a change.
    const neverHad: PayoutDraft = { ...draftFromAccount(null), qr: { fileId: null, localUri: null, removed: true } };
    expect(payoutPatch(null, neverHad)).toEqual({});
  });
});

describe("what is still wrong with it", () => {
  it("asks for a wallet and a name, and reads a wallet number as a mobile number", () => {
    expect(payoutProblems(draftFromAccount(null))).toEqual({
      provider: expect.stringMatching(/Choose where/),
      accountName: expect.stringMatching(/Enter the name/),
    });
    expect(payoutProblems({ ...draftFromAccount(ACCOUNT), accountNumber: "12" })).toEqual({
      accountNumber: expect.stringMatching(/mobile number/),
    });
    expect(payoutProblems({ ...draftFromAccount(ACCOUNT), accountNumber: "" })).toEqual({});
  });

  it("wants the bank named, and lets a bank account number be anything", () => {
    const bank: PayoutDraft = { ...draftFromAccount(ACCOUNT), provider: "bank", accountNumber: "0012-3456-78", institution: "" };
    expect(payoutProblems(bank)).toEqual({ institution: expect.stringMatching(/Name the bank/) });
    expect(payoutProblems({ ...bank, institution: "BPI" })).toEqual({});
  });
});

describe("loading", () => {
  it("returns what GRIDGO answered with, null included", async () => {
    getPayoutAccount.mockResolvedValue(null);
    await expect(loadPayoutAccount()).resolves.toEqual({ status: "ok", value: null });
  });

  it.each([404, 405])("reads %s as not open yet rather than a failure", async (status) => {
    getPayoutAccount.mockRejectedValue(new ApiError(status, { error: "not_found" }));
    await expect(loadPayoutAccount()).resolves.toEqual({ status: "not_open_yet" });
  });

  it("names a real failure", async () => {
    getPayoutAccount.mockRejectedValue(new ApiError(500, { error: "boom" }));
    await expect(loadPayoutAccount()).resolves.toMatchObject({ status: "failed" });
  });
});

describe("saving", () => {
  it("passes the version through, null for a first save", async () => {
    updatePayoutAccount.mockResolvedValue(ACCOUNT);
    await expect(savePayoutAccount(null, { provider: "gcash", accountName: "Ben S." })).resolves.toEqual({
      status: "ok",
      value: ACCOUNT,
    });
    expect(updatePayoutAccount).toHaveBeenCalledWith(null, { provider: "gcash", accountName: "Ben S." });
  });

  it("reads a version conflict as stale, not as a failure to retry", async () => {
    updatePayoutAccount.mockRejectedValue(
      new ApiError(409, { error: "payout_account_stale", expectedVersion: 2, currentVersion: 3 }),
    );
    await expect(savePayoutAccount(2, { accountName: "x" })).resolves.toEqual({ status: "stale" });
  });

  it("puts a refusal on the field GRIDGO named, in this app's words", async () => {
    updatePayoutAccount.mockRejectedValue(
      new ApiError(400, { error: "invalid_payout_account", field: "accountNumber", message: "server words" }),
    );
    const outcome = await savePayoutAccount(2, { accountNumber: "x" });
    expect(outcome).toMatchObject({ status: "failed", field: "accountNumber" });
    expect(outcome.status === "failed" && outcome.message).not.toMatch(/server words/);
  });

  it("puts a refused picture on the plate", async () => {
    updatePayoutAccount.mockRejectedValue(new ApiError(400, { error: "invalid_payout_qr", field: "qrFileId" }));
    await expect(savePayoutAccount(2, { qrFileId: "file_x" })).resolves.toMatchObject({ status: "failed", field: "qr" });
    updatePayoutAccount.mockRejectedValue(new ApiError(409, { error: "file_already_attached" }));
    await expect(savePayoutAccount(2, { qrFileId: "file_x" })).resolves.toMatchObject({ status: "failed", field: "qr" });
  });
});

describe("sending the plate", () => {
  const picked = { uri: "file:///qr.jpg", fileName: "qr.jpg", mimeType: "image/jpeg", sizeBytes: 1200 };

  it("sends it as a supplier_payout_qr and hands back the stored id", async () => {
    uploadFile.mockResolvedValue({ ok: true, fileId: "file_new" });
    await expect(sendQrPicture(picked)).resolves.toEqual({ status: "ok", fileId: "file_new" });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///qr.jpg", fileName: "qr.jpg" }),
      "supplier_payout_qr",
      expect.any(Function),
    );
  });

  it("refuses a picture over 5 MB before spending the bytes", async () => {
    await expect(sendQrPicture({ ...picked, sizeBytes: 6 * 1024 * 1024 })).resolves.toMatchObject({
      status: "failed",
      message: expect.stringMatching(/over 5 MB/),
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("reads a platform that does not know the purpose as not open yet", async () => {
    uploadFile.mockResolvedValue({ ok: false, error: "x", code: "invalid_file_purpose" });
    await expect(sendQrPicture(picked)).resolves.toEqual({ status: "not_open_yet" });
    expect(PAYOUT_NOT_OPEN_YET).toMatch(/not opened payout accounts/);
  });
});
