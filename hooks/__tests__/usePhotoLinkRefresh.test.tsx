import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import type { SamplePhoto } from "@/lib/listings";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]);
  },
}));

/**
 * gridgo-supplier#84: resuming the app is not a focus change, so a board held
 * in state keeps its five-minute links past their life unless something reads
 * the board again on the way back.
 */
let now = Date.parse("2026-09-28T02:00:00.000Z");
let resume: ((state: AppStateStatus) => void)[] = [];

const photo = (expiresInMs: number | null): SamplePhoto => ({
  fileId: "f",
  sortOrder: 0,
  altText: null,
  downloadUrl: "https://files.test/f",
  downloadUrlExpiresAt: expiresInMs === null ? null : new Date(now + expiresInMs).toISOString(),
});

async function comeBack() {
  await act(async () => resume.forEach((listener) => listener("active")));
}

beforeEach(() => {
  resume = [];
  now = Date.parse("2026-09-28T02:00:00.000Z");
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    resume.push(listener as (state: AppStateStatus) => void);
    return { remove: () => { resume = resume.filter((item) => item !== listener); } } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

it("re-reads the board on returning after five minutes, and not after one", async () => {
  const reread = jest.fn(async () => undefined);
  const board = [{ photos: [photo(null)] }];
  const view = await renderHook(() => usePhotoLinkRefresh(board, reread));

  now += 60_000;
  await comeBack();
  expect(reread).not.toHaveBeenCalled();

  now += 4 * 60_000;
  await comeBack();
  expect(reread).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it("re-reads early when the soonest photo link is about to expire", async () => {
  const reread = jest.fn(async () => undefined);
  const board = [{ photos: [photo(300_000)] }, { photos: [photo(90_000)] }];
  const view = await renderHook(() => usePhotoLinkRefresh(board, reread));

  now += 45_000;
  await comeBack();
  expect(reread).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it("holds one re-read at a time and reads nothing while no board is held", async () => {
  let finish: () => void = () => undefined;
  const reread = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = await renderHook(
    ({ board }: { board: { photos: SamplePhoto[] }[] | null }) => usePhotoLinkRefresh(board, reread),
    { initialProps: { board: null as { photos: SamplePhoto[] }[] | null } },
  );

  now += 6 * 60_000;
  await comeBack();
  expect(reread).not.toHaveBeenCalled();

  await view.rerender({ board: [{ photos: [photo(null)] }] });
  now += 6 * 60_000;
  await comeBack();
  await comeBack();
  expect(reread).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await view.unmount();
});
