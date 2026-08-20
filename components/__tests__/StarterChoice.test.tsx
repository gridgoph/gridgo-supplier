import { fireEvent, render, screen } from "@testing-library/react-native";

import { StarterChoice, starterDetail } from "@/components/StarterChoice";
import type { ListingStarter } from "@/lib/listings";

const flyers: ListingStarter = {
  id: "lst_flyers",
  name: "Flyers",
  subcategoryCode: "flyers",
  pricingUnit: "per_package",
  packageQty: 100,
  turnaroundHours: 48,
  formatCodes: ["pdf"],
  specCount: 3,
  addOnCount: 1,
};

const tarp: ListingStarter = {
  id: "lst_tarpaulins_outdoor_banners",
  name: "Tarpaulin",
  subcategoryCode: "tarpaulins_outdoor_banners",
  pricingUnit: "per_unit",
  packageQty: null,
  turnaroundHours: 24,
  formatCodes: ["pdf"],
  specCount: 3,
  addOnCount: 2,
};

describe("StarterChoice", () => {
  it("labels a GRIDGO starter by the work's name, not a concatenated title", async () => {
    await render(
      <StarterChoice
        starters={[flyers]}
        value="lst_flyers"
        blankValue="__blank__"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText("GRIDGO starter")).toBeTruthy();
    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.queryByText("GRIDGO starter — Flyers")).toBeNull();
    expect(screen.getByRole("radio", { name: "GRIDGO starter, Flyers" })).toBeTruthy();
  });

  it("selects the GRIDGO starter by default and still offers a blank start", async () => {
    const onChange = jest.fn();
    await render(
      <StarterChoice
        starters={[flyers]}
        value="lst_flyers"
        blankValue="__blank__"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "GRIDGO starter, Flyers", checked: true }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Start blank", checked: false })).toBeTruthy();

    await fireEvent.press(screen.getByRole("radio", { name: "Start blank" }));
    expect(onChange).toHaveBeenCalledWith("__blank__");
  });

  it("keeps blank available when there is more than one starter", async () => {
    await render(
      <StarterChoice
        starters={[flyers, tarp]}
        value="lst_flyers"
        blankValue="__blank__"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getAllByText("GRIDGO starter")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Start blank" })).toBeTruthy();
  });

  it("says what a starter brings", () => {
    expect(starterDetail(flyers)).toContain("3 steps");
    expect(starterDetail(flyers)).toContain("1 add-on");
  });
});
