import { render, screen } from "@testing-library/react-native";

import {
  GRIDGO_LOGO_ROLES,
  GridgoLogo,
  type GridgoLogoRole,
} from "@/components/GridgoLogo";

describe("GridgoLogo", () => {
  // @testing-library/react-native 14 made render/unmount async by default.
  it("renders the bare wordmark with a single GRIDGO accessibility label", async () => {
    await render(<GridgoLogo />);

    expect(screen.getByLabelText("GRIDGO")).toBeTruthy();
    // Nested Text runs combine to GRIDGO; query the full wordmark once.
    expect(screen.getByText("GRIDGO")).toBeTruthy();
    expect(screen.queryByText("Supplier")).toBeNull();
    expect(screen.queryByText("Business")).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull();
    expect(screen.queryByText("RIDER")).toBeNull();
  });

  it("treats client as the bare wordmark (no role label)", async () => {
    await render(<GridgoLogo role="client" />);

    expect(screen.getByLabelText("GRIDGO")).toBeTruthy();
    expect(screen.queryByText("Supplier")).toBeNull();
  });

  it.each([
    ["business", "Business", "GRIDGO Business"],
    ["supplier", "Supplier", "GRIDGO Supplier"],
    ["admin", "Admin", "GRIDGO Admin"],
  ] as const)(
    "renders the %s plain-type lockup as one accessible node",
    async (role, label, a11y) => {
      await render(<GridgoLogo role={role} />);

      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByLabelText(a11y)).toBeTruthy();
      // One image node for the whole lockup — not separate pieces.
      expect(screen.getAllByLabelText(a11y)).toHaveLength(1);
      expect(screen.getByRole("image")).toBeTruthy();
    },
  );

  it("renders the rider lockup as a yellow pill with dark text", async () => {
    await render(<GridgoLogo role="rider" />);

    expect(screen.getByText("RIDER")).toBeTruthy();
    expect(screen.getByLabelText("GRIDGO Rider")).toBeTruthy();
    expect(screen.queryByText("Rider")).toBeNull();
    expect(screen.getAllByLabelText("GRIDGO Rider")).toHaveLength(1);
  });

  it("exposes every product role as typed data", () => {
    const roles: GridgoLogoRole[] = [...GRIDGO_LOGO_ROLES];
    expect(roles).toEqual(["client", "business", "supplier", "rider", "admin"]);
  });
});
