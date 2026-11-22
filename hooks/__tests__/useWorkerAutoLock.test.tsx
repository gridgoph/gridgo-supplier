import { renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { useWorkerAutoLock } from "@/hooks/useWorkerAutoLock";
import { withSystemPicker } from "@/lib/sharedDevice";
import { BACKGROUND_LOCK_MS, useShopWorker } from "@/store/shopWorker";

const lito = { pinStaffId: "shp_lito", name: "Lito", role: "staff" as const };

describe("a shared shop phone going to the background", () => {
  let change: (next: AppStateStatus) => void = () => {};
  const lock = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
      change = callback as (next: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
    lock.mockClear();
    useShopWorker.setState({ shared: true, worker: lito, lock });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("locks at once, even for a short trip", async () => {
    await renderHook(() => useWorkerAutoLock());
    change("background");
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("leaves the turn open while a camera this app opened is up", async () => {
    await renderHook(() => useWorkerAutoLock());
    let close: () => void = () => {};
    const picking = withSystemPicker(() => new Promise<void>((resolve) => { close = resolve; }));
    change("background");
    change("active");
    close();
    await picking;
    expect(lock).not.toHaveBeenCalled();
  });

  it("still locks a camera trip that ran past two minutes", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    await renderHook(() => useWorkerAutoLock());
    let close: () => void = () => {};
    const picking = withSystemPicker(() => new Promise<void>((resolve) => { close = resolve; }));
    change("background");
    jest.spyOn(Date, "now").mockReturnValue(1_000 + BACKGROUND_LOCK_MS + 1);
    change("active");
    expect(lock).toHaveBeenCalledTimes(1);
    close();
    await picking;
  });

  it("does nothing when nobody is working", async () => {
    useShopWorker.setState({ worker: null });
    await renderHook(() => useWorkerAutoLock());
    change("background");
    expect(lock).not.toHaveBeenCalled();
  });
});

it("locks on return when someone picked themselves while the app was in the background", async () => {
  let change: (next: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, callback) => {
    change = callback as (next: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  const lock = jest.fn(async () => undefined);
  useShopWorker.setState({ shared: true, worker: null, lock });
  await renderHook(() => useWorkerAutoLock());
  change("background");
  expect(lock).not.toHaveBeenCalled();
  useShopWorker.setState({ worker: lito });
  change("active");
  expect(lock).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});
