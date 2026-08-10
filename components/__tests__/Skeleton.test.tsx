import { fireEvent, render, screen } from "@testing-library/react-native";

import { JobCardSkeleton, SkeletonBlock, SkeletonList } from "@/components/Skeleton";

describe("Skeleton", () => {
  it("announces what is loading once, not once per bar", async () => {
    await render(<SkeletonList label="Loading your assignments" count={3} />);

    expect(screen.getByLabelText("Loading your assignments")).toBeTruthy();
  });

  it("draws the heading the real list is grouped under, so the list does not shift", async () => {
    const { unmount } = await render(<SkeletonList label="Loading" count={1} sectioned />);
    const withHeading = screen.getByLabelText("Loading").children.length;
    await unmount();

    await render(<SkeletonList label="Loading" count={1} />);
    expect(withHeading).toBe(screen.getByLabelText("Loading").children.length + 1);
  });

  it("keeps a placeholder in the shape it was asked for", async () => {
    // The sweep travels inside the shape, so the shape has to clip.
    const view = await render(<SkeletonBlock className="h-6 w-24 rounded-pill" />);

    expect(JSON.stringify(view.toJSON())).toContain(
      "overflow-hidden rounded-field bg-surface-variant h-6 w-24 rounded-pill",
    );
  });

  it("survives being measured — the sweep waits for a width rather than guessing one", async () => {
    const { unmount } = await render(<JobCardSkeleton compact />);

    // The card is hidden from assistive technology on purpose — a screen reader
    // hears the list's one label, not eight bars — so the query has to look past
    // that to reach the placeholders inside it.
    const hidden = { includeHiddenElements: true };
    const sweeps = screen.getAllByTestId("skeleton-sweep", hidden);
    expect(sweeps.length).toBe(3);
    for (const sweep of sweeps) {
      fireEvent(sweep, "layout", { nativeEvent: { layout: { width: 200, height: 12 } } });
    }
    expect(screen.getAllByTestId("skeleton-sweep", hidden).length).toBe(3);

    // The sweep repeats forever by design, so the placeholder has to cancel it
    // on the way out — otherwise this suite would never finish.
    await unmount();
  });
});
