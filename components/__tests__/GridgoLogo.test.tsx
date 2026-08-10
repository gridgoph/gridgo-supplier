import { render, screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";

import {
  GRIDGO_LOGO_ROLES,
  GridgoLogo,
  gridgoLockupMetrics,
  type GridgoLogoRole,
} from "@/components/GridgoLogo";

function lineHeightOf(element: { props: { style?: unknown } }): number {
  const style = StyleSheet.flatten(element.props.style as TextStyle);
  const lineHeight = style?.lineHeight;
  if (typeof lineHeight !== "number") {
    throw new Error("expected the lockup text to carry an explicit lineHeight");
  }
  return lineHeight;
}

function markHeight(): number {
  const height = screen.getByTestId("gridgo-mark").props.height;
  return typeof height === "number" ? height : Number(height);
}

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

  /*
   * The lockup has regressed twice to a mark only as tall as the wordmark
   * line, with the role hung under the whole row. These pin the shape itself:
   * the mark spans the text block, not one line of it.
   */
  describe("the mark spans the full text block", () => {
    it("stands as tall as both lines of a role lockup", async () => {
      await render(<GridgoLogo size={48} role="supplier" />);

      const wordmarkLine = lineHeightOf(screen.getByText("GRIDGO"));
      const roleLine = lineHeightOf(screen.getByText("Supplier"));

      expect(markHeight()).toBe(48);
      expect(wordmarkLine + roleLine).toBe(48);
      // Not the one-line mark this keeps reverting to.
      expect(markHeight()).toBeGreaterThan(wordmarkLine);
    });

    it("matches the single wordmark line when there is no role", async () => {
      await render(<GridgoLogo size={32} />);

      expect(markHeight()).toBe(32);
      expect(lineHeightOf(screen.getByText("GRIDGO"))).toBe(32);
    });

    /**
     * Satoshi's cuts draw different cap heights, so the ratio the reference
     * fixes — role caps against GRIDGO caps — is not the ratio of type sizes.
     * Assert the drawn one; that is what the reference was measured on.
     */
    const SATOSHI_BLACK_CAP = 0.74;
    const SATOSHI_MEDIUM_CAP = 0.723;

    it.each([40, 48, 64])(
      "draws the role caps at ~0.78 of the wordmark caps at size %i",
      (size) => {
        const { wordmarkSize, roleSize } = gridgoLockupMetrics(size, true);
        const capRatio =
          (roleSize * SATOSHI_MEDIUM_CAP) / (wordmarkSize * SATOSHI_BLACK_CAP);

        expect(roleSize).toBeLessThan(wordmarkSize);
        expect(capRatio).toBeGreaterThan(0.75);
        expect(capRatio).toBeLessThan(0.81);
      },
    );

    it("never sets the role word below the 12px type floor", () => {
      expect(gridgoLockupMetrics(20, true).roleSize).toBe(12);
      expect(gridgoLockupMetrics(40, true).roleSize).toBeGreaterThan(12);
    });

    it.each([28, 32, 40, 48, 64])(
      "keeps mark height equal to the text block at size %i",
      (size) => {
        const lockup = gridgoLockupMetrics(size, true);
        expect(lockup.markSize).toBe(
          lockup.wordmarkLineHeight + lockup.roleLineHeight,
        );

        const solo = gridgoLockupMetrics(size, false);
        expect(solo.markSize).toBe(solo.wordmarkLineHeight);
        expect(solo.roleLineHeight).toBe(0);
      },
    );
  });

  it("exposes every product role as typed data", () => {
    const roles: GridgoLogoRole[] = [...GRIDGO_LOGO_ROLES];
    expect(roles).toEqual(["client", "business", "supplier", "rider", "admin"]);
  });
});
