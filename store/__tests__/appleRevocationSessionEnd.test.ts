import * as api from "@/lib/api";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import { appleRevocationFailure } from "@/lib/appleRevocation";
import { useAccountDeletion } from "@/store/accountDeletion";
import { setClerkSignOutHandler, useSession } from "@/store/session";
import { useSignInNotice } from "@/store/signInNotice";

// The real transport and session: a final 401 ends the session inside
// `lib/api.ts` before the call throws, which is the ordering under test.
jest.mock("@/lib/appleReauthorize", () => ({ reauthorizeWithApple: jest.fn() }));

const askApple = reauthorizeWithApple as jest.Mock;

const shop: api.User = {
  id: "apple-shop", email: "shop@example.test", name: "Shop",
  role: "supplier", verificationStatus: "approved",
};
const response = (status: number, body: unknown): Response => ({
  ok: status < 400, status, text: async () => JSON.stringify(body),
}) as Response;

const PRIVACY = { id: "pr_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" };

type Stage = "file" | "read" | "revoke";

/** Answers each route as GRIDGO would, and 401s (twice: after the refresh too) at `ending`. */
function stubGridgo(ending: Stage) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const stage: Stage | null = url.endsWith("/apple-revocation")
      ? "revoke"
      : url.endsWith("/me/account-deletion-request")
        ? (method === "GET" ? "read" : "file")
        : null;
    if (stage === ending) return response(401, { error: "unauthorized" });
    if (url.endsWith("/me/privacy-requests")) return response(201, { request: PRIVACY });
    if (stage === "file") return response(202, { ok: true });
    if (stage === "read") return response(200, { request: { id: "req_1", status: "pending", appleRevocations: [] } });
    return response(500, { error: "unexpected" });
  });
}

function reverify() {
  return {
    startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
    prepareFirstFactorVerification: jest.fn(),
    attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
  };
}

beforeEach(() => {
  useSession.getState().adoptClerkUser(shop);
  api.setTokenProvider(async () => "test-jwt");
  setClerkSignOutHandler(jest.fn(async () => undefined));
  useAccountDeletion.getState().forgetAccount();
  useSignInNotice.getState().clear();
  askApple.mockReset().mockResolvedValue({ status: "ok", authorizationCode: "apple-code" });
});
afterEach(() => {
  useSession.getState().clearClerkIdentity();
  api.setTokenProvider(null);
  api.setToken(null);
  setClerkSignOutHandler(null);
  jest.restoreAllMocks();
});

it.each<Stage>(["file", "read", "revoke"])(
  "tells Sign in what was left when the session ends at the %s call",
  async (stage) => {
    stubGridgo(stage);
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", reverify(), "clerk-user-1");

    expect(useSession.getState().identity).toEqual({ kind: "signed_out", reason: "session_ended" });
    expect(useSignInNotice.getState().message).toBe(appleRevocationFailure("signed_out").message);
    expect(useSignInNotice.getState().held).toBeNull();
  },
);

it("keeps a newer visit's sentence when an abandoned visit's answer lands late", async () => {
  const revokes: ((value: Response) => void)[] = [];
  jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/apple-revocation")) {
      // The first two are held open; the refreshed retry is the final 401.
      if (revokes.length < 2) return new Promise<Response>((resolve) => revokes.push(resolve));
      return response(401, { error: "unauthorized" });
    }
    if (url.endsWith("/me/privacy-requests")) return response(201, { request: PRIVACY });
    if ((init?.method ?? "GET") === "GET") {
      return response(200, { request: { id: "req_1", status: "pending", appleRevocations: [] } });
    }
    return response(202, { ok: true });
  });
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ready()).toBe(true);
  };
  const visit = () => {
    useAccountDeletion.getState().setSecret("secret-pass");
    return useAccountDeletion.getState().submit("password", reverify(), "clerk-user-1");
  };

  const first = visit();
  await until(() => revokes.length === 1);
  useAccountDeletion.getState().reset(); // the screen is left mid-call
  const second = visit();
  await until(() => revokes.length === 2);

  revokes[0](response(200, { ok: true, requestId: "req_1", appleRevocation: null }));
  await first;
  expect(useSignInNotice.getState().held?.message).toBe(appleRevocationFailure("signed_out").message);

  revokes[1](response(401, { error: "unauthorized" }));
  await second;
  expect(useSession.getState().identity).toEqual({ kind: "signed_out", reason: "session_ended" });
  expect(useSignInNotice.getState().message).toBe(appleRevocationFailure("signed_out").message);
});

it("says nothing extra when the session ends outside the Apple step", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);
  expect(useSession.getState().identity).toEqual({ kind: "signed_out", reason: "session_ended" });
  expect(useSignInNotice.getState().message).toBeNull();
});

it("drops a held sentence when the account changes, and clears it on sign-in", () => {
  useSignInNotice.getState().hold("unfinished");
  useSession.getState().clearClerkIdentity();
  expect(useSignInNotice.getState().held).toBeNull();
  useSignInNotice.getState().hold("unfinished");
  useSignInNotice.getState().sessionEnded();
  useSession.getState().adoptClerkUser(shop);
  expect(useSignInNotice.getState().message).toBeNull();
});
