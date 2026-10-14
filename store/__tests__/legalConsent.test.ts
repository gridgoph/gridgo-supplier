import { ApiError, acceptLegalVersions, getLegalPending, type LegalVersion } from "@/lib/api";
import { LEGAL_VERSION_CHANGED } from "@/lib/legal";
import { LEGAL_FIRST_READ_MS, legalGateFor, useLegalConsent } from "@/store/legalConsent";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/apiErrors");
  return {
    ApiError: actual.ApiError,
    getLegalPending: jest.fn(),
    acceptLegalVersions: jest.fn(),
  };
});

jest.mock("@/lib/legalContext", () => ({
  legalContext: jest.fn(async () => ({ app: "gridgo-supplier/test", device: "supplier-test" })),
}));

const pendingRead = getLegalPending as jest.Mock;
const acceptCall = acceptLegalVersions as jest.Mock;

function version(id: string, patch: Partial<LegalVersion> = {}): LegalVersion {
  return {
    id,
    documentId: id.replace(/-\d+$/, ""),
    version: 1,
    title: id,
    audience: "supplier",
    text: "Placeholder text.",
    effectiveAt: "2026-10-09T02:00:00.000Z",
    placeholder: true,
    material: false,
    status: "placeholder",
    ...patch,
  };
}

const agreement = [version("terms-of-service-1"), version("supplier-agreement-1")];

beforeEach(() => {
  jest.useRealTimers();
  useLegalConsent.getState().reset();
  pendingRead.mockReset();
  acceptCall.mockReset();
});

describe("reading what the shop still has to agree to", () => {
  it("blocks while GRIDGO says blocking, for this account only", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: agreement, notices: [] });
    await useLegalConsent.getState().load("u1");

    const state = useLegalConsent.getState();
    expect(state.status).toBe("blocked");
    expect(legalGateFor(state, "u1")).toBe("blocked");
    // Another account never inherits this one's answer.
    expect(legalGateFor(state, "u2")).toBe("unknown");
  });

  it("is clear with notices when nothing material is waiting", async () => {
    pendingRead.mockResolvedValue({ blocking: false, pending: [], notices: [version("cookie-notice-1")] });
    await useLegalConsent.getState().load("u1");

    expect(useLegalConsent.getState()).toMatchObject({ status: "clear", pending: [] });
    expect(useLegalConsent.getState().notices).toHaveLength(1);
  });

  it("lets the shop in when the first read fails, and keeps a known answer on a later failure", async () => {
    pendingRead.mockRejectedValueOnce(new Error("offline"));
    await useLegalConsent.getState().load("u1");
    expect(useLegalConsent.getState().status).toBe("clear");

    pendingRead.mockResolvedValueOnce({ blocking: true, pending: agreement, notices: [] });
    await useLegalConsent.getState().load("u1");
    pendingRead.mockRejectedValueOnce(new Error("offline"));
    await useLegalConsent.getState().load("u1");
    expect(useLegalConsent.getState().status).toBe("blocked");
  });

  it("treats an API without the legal library as clear", async () => {
    pendingRead.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await useLegalConsent.getState().load("u1");
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("stops holding the launch after a slow first read", async () => {
    jest.useFakeTimers();
    pendingRead.mockReturnValue(new Promise(() => {}));
    void useLegalConsent.getState().load("u1");
    expect(useLegalConsent.getState().status).toBe("unknown");
    jest.advanceTimersByTime(LEGAL_FIRST_READ_MS);
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("starts a different account from nothing", async () => {
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: agreement, notices: [] });
    await useLegalConsent.getState().load("u1");
    pendingRead.mockReturnValueOnce(new Promise(() => {}));
    void useLegalConsent.getState().load("u2");
    expect(useLegalConsent.getState()).toMatchObject({ userId: "u2", status: "unknown", pending: [] });
  });
});

describe("agreeing", () => {
  beforeEach(async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: agreement, notices: [] });
    await useLegalConsent.getState().load("u1");
  });

  it("records exactly the versions on screen, from the blocking screen", async () => {
    acceptCall.mockResolvedValue({ blocking: false, pending: [], notices: [], recorded: 2 });
    const done = await useLegalConsent.getState().accept(["terms-of-service-1", "supplier-agreement-1"]);

    expect(done).toBe(true);
    expect(acceptCall).toHaveBeenCalledWith(["terms-of-service-1", "supplier-agreement-1"], {
      app: "gridgo-supplier/test",
      device: "supplier-test",
    });
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("never agrees to a list that moved under the tick", async () => {
    const done = await useLegalConsent.getState().accept(["terms-of-service-1"]);
    expect(done).toBe(false);
    expect(acceptCall).not.toHaveBeenCalled();
  });

  it("reads the new text and asks again when a version changed mid-read", async () => {
    acceptCall.mockRejectedValue(new ApiError(409, { error: "legal_version_changed" }));
    const newer = [version("terms-of-service-1"), version("sa-2", { documentId: "supplier-agreement", version: 2 })];
    pendingRead.mockResolvedValue({ blocking: true, pending: newer, notices: [] });

    const done = await useLegalConsent.getState().accept(["terms-of-service-1", "supplier-agreement-1"]);

    expect(done).toBe(false);
    const state = useLegalConsent.getState();
    expect(state.error).toBe(LEGAL_VERSION_CHANGED);
    expect(state.status).toBe("blocked");
    expect(state.pending.map((doc) => doc.id)).toEqual(["terms-of-service-1", "sa-2"]);
  });

  it("stays blocked and says so when the agreement did not arrive", async () => {
    acceptCall.mockRejectedValue(new Error("offline"));
    const done = await useLegalConsent.getState().accept(["terms-of-service-1", "supplier-agreement-1"]);
    expect(done).toBe(false);
    expect(useLegalConsent.getState()).toMatchObject({ status: "blocked", accepting: false });
    expect(useLegalConsent.getState().error).toMatch(/did not reach GRIDGO/);
  });
});
