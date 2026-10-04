import { fireEvent, render, screen } from "@testing-library/react-native";

import { CategoryRankList } from "@/components/CategoryRankList";

const categories = [
  {
    code: "marketing",
    name: "Marketing & promotional collateral",
    bestFor: "What you do best",
    products: [
      { code: "flyers", name: "Flyers", examples: "Single sheets, event promos" },
      { code: "business_cards", name: "Business cards", examples: "Standard, matte, glossy" },
    ],
  },
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

  it("names a category's products and opens what each one covers", async () => {
    await render(
      <CategoryRankList categories={categories} value={[]} onToggle={jest.fn()} onPromote={jest.fn()} />,
    );

    expect(screen.getByText("Flyers, Business cards")).toBeTruthy();
    expect(screen.queryByText("Single sheets, event promos")).toBeNull();

    await fireEvent.press(
      screen.getByLabelText("What these 2 products cover, Marketing & promotional collateral"),
    );
    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.getByText("Single sheets, event promos")).toBeTruthy();
    expect(screen.getByText("Standard, matte, glossy")).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText("Hide the details, Marketing & promotional collateral"),
    );
    expect(screen.queryByText("Single sheets, event promos")).toBeNull();
  });

  it("opening the products does not choose the category", async () => {
    const onToggle = jest.fn();
    await render(
      <CategoryRankList categories={categories} value={[]} onToggle={onToggle} onPromote={jest.fn()} />,
    );

    await fireEvent.press(
      screen.getByLabelText("What these 2 products cover, Marketing & promotional collateral"),
    );
    expect(onToggle).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("Add Marketing & promotional collateral"));
    expect(onToggle).toHaveBeenCalledWith("marketing");
  });

  it("keeps the products under a chosen category too", async () => {
    await render(
      <CategoryRankList
        categories={categories}
        value={["marketing"]}
        onToggle={jest.fn()}
        onPromote={jest.fn()}
      />,
    );
    expect(screen.getByText("Flyers, Business cards")).toBeTruthy();
  });

  it("draws no disclosure for a category with no products", async () => {
    await render(
      <CategoryRankList categories={categories} value={[]} onToggle={jest.fn()} onPromote={jest.fn()} />,
    );
    expect(screen.queryByLabelText(/cover, Corporate/)).toBeNull();
  });
});
