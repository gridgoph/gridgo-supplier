import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SamplePhoto } from "@/components/SamplePhoto";

describe("SamplePhoto viewer", () => {
  it("opens the sample full screen from a photo on this phone", async () => {
    const view = await render(
      <SamplePhoto localUri="file:///sample.jpg" altText="Flyers on the rack" />,
    );

    await fireEvent.press(screen.getByLabelText("Open Flyers on the rack larger"));

    expect(screen.getByTestId("sample-photo-viewer")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("close-sample-photo"));
    await waitFor(() => {
      expect(screen.queryByTestId("sample-photo-viewer")).toBeNull();
    });
    await view.unmount();
  });

  it("does not offer a viewer on an empty plate", async () => {
    const view = await render(<SamplePhoto emptyLabel="No sample yet" />);

    expect(screen.getByText("No sample yet")).toBeTruthy();
    expect(screen.queryByLabelText(/Open .* larger/)).toBeNull();
    expect(screen.queryByTestId("sample-photo-viewer")).toBeNull();
    await view.unmount();
  });
});
