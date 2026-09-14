import * as api from "@/lib/api";
import { useSession } from "@/store/session";

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
