import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BrandIntro } from "@/components/BrandIntro";

/**
 * The opening is motion, and motion is not what a test can read. What it can
 * hold is the contract around it: the app is named once, the launch line is
 * there to be read, and a tap gets past it — because an overlay that cannot be
 * dismissed is the one way this could keep someone out of the app.
 */

function renderIntro(onDone: () => void = jest.fn()) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <BrandIntro onDone={onDone} />
    </SafeAreaProvider>,
  );
}

describe("BrandIntro", () => {
  it("says who this is once, rather than spelling out the mark", async () => {
    await renderIntro();
    expect(screen.getByLabelText("GRIDGO Supplier")).toBeTruthy();
  });

  it("carries the line the product opens on", async () => {
    await renderIntro();
    expect(screen.getByText("MAPPING THE FUTURE OF PRINTING")).toBeTruthy();
  });

  it("names which of the three apps just opened", async () => {
    await renderIntro();
    expect(screen.getByText("SUPPLIER")).toBeTruthy();
  });

  // Presses last: a second render in this file after one comes back empty
  // (see AGENTS.md on @testing-library/react-native 14 under React 19).
  it("hands the app over on a tap instead of holding the screen", async () => {
    const onDone = jest.fn();
    await renderIntro(onDone);

    fireEvent.press(screen.getByLabelText("GRIDGO Supplier"));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
