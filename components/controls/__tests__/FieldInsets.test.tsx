import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { ShopLocationPicker } from "@/components/ShopLocationPicker";
import { MoneyField } from "@/components/controls/MoneyField";
import { NoteField } from "@/components/controls/NoteField";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";

jest.mock("react-native-webview", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  const WebView = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: () => undefined }));
    return React.createElement(View);
  });
  WebView.displayName = "MockWebView";

  return { WebView };
});

const ROOT = path.resolve(__dirname, "../../..");
const MINIMUM_TEXT_INSET = 24;

function flattenedInputStyle(accessibilityLabel: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByLabelText(accessibilityLabel).props.style) ?? {};
}

function expectNativeInset(accessibilityLabel: string, vertical: "center" | "top" = "center") {
  const style = flattenedInputStyle(accessibilityLabel);

  expect(style.paddingStart).toEqual(expect.any(Number));
  expect(style.paddingStart).toBeGreaterThanOrEqual(MINIMUM_TEXT_INSET);
  expect(style.paddingEnd).toEqual(expect.any(Number));
  expect(style.paddingEnd).toBeGreaterThanOrEqual(MINIMUM_TEXT_INSET);
  expect(style.includeFontPadding).toBe(false);
  expect(style.textAlignVertical).toBe(vertical);
}

describe("field text insets", () => {
  it("keeps horizontal padding out of gg-field so NativeWind cannot clobber native insets", () => {
    const css = fs.readFileSync(path.join(ROOT, "global.css"), "utf8");
    const utility = css.match(/@utility gg-field\s*\{([^}]*)\}/)?.[1];

    expect(utility).toBeDefined();
    expect(utility).not.toMatch(/\b(?:p|px|ps|pe|pl|pr)-/);
  });

  it("applies the inset to the native TextInput, not only its wrapper", async () => {
    await render(
      <TextField
        value="Gridgo Press"
        onChange={jest.fn()}
        placeholder="Shop name"
        accessibilityLabel="Shop name"
      />,
    );

    expectNativeInset("Shop name");
  });

  it("gives password text the same inset without removing the trailing control", async () => {
    await render(
      <PasswordField
        value="secret-value"
        onChange={jest.fn()}
        placeholder="Your password"
        accessibilityLabel="Password"
      />,
    );

    expectNativeInset("Password");
    expect(screen.getByLabelText("Show password")).toBeTruthy();
  });

  it("applies native insets to compound money fields", async () => {
    await render(
      <MoneyField value="1250" onChange={jest.fn()} accessibilityLabel="Supplier price" />,
    );

    expectNativeInset("Supplier price");
  });

  it("applies native insets without vertically centering multiline notes", async () => {
    await render(
      <NoteField
        value=""
        onChange={jest.fn()}
        placeholder="Reason for the delay"
        accessibilityLabel="Delay note"
      />,
    );

    expectNativeInset("Delay note", "top");
  });

  it("applies native insets to both shop-location fields", async () => {
    await render(
      <ShopLocationPicker
        pin={{ lat: 7.0731, lng: 125.6128, label: "GRIDGO Press" }}
        onChange={jest.fn()}
      />,
    );

    expectNativeInset("Search for your shop's address");
    expectNativeInset("Address at this pin");
  });
});
