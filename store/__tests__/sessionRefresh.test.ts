import * as api from "@/lib/api";
import { isMatchable, useSession } from "@/store/session";

const supplier: api.User = {
  id: "supplier-refresh",
  name: "Supplier",
  email: "shop@example.test",
  role: "supplier",
  supplierName: "Original shop",
  verificationStatus: "approved",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  useSession.getState().adoptClerkUser(supplier);
});

afterEach(() => {
  useSession.getState().clearClerkIdentity();
  jest.restoreAllMocks();
});

it.each(["success", "forbidden"])("ignores an older refresh's %s after a newer shop profile arrives", async (outcome) => {
  const older = deferred<api.User>();
  const newer = deferred<api.User>();
  jest.spyOn(api, "me").mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const first = useSession.getState().refresh();
  const second = useSession.getState().refresh();
  const renamed = { ...supplier, supplierName: "Renamed shop" };
  newer.resolve(renamed);
  await second;
  if (outcome === "success") older.resolve(supplier);
  else older.reject(new api.ApiError(403, { error: "forbidden" }));
  await first;
  expect(useSession.getState().user).toEqual(renamed);
  expect(useSession.getState().identity).toEqual({ kind: "supplier" });
});

it("does not restore a profile from a previous session", async () => {
  const pending = deferred<api.User>();
  jest.spyOn(api, "me").mockReturnValueOnce(pending.promise);
  const refresh = useSession.getState().refresh();
  useSession.getState().clearClerkIdentity();
  const other = { ...supplier, id: "other-supplier", supplierName: "Other shop" };
  useSession.getState().adoptClerkUser(other);
  pending.resolve(supplier);
  await refresh;
  expect(useSession.getState().user).toEqual(other);
});

it.each(["approval", "account switch", "sign-out"])("handles a pending listing write across %s", async (change) => {
  useSession.getState().adoptClerkUser({ ...supplier, verificationStatus: "pending" });
  api.setTokenProvider(null);
  const started = deferred<void>();
  const body = deferred<string>();
  jest.spyOn(global, "fetch").mockImplementation(async () => {
    started.resolve();
    return { ok: true, status: 200, text: () => body.promise } as Response;
  });
  const write = api.updateCatalogItem("listing-1", 7, { basePriceMinor: 15000 });
  await started.promise;

  if (change === "approval") {
    jest.spyOn(api, "me").mockResolvedValue(supplier);
    await useSession.getState().refresh();
    expect(isMatchable(useSession.getState().user)).toBe(true);
  } else if (change === "account switch") {
    useSession.getState().adoptClerkUser({ ...supplier, id: "other-supplier" });
  } else {
    useSession.getState().clearClerkIdentity();
  }

  const saved = { id: "listing-1", version: 8, basePriceMinor: 15000 };
  body.resolve(JSON.stringify(saved));
  if (change === "approval") await expect(write).resolves.toEqual(saved);
  else await expect(write).rejects.toThrow("account changed");
});
