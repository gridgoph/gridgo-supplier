import { fireEvent, render, screen } from "@testing-library/react-native";

import { ORDER_ACTIONS_PREVIEW, OrderActionList } from "@/components/OrderActionList";

const rows = Array.from({ length: ORDER_ACTIONS_PREVIEW + 2 }, (_, index) => ({
  id: `r${index}`,
  what: index === 0 ? "Messaged the client" : "Added a file",
  who: index === 1 ? null : "Ana (Staff)",
  at: "2026-11-10T06:14:00.000Z",
}));

it("names the person, the action and the time, and opens the rest on request", async () => {
  await render(<OrderActionList rows={rows} />);
  expect(screen.getByText("Who did what")).toBeTruthy();
  expect(screen.getByText(/messaged the client/)).toBeTruthy();
  // Nobody recorded: the action alone, never a made-up name.
  expect(screen.getByText("Added a file")).toBeTruthy();
  expect(screen.getAllByText(/added a file/)).toHaveLength(ORDER_ACTIONS_PREVIEW - 2);
  await fireEvent.press(screen.getByText(`Show all ${rows.length}`));
  expect(screen.getAllByText(/added a file/)).toHaveLength(rows.length - 2);
  expect(screen.getByText("Show fewer")).toBeTruthy();
});

it("draws nothing without actions", async () => {
  await render(<OrderActionList rows={[]} />);
  expect(screen.queryByText("Who did what")).toBeNull();
});
