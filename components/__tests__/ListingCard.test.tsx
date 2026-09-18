import { render, screen } from "@testing-library/react-native";

import { ListingCard } from "@/components/ListingCard";
import { ListingRow } from "@/components/ListingRow";
import type { Listing } from "@/lib/listings";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getDownloadUrl: jest.fn(async () => {
    throw new Error("no storage on the bench");
  }),
}));

const listing: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin, 13oz",
  description: "",
  basePriceMinor: 45000,
  pricingUnit: "per_unit",
  packageQty: null,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  printerMaxWidthFeet: 5,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundMode: "override",
  turnaroundHours: 24,
  fileFormatMode: "override",
  formatCodes: ["pdf"],
  onTheBoard: true,
  sortOrder: 0,
  photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
  groups: [],
  blockers: [],
  version: 1,
  updatedAt: null,
};

describe("listing standing chips", () => {
  it("draws Live on a tile GRIDGO has accepted onto the board, even with no description", async () => {
    const view = await render(
      <ListingCard
        listing={listing}
        catalog={null}
        services={[]}
        shopApproved
        onPress={() => undefined}
      />,
    );

    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText("Not ready yet")).toBeNull();
    await view.unmount();
  });

  it("draws the same Live chip on the list row", async () => {
    const view = await render(
      <ListingRow
        listing={listing}
        catalog={null}
        services={[]}
        shopApproved
        onPress={() => undefined}
      />,
    );

    expect(screen.getByText("Live")).toBeTruthy();
    await view.unmount();
  });

  it("draws Hidden, Not ready yet, and Waiting for shop approval as their own chips", async () => {
    const hidden = { ...listing, id: "h", onTheBoard: false };
    const unfinished = { ...listing, id: "u", blockers: ["photo"] };
    const waiting = { ...listing, id: "w" };

    const hiddenView = await render(
      <ListingCard listing={hidden} catalog={null} services={[]} shopApproved onPress={() => undefined} />,
    );
    expect(screen.getByText("Hidden")).toBeTruthy();
    await hiddenView.unmount();

    const unfinishedView = await render(
      <ListingCard listing={unfinished} catalog={null} services={[]} shopApproved onPress={() => undefined} />,
    );
    expect(screen.getByText("Not ready yet")).toBeTruthy();
    await unfinishedView.unmount();

    const waitingView = await render(
      <ListingCard listing={waiting} catalog={null} services={[]} shopApproved={false} onPress={() => undefined} />,
    );
    expect(screen.getByText("Waiting for shop approval")).toBeTruthy();
    await waitingView.unmount();
  });
});
