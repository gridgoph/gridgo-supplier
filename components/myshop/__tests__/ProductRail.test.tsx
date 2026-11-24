import { render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

import { ProductRail } from "@/components/myshop/ProductRail";
import { normalizeListing, type Listing } from "@/lib/listings";

function listing(id: string, overrides: Record<string, unknown> = {}): Listing {
  const value = normalizeListing({
    id,
    version: 1,
    name: `Product ${id}`,
    basePriceMinor: 1000,
    active: true,
    photos: [],
    ...overrides,
  });
  if (!value) throw new Error("fixture did not normalise");
  return value;
}

function rail(listings: Listing[]) {
  return render(
    <ProductRail
      listings={listings}
      total={listings.length}
      services={[]}
      readiness={null}
      shopApproved
      loading={false}
      error={null}
    />,
  );
}

describe("ProductRail", () => {
  /*
   * Issue report 8DC78D1F (gridgo-supplier#296). On a phone, NativeWind merges
   * a Pressable's `className` with its `style` into `[classStyle, styleFn]`,
   * and React Native only calls `style` when it is itself a function — so a
   * function inside that array is dropped. The tile's width lived in that
   * function, so on Android a tile had no width and its square photo grew to
   * the picture's own pixel size, which closed the app. Jest and the web never
   * take that merge, so this pins the shape instead: whatever carries the
   * tile's size must not also carry a className.
   */
  it("keeps each tile's width on a Pressable without a className", async () => {
    await rail([listing("a"), listing("b")]);

    for (const id of ["a", "b"]) {
      const tile = screen.getByTestId(`product-tile-${id}`);
      expect(tile.props.className).toBeUndefined();
    }
  });

  it("never pairs a className with a style function in the rail", () => {
    const source = readFileSync(join(__dirname, "..", "ProductRail.tsx"), "utf8");
    // Each opening tag ends on a line of its own: a bare `>` (an arrow's `=>` is not one).
    const pressables = source.split("<Pressable").slice(1).map((chunk) => chunk.split(/\n\s*>\s*\n/)[0]);
    expect(pressables.length).toBeGreaterThan(0);
    for (const props of pressables) {
      const styleFunction = /style=\{\s*\(\s*\{\s*pressed/.test(props);
      expect(styleFunction && /className=/.test(props)).toBe(false);
    }
  });

  it("shows a product it cannot draw plainly and keeps the rest", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    // A price GRIDGO should never send: not whole centavos. Formatting it throws.
    await rail([listing("good"), listing("bad", { name: "Broken price", basePriceMinor: 12.5 }), listing("also")]);

    expect(screen.getByText("Product good")).toBeTruthy();
    expect(screen.getByText("Product also")).toBeTruthy();
    expect(screen.getByTestId("product-tile-bad-unavailable")).toBeTruthy();
    expect(screen.getByText("Broken price")).toBeTruthy();
    expect(screen.getByText("Can't show this here")).toBeTruthy();
    consoleError.mockRestore();
  });
});
