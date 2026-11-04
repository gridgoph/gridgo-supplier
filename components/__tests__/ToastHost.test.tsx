import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { ToastHost } from "@/components/ToastHost";
import { useToasts, useViewing } from "@/store/toasts";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const toast = { id: "t", title: "Ready for pickup", body: "Riders can pick this up from 8:00 AM tomorrow.", orderId: "job" };

async function showAndTap() {
  await render(<ToastHost />);
  await act(async () => {
    useToasts.getState().show(toast);
  });
  await fireEvent.press(screen.getByLabelText(`${toast.title}. ${toast.body}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  useToasts.getState().clear();
  useViewing.getState().setOrder(null);
});

it("opens the job from a toast about another screen", async () => {
  await showAndTap();
  expect(router.push).toHaveBeenCalledWith({ pathname: "/job/[id]", params: { id: "job" } });
});

it("only dismisses a toast about the job already on screen", async () => {
  useViewing.getState().setOrder("job");
  await showAndTap();
  expect(router.push).not.toHaveBeenCalled();
  expect(useToasts.getState().toasts).toHaveLength(0);
});
