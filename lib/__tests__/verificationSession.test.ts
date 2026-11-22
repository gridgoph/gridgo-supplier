import * as api from "@/lib/api";
import { isMatchable } from "@/store/session";

/**
 * A pending shop's access to its jobs rides on GRIDGO's verification summary
 * (report F318781A). A route GRIDGO does not have keeps the old wait; a read
 * that merely failed must never take a shop's jobs away.
 */
function bootstrap(id: string) {
  return {
    user: { id, email: "owner@example.com", name: "Owner", role: "client" },
    memberships: [{ role: "supplier" }],
    approvalCases: [{ kind: "supplier", status: "pending" }],
  };
}

const summary = {
  verification: {
    verified: false,
    verificationState: "not_submitted",
    daysLeft: 28,
    countdownDays: null,
    payoutCapMinor: 500000,
  },
  verificationDocuments: [],
  ledger: [],
};

function respond(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

/** `/auth/me` answers; `/me/supplier-verification` answers with `verification`. */
function serve(id: string, verification: Response | Error) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    if (String(input).endsWith("/auth/me")) return respond(200, bootstrap(id));
    if (verification instanceof Error) throw verification;
    return verification;
  });
}

afterEach(() => jest.restoreAllMocks());

describe("a pending Owner's bootstrap", () => {
  it("opens the floor when GRIDGO sends the summary", async () => {
    serve("s_ok", respond(200, summary));
    const user = await api.me();
    expect(user.verification?.payoutCapMinor).toBe(500000);
    expect(isMatchable(user)).toBe(true);
  });

  it("keeps the old wait when GRIDGO does not have the route", async () => {
    serve("s_old", respond(404, { error: { code: "not_found" } }));
    const user = await api.me();
    expect(user.verification).toBeNull();
    expect(isMatchable(user)).toBe(false);
  });

  it("does not close the floor on a first read that fails", async () => {
    serve("s_fresh", respond(503, { error: { code: "unavailable" } }));
    const user = await api.me();
    expect(user.verificationUnreachable).toBe(true);
    expect(isMatchable(user)).toBe(true);
  });

  it("keeps the last answer on a refresh whose read fails", async () => {
    serve("s_refresh", respond(200, summary));
    expect(isMatchable(await api.me())).toBe(true);

    jest.restoreAllMocks();
    serve("s_refresh", new TypeError("Network request failed"));
    const refreshed = await api.me();
    expect(refreshed.verification?.payoutCapMinor).toBe(500000);
    expect(isMatchable(refreshed)).toBe(true);
  });

  it("still keeps a rejected shop out, whatever the read says", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () =>
      respond(200, { ...bootstrap("s_rej"), approvalCases: [{ kind: "supplier", status: "rejected" }] }),
    );
    expect(isMatchable(await api.me())).toBe(false);
  });
});
