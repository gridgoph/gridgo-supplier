import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePushPromptCheck } from "@/hooks/usePushPromptCheck";
import type { User } from "@/lib/api";
import { usePush } from "@/store/push";
import { closePushPrompt, usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/**
 * The explainer opens by itself once a shop lands on Home, and then at most
 * once a week while the phone still says no.
 */

let mockPathname = "/home";
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (href: string) => mockPush(href) },
  usePathname: () => mockPathname,
}));

const DAY = 24 * 60 * 60 * 1000;
const shop: User = {
  id: "supplier-one",
  name: "Shop",
  email: "shop@example.test",
  role: "supplier",
  verificationStatus: "approved",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/home";
  useSession.setState({ user: shop });
  usePush.setState({ supported: true, permission: "undetermined", error: null, busy: false });
  usePushPrompt.setState({ lastOfferedAt: null, hydrated: true, sheetOpen: false });
});

it("opens once when a signed-in shop lands on Home, and remembers when", async () => {
  const before = Date.now();
  const view = await renderHook(() => usePushPromptCheck(true));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-prompt"));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(usePushPrompt.getState().sheetOpen).toBe(true);
  expect(usePushPrompt.getState().lastOfferedAt).toBeGreaterThanOrEqual(before);

  // "Not now": the sheet closes, and Home does not bring it straight back.
  await act(async () => closePushPrompt());
  await view.rerender(undefined);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("stays shut on the next launch inside the week", async () => {
  usePushPrompt.setState({ lastOfferedAt: Date.now() - 3 * DAY });
  await renderHook(() => usePushPromptCheck(true));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockPush).not.toHaveBeenCalled();
});

it("opens again a week after the last time, while the phone still says no", async () => {
  usePushPrompt.setState({ lastOfferedAt: Date.now() - 7 * DAY - 1 });
  await renderHook(() => usePushPromptCheck(true));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-prompt"));
});

it("waits for the opening, a settled session and any update sheet", async () => {
  const view = await renderHook(({ ready }: { ready: boolean }) => usePushPromptCheck(ready), {
    initialProps: { ready: false },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockPush).not.toHaveBeenCalled();

  await view.rerender({ ready: true });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-prompt"));
});

it("waits for the first permission read, then opens", async () => {
  usePush.setState({ permission: "unknown" });
  await renderHook(() => usePushPromptCheck(true));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockPush).not.toHaveBeenCalled();

  await act(async () => usePush.setState({ permission: "undetermined" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-prompt"));
});

it("does nothing off Home, signed out, or once notifications are allowed", async () => {
  mockPathname = "/job/order-1";
  const view = await renderHook(() => usePushPromptCheck(true));
  await act(async () => useSession.setState({ user: null }));
  await act(async () => usePush.setState({ permission: "granted" }));
  mockPathname = "/home";
  await act(async () => useSession.setState({ user: shop }));
  await view.rerender(undefined);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(mockPush).not.toHaveBeenCalled();
  expect(usePushPrompt.getState().lastOfferedAt).toBeNull();
});
