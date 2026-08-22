import { fireEvent, render, screen } from "@testing-library/react-native";

import { FormatPlusField } from "@/components/FormatPlusField";
import { PUBLISHED_FILE_FORMATS, UNOPENED_FILE_MESSAGE } from "@/data/fileFormats";

describe("another type", () => {
  it("names the plus in the shop's own words", async () => {
    const view = await render(
      <FormatPlusField formats={PUBLISHED_FILE_FORMATS} selected={[]} onSelect={jest.fn()} />,
    );

    expect(screen.getByLabelText("Another type")).toBeTruthy();
    expect(screen.queryByLabelText("Type of file they send")).toBeNull();
    await view.unmount();
  });

  it("ticks JPEG when the shop types jpg", async () => {
    const onSelect = jest.fn();
    const view = await render(
      <FormatPlusField formats={PUBLISHED_FILE_FORMATS} selected={[]} onSelect={onSelect} />,
    );

    await fireEvent.press(screen.getByLabelText("Another type"));
    await fireEvent.changeText(screen.getByLabelText("Type of file they send"), "jpg");
    await fireEvent(screen.getByLabelText("Type of file they send"), "submitEditing");

    expect(onSelect).toHaveBeenCalledWith("jpeg");
    expect(screen.queryByLabelText("Type of file they send")).toBeNull();
    await view.unmount();
  });

  it("does not invent AI, and offers the https link instead", async () => {
    const onSelect = jest.fn();
    const view = await render(
      <FormatPlusField formats={PUBLISHED_FILE_FORMATS} selected={[]} onSelect={onSelect} />,
    );

    await fireEvent.press(screen.getByLabelText("Another type"));
    await fireEvent.changeText(screen.getByLabelText("Type of file they send"), "AI");
    await fireEvent(screen.getByLabelText("Type of file they send"), "submitEditing");

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(UNOPENED_FILE_MESSAGE)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Use Any other https link"));

    expect(onSelect).toHaveBeenCalledWith("other_link");
    await view.unmount();
  });
});
