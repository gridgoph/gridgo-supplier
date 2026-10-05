import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { ListingWizardRail } from "@/components/listing/ListingWizardRail";
import { WIZARD_STEPS, type WizardStepId } from "@/lib/listingWizard";

/**
 * Seven labels do not always fit across a phone; the rail keeps the step the
 * shop is on, and the next one, in view instead of clipping "Review".
 */

const LABEL_WIDTH = 60;

async function layOut(current: WizardStepId, railWidth: number) {
  const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  const view = await render(
    <ListingWizardRail
      current={current}
      furthest="review"
      committed
      currentCanProceed
      onSelect={jest.fn()}
    />,
  );
  await fireEvent(screen.getByLabelText("Add a listing steps"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: railWidth, height: 44 } },
  });
  // Called directly: the current tab is disabled, and RNTL's fireEvent skips
  // a disabled element's handlers — layout still happens to it on a phone.
  for (const [index, step] of WIZARD_STEPS.entries()) {
    await act(async () => {
      screen.getByLabelText(step.label).props.onLayout({
        nativeEvent: { layout: { x: 8 + index * LABEL_WIDTH, y: 0, width: LABEL_WIDTH, height: 44 } },
      });
    });
  }
  return { scrollTo, view };
}

afterEach(() => jest.restoreAllMocks());

it("scrolls Review fully into view on a rail too narrow for every step", async () => {
  const { scrollTo, view } = await layOut("review", 390);
  // Review ends at 8 + 7 × 60 = 428; a 390 rail with its 8pt gutter needs 46.
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 46, animated: true });
  await view.unmount();
});

it("stays at the start while the first steps fit", async () => {
  const { scrollTo, view } = await layOut("pick", 390);
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
  await view.unmount();
});
