import { fireEvent, render, screen } from "@testing-library/react-native";

import { CategoryRankList } from "@/components/CategoryRankList";

const categories = [
  { code: "marketing", name: "Marketing & promotional collateral", bestFor: "What you do best" },
  { code: "corporate", name: "Corporate & event merchandise", bestFor: "Your second choice" },
] as const;

describe("CategoryRankList", () => {
  it("closes a chosen category with Remove, not a check mark", async () => {
    const onToggle = jest.fn();

    await render(
      <CategoryRankList
        categories={categories}
        value={["marketing", "corporate"]}
        onToggle={onToggle}
        onPromote={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Remove Marketing & promotional collateral")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Remove Corporate & event merchandise"));
    expect(onToggle).toHaveBeenCalledWith("corporate");
  });
});
