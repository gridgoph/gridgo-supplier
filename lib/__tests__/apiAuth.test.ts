import * as api from "@/lib/api";

const supplierUser = {
  id: "supplier_1",
  email: "shop@example.com",
  name: "Shop Owner",
  role: "supplier" as const,
  supplierName: "Davao Print Shop",
  verificationStatus: "approved" as const,
};

function okUserResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ user: supplierUser }),
  } as Response;
}

describe("API authentication token source", () => {
  beforeEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
  });

  afterEach(() => {
    api.setToken(null);
    api.setTokenProvider(null);
    api.setUnauthorizedHandler(null);
    jest.restoreAllMocks();
  });

  it("asks Clerk for a fresh token on every authenticated request", async () => {
    const provider = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce("clerk-token-one")
      .mockResolvedValueOnce("clerk-token-two");
    api.setToken("legacy-token");
    api.setTokenProvider(provider);

    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(okUserResponse());

    await api.me();
    await api.me();

    expect(provider).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer clerk-token-one" }),
    });
    expect(fetch.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer clerk-token-two" }),
    });
  });

  it("keeps the local demo bearer when Clerk does not own the session", async () => {
    api.setToken("legacy-token");
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(okUserResponse());

    await api.me();

    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer legacy-token" }),
    });
  });

  it("does not fall back to a legacy bearer when an active Clerk provider has no token", async () => {
    api.setToken("legacy-token");
    api.setTokenProvider(async () => null);
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(okUserResponse());

    await api.me();

    expect((fetch.mock.calls[0][1] as RequestInit).headers).not.toEqual(
      expect.objectContaining({ Authorization: expect.anything() }),
    );
  });

  it("shares the fresh token surface with uploads and streams", async () => {
    api.setTokenProvider(async () => "clerk-token");
    await expect(api.getAuthToken()).resolves.toBe("clerk-token");
  });

  it("keeps a Clerk JWT when the token function is replaced mid-request", async () => {
    let finish = (_token: string) => {};
    api.setTokenProvider(
      () =>
        new Promise<string | null>((resolve) => {
          finish = (token) => resolve(token);
        }),
    );
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue(okUserResponse());

    const pending = api.me();
    await Promise.resolve();
    await Promise.resolve();
    api.setTokenProvider(async () => "second-token");
    finish("first-token");
    await pending;

    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer first-token" }),
    });
  });

  it("does not sign the shop out when a 401 arrives without a bearer", async () => {
    const unauthorized = jest.fn();
    api.setUnauthorizedHandler(unauthorized);
    api.setTokenProvider(async () => null);
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(api.me()).rejects.toBeInstanceOf(api.ApiError);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("drops a token that arrived after sign-out cleared the provider", async () => {
    let finish = (_token: string) => {};
    api.setTokenProvider(
      () =>
        new Promise<string | null>((resolve) => {
          finish = (token) => resolve(token);
        }),
    );

    const pending = api.getAuthToken();
    await Promise.resolve();
    await Promise.resolve();
    api.setTokenProvider(null);
    finish("stale-token");

    await expect(pending).resolves.toBeNull();
  });
});
