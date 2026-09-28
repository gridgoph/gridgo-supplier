import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { PayoutReceipt } from "@/components/PayoutReceipt";
import * as api from "@/lib/api";

jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof api>("@/lib/api"),
  getDownloadUrl: jest.fn(),
}));

const getDownloadUrl = api.getDownloadUrl as jest.MockedFunction<typeof api.getDownloadUrl>;

/**
 * gridgo-supplier#84: the receipt's link lives five minutes, and a shop that
 * leaves the payout screen in the background comes back to an expired one.
 * That is a fresh read and a brief sweep — never "picture will not load".
 */
let now = Date.parse("2026-09-28T02:00:00.000Z");
let resume: ((state: AppStateStatus) => void)[] = [];

/** Each call hands back the next link; `lives` is its life in seconds. */
function links(...lives: number[]) {
  let calls = 0;
  getDownloadUrl.mockImplementation(async (fileId) => {
    const life = lives[Math.min(calls, lives.length - 1)];
    calls += 1;
    return { fileId, url: `https://files.test/${fileId}-${calls}`, expiresAt: "", expiresInSeconds: life };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getDownloadUrl.mockReset();
  resume = [];
  now = Date.parse("2026-09-28T02:00:00.000Z");
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    resume.push(listener as (state: AppStateStatus) => void);
    return { remove: () => { resume = resume.filter((item) => item !== listener); } } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => jest.restoreAllMocks());

// The thumbnail sits in an aria-hidden frame: the row itself is the labelled control.
const image = () => screen.getByTestId("payout-receipt-image", { includeHiddenElements: true });

it("reads a fresh link exactly once when the picture fails on an expired one", async () => {
  links(300, 300);
  const view = await render(<PayoutReceipt fileId="receipt_expired" reference="GCASH-1" label="Printing" />);
  await waitFor(() => expect(image().props.source).toEqual({ uri: "https://files.test/receipt_expired-1" }));

  // Six minutes in the background: the held link is past its five.
  now += 6 * 60_000;
  await fireEvent(image(), "error");

  await waitFor(() => expect(image().props.source).toEqual({ uri: "https://files.test/receipt_expired-2" }));
  expect(getDownloadUrl).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/will not load/)).toBeNull();
  await view.unmount();
});

it("asks only once even when the fresh link is refused too", async () => {
  links(30, 30);
  const view = await render(<PayoutReceipt fileId="receipt_twice" label="Printing" />);
  await waitFor(() => expect(image()).toBeTruthy());

  await fireEvent(image(), "error");
  await waitFor(() => expect(image().props.source).toEqual({ uri: "https://files.test/receipt_twice-2" }));
  await fireEvent(image(), "error");

  expect(await screen.findByText(/picture will not load/)).toBeTruthy();
  expect(getDownloadUrl).toHaveBeenCalledTimes(2);
  await view.unmount();
});

it("still says the picture will not load when a fresh link fails", async () => {
  links(300);
  const view = await render(<PayoutReceipt fileId="receipt_fresh" label="Printing" />);
  await waitFor(() => expect(image()).toBeTruthy());

  await fireEvent(image(), "error");

  expect(await screen.findByText(/picture will not load/)).toBeTruthy();
  expect(getDownloadUrl).toHaveBeenCalledTimes(1);
  await view.unmount();
});

it("re-reads the link on returning to the app after five minutes, not after one", async () => {
  links(300, 300, 300);
  const view = await render(<PayoutReceipt fileId="receipt_resume" label="Printing" />);
  await waitFor(() => expect(image().props.source).toEqual({ uri: "https://files.test/receipt_resume-1" }));

  now += 60_000;
  await act(async () => resume.forEach((listener) => listener("active")));
  expect(getDownloadUrl).toHaveBeenCalledTimes(1);

  now += 4 * 60_000;
  await act(async () => resume.forEach((listener) => listener("active")));
  await waitFor(() => expect(image().props.source).toEqual({ uri: "https://files.test/receipt_resume-2" }));
  expect(getDownloadUrl).toHaveBeenCalledTimes(2);
  await view.unmount();
});
