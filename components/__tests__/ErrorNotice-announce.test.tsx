import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";

afterEach(() => jest.restoreAllMocks());

function container(message: string) {
  let node = screen.getByText(message).parent;
  while (node && !String(node.props.className ?? "").includes("border-error")) node = node.parent;
  return node;
}

it("stays quiet by default, as every existing notice is", async () => {
  await render(<ErrorNotice message="Could not load" />);
  expect(container("Could not load")?.props.accessibilityRole).toBeUndefined();
});

it("is an assertive alert when it announces itself", async () => {
  await render(<ErrorNotice message="No fix" announce />);
  const node = container("No fix");
  expect(node?.props.accessibilityRole).toBe("alert");
  expect(node?.props.accessibilityLiveRegion).toBe("assertive");
});

it("speaks it on iOS, which has no live regions", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  const speak = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  await render(<ErrorNotice message="No fix" announce />);
  expect(speak).toHaveBeenCalledWith("No fix");
});
