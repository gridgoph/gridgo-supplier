import { fireEvent, render, screen } from "@testing-library/react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "all", label: "All" },
] as const;

describe("SegmentedControl", () => {
  it("is a radio group, so the selected segment is announced as selected", async () => {
    await render(
      <SegmentedControl
        options={RANGES}
        value="week"
        onChange={jest.fn()}
        accessibilityLabel="Schedule range"
      />,
    );

    expect(screen.getByLabelText("Schedule range")).toBeTruthy();
    expect(screen.getByLabelText("7 days").props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText("Today").props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it("reports the value behind the label that was pressed", async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        options={RANGES}
        value="week"
        onChange={onChange}
        accessibilityLabel="Schedule range"
      />,
    );

    fireEvent.press(screen.getByLabelText("Today"));
    expect(onChange).toHaveBeenCalledWith("today");
  });

  it("takes its geometry from GRIDGO radii, not from the platform", async () => {
    // The bug this control was built to fix: iOS drew UISegmentedControl's own
    // continuous rounding and Android's recreation hard-coded 9pt, on a screen
    // whose fields are 12. The track is a field; the segment is 12 less the
    // 4pt padding, so the curves stay concentric.
    await render(
      <SegmentedControl
        options={RANGES}
        value="today"
        onChange={jest.fn()}
        accessibilityLabel="Schedule range"
      />,
    );

    expect(screen.getByLabelText("Schedule range").props.className).toContain(
      "rounded-field",
    );
    for (const option of RANGES) {
      expect(screen.getByLabelText(option.label).props.className).toContain("rounded-sm");
    }
  });

  it("keeps every segment at the 44dp touch floor", async () => {
    await render(
      <SegmentedControl
        options={RANGES}
        value="today"
        onChange={jest.fn()}
        accessibilityLabel="Schedule range"
      />,
    );

    for (const option of RANGES) {
      expect(screen.getByLabelText(option.label).props.className).toContain("min-h-11");
    }
  });

  it("does not fire while disabled", async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        options={RANGES}
        value="today"
        onChange={onChange}
        accessibilityLabel="Schedule range"
        disabled
      />,
    );

    fireEvent.press(screen.getByLabelText("All"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
