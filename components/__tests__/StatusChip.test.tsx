import { render, screen } from "@testing-library/react-native";

import { StatusChip } from "@/components/StatusChip";

describe("StatusChip", () => {
  // @testing-library/react-native 14 made render/unmount async by default
  // (see its "Migration to 14.0" notes). The brief's assertions are
  // unchanged; only await was added so they run after render settles.
  it("states the status in words, so colour never carries meaning alone", async () => {
    await render(<StatusChip tone="success" label="Approved" icon="circle-check" />);

    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("renders an icon beside the label", async () => {
    await render(<StatusChip tone="error" label="Blocked" icon="circle-x" />);

    expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
  });

  it("accepts every icon in the registry", async () => {
    const icons = ["circle-check", "triangle-alert", "circle-x", "clock", "square-pen"] as const;

    for (const icon of icons) {
      const { unmount } = await render(<StatusChip tone="neutral" label={icon} icon={icon} />);
      expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
      await unmount();
    }
  });
});
