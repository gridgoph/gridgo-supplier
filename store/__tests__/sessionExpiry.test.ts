import * as api from "@/lib/api";
import { authDoorOpen, launchHref } from "@/lib/launch";
import { setClerkSignOutHandler, useSession } from "@/store/session";

const shop: api.User = {
  id: "trading-shop", email: "shop@example.test", name: "Shop",
  role: "supplier", verificationStatus: "approved",
};
const response = (status: number, body: unknown): Response => ({
  ok: status < 400, status, text: async () => JSON.stringify(body),
}) as Response;

beforeEach(() => {
  useSession.getState().adoptClerkUser(shop);
  api.setTokenProvider(async () => "expired-token");
  setClerkSignOutHandler(jest.fn(async () => undefined));
});
afterEach(() => {
  useSession.getState().clearClerkIdentity();
  api.setTokenProvider(null);
  api.setToken(null);
  setClerkSignOutHandler(null);
  jest.restoreAllMocks();
});

it("returns an approved shop with an expired session to sign-in, never access", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  const routes: string[] = [];
  const unsubscribe = useSession.subscribe(({ identity, user }) => routes.push(launchHref(identity, user)));
  try {
    await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);
  } finally {
    unsubscribe();
  }
  expect(routes).not.toContain("/access");
  const { identity, user } = useSession.getState();
  expect(launchHref(identity, user)).toBe("/(auth)/login");
  expect(authDoorOpen(identity, user)).toBe(true);
});

it("keeps an approved shop on Home when a fresh token recovers the request", async () => {
  const fetch = jest.spyOn(global, "fetch")
    .mockResolvedValueOnce(response(401, { error: "unauthorized" }))
    .mockResolvedValueOnce(response(200, { jobs: [] }));
  await expect(api.listJobs()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
  const { identity, user } = useSession.getState();
  expect(user).toEqual(shop);
  expect(launchHref(identity, user)).toBe("/(tabs)/home");
});

it("keeps removed supplier access on the access screen", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(response(403, { error: "forbidden" }));
  await useSession.getState().refresh();
  const { identity, user } = useSession.getState();
  expect(launchHref(identity, user)).toBe("/access");
});

it("keeps a genuine role mismatch on access and a pending shop on Home", () => {
  useSession.getState().adoptClerkUser({ ...shop, role: "rider" });
  let state = useSession.getState();
  expect(launchHref(state.identity, state.user)).toBe("/access");
  useSession.getState().adoptClerkUser({ ...shop, verificationStatus: "pending" });
  state = useSession.getState();
  expect(launchHref(state.identity, state.user)).toBe("/(tabs)/home");
});

it("does not mistake a valid unmapped identity for an expired session", async () => {
  useSession.getState().setClerkIdentity({ kind: "loading" });
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unmapped_identity" }));
  await expect(api.me({ ignoreUnauthorized: true })).rejects.toBeInstanceOf(api.ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSession.getState().identity.kind).toBe("loading");
});

it("refreshes only once, then clears Clerk even if Clerk sign-out fails", async () => {
  const provider = jest.fn(async () => "rejected-token");
  const signOut = jest.fn(async () => { throw new Error("Session already gone"); });
  api.setTokenProvider(provider);
  setClerkSignOutHandler(signOut);
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);
  expect(provider.mock.calls).toEqual([[undefined], [{ skipCache: true }]]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(signOut).toHaveBeenCalledTimes(1);
  useSession.getState().clearClerkIdentity();
  const { identity, user } = useSession.getState();
  expect(launchHref(identity, user)).toBe("/(auth)/login");
  await expect(api.getAuthToken()).resolves.toBeNull();
});

it.each([403, 500])("does not refresh a token or end the session on a domain %s", async (status) => {
  const provider = jest.fn(async () => "valid-token");
  api.setTokenProvider(provider);
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response(status, { error: "refused" }));
  await expect(api.listJobs()).rejects.toBeInstanceOf(api.ApiError);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSession.getState().user).toEqual(shop);
});

it("does not end a new account's session when an old refresh finishes", async () => {
  let resolve!: (token: string) => void;
  const refreshed = new Promise<string>((yes) => { resolve = yes; });
  let started!: () => void;
  const refreshing = new Promise<void>((yes) => { started = yes; });
  const provider = jest.fn<ReturnType<api.TokenProvider>, Parameters<api.TokenProvider>>()
    .mockResolvedValueOnce("expired-token").mockImplementationOnce(() => { started(); return refreshed; });
  api.setTokenProvider(provider);
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  const request = api.listJobs();
  await refreshing;
  useSession.getState().adoptClerkUser({ ...shop, id: "another-shop" });
  api.setTokenProvider(async () => "new-account-token");
  resolve("old-refreshed-token");
  await expect(request).rejects.toThrow("account changed");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSession.getState().user?.id).toBe("another-shop");
});

it("preserves a rejected write's method, versioned body and headers on retry", async () => {
  const provider = jest.fn<ReturnType<api.TokenProvider>, Parameters<api.TokenProvider>>()
    .mockResolvedValueOnce("old-token").mockResolvedValueOnce("fresh-token");
  api.setTokenProvider(provider);
  const fetch = jest.spyOn(global, "fetch")
    .mockResolvedValueOnce(response(401, { error: "unauthorized" }))
    .mockResolvedValueOnce(response(200, { id: "listing", version: 8 }));
  await api.updateCatalogItem("listing", 7, { basePriceMinor: 15000 });
  const first = fetch.mock.calls[0][1];
  const second = fetch.mock.calls[1][1];
  expect(second).toMatchObject({ method: first?.method, body: first?.body });
  expect(second?.headers).toEqual({ ...first?.headers, Authorization: "Bearer fresh-token" });
});

it("preserves the sign-in explanation when concurrent restore requests are rejected", async () => {
  useSession.getState().setClerkIdentity({ kind: "loading" });
  jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  await Promise.allSettled([api.me(), api.me()]);
  const { identity, user } = useSession.getState();
  expect(launchHref(identity, user)).toBe("/(auth)/login");
});

it("lets explicit logout own Clerk sign-out when its domain request expires", async () => {
  const signOut = jest.fn(async () => undefined);
  setClerkSignOutHandler(signOut);
  jest.spyOn(global, "fetch").mockResolvedValue(response(401, { error: "unauthorized" }));
  await expect(useSession.getState().logout()).rejects.toBeInstanceOf(api.ApiError);
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(useSession.getState().identity).toEqual({ kind: "signed_out" });
});
