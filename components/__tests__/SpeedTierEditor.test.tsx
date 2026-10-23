import { render, screen } from "@testing-library/react-native";

import { SpeedTierEditor } from "@/components/listing/TierEditor";
import { workingDays } from "@/lib/productionDays";

it.each(["per piece", "per pack of 100", "per sq.ft", "for the whole job"])(
  "describes a speed price using the listing's unit: %s",
  async (unitLabel) => {
    await render(
      <SpeedTierEditor
        unitLabel={unitLabel}
        tiers={[{ id: "quick", label: "Quick", turnaround: workingDays(2), priceMinor: 70050, surchargeMinor: null }]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(`2 working days · ${unitLabel}`)).toBeTruthy();
    expect(screen.getByText(`Price ${unitLabel} at this speed`)).toBeTruthy();
    expect(screen.queryByText("Whole-job price")).toBeNull();
  },
);
