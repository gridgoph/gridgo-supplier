import * as api from "@/lib/api";
import { useHomePrinter } from "@/store/homePrinter";

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getHomePrinter: jest.fn(), patchHomePrinter: jest.fn() }));

const mocked = api as jest.Mocked<typeof api>;
const STATUS = {
  level: "starter", verified: false, online: false, offersPaused: true, reason: "home_offline", deadlineAt: null,
  weeklyJobs: 1, weeklyJobCap: 30, offlineUntil: null, allowHomePickup: false, pinConsentWording: "p", filePrivacyWording: "f",
};
const PIN = { point: { lat: 7.06, lng: 125.6 }, barangay: "Previous barangay", street: "Previous street", propertyType: "house", landmark: null, nextChangeAt: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  useHomePrinter.getState().reset();
});

it("drops a read that started before the account changed, and the next account reads afresh", async () => {
  const first = deferred<unknown>();
  mocked.getHomePrinter.mockReturnValueOnce(first.promise as never);
  const stale = useHomePrinter.getState().load();
  useHomePrinter.getState().reset();
  mocked.getHomePrinter.mockResolvedValueOnce({ version: 1, homePrinter: { ...STATUS, weeklyJobs: 0 }, pin: { ...PIN, barangay: "Next barangay" } } as never);
  const fresh = useHomePrinter.getState().load();
  expect(fresh).not.toBe(stale);
  first.resolve({ version: 9, homePrinter: STATUS, pin: PIN });
  await stale;
  await fresh;
  const home = useHomePrinter.getState().home;
  expect(home && home.pin.barangay).toBe("Next barangay");
});

it("drops a write answered after the account changed", async () => {
  mocked.getHomePrinter.mockResolvedValueOnce({ version: 2, homePrinter: STATUS, pin: PIN } as never);
  await useHomePrinter.getState().load();
  const answer = deferred<unknown>();
  mocked.patchHomePrinter.mockReturnValueOnce(answer.promise as never);
  const write = useHomePrinter.getState().update({ online: false }, "Try again.");
  useHomePrinter.getState().reset();
  answer.resolve({ version: 3, homePrinter: STATUS, pin: PIN });
  expect((await write).status).toBe("failed");
  expect(useHomePrinter.getState().home).toBeNull();
});
