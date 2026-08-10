import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// @testing-library/react-native 14 made render/renderHook async by default.

describe("usePullToRefresh", () => {
  it("is not refreshing until the shop pulls", async () => {
    const reload = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePullToRefresh(reload));

    expect(result.current.refreshing).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows the indicator for the pull and takes it back when the load lands", async () => {
    let settle: () => void = () => {};
    const reload = jest.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    const { result } = await renderHook(() => usePullToRefresh(reload));

    await act(async () => {
      result.current.onRefresh();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      settle();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("takes the indicator back when the load fails, so the screen is never stuck", async () => {
    const reload = jest.fn().mockRejectedValue(new Error("offline"));
    const { result } = await renderHook(() => usePullToRefresh(reload));

    await act(async () => {
      result.current.onRefresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });
});
