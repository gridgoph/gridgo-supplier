import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";

const ROOT = path.resolve(__dirname, "../../..");
const MINIMUM_TEXT_INSET = 24;

function flattenedInputStyle(accessibilityLabel: string) {
  return StyleSheet.flatten(screen.getByLabelText(accessibilityLabel).props.style) ?? {};
}

describe("field text insets", () => {
  it("keeps the shared field shell at GRIDGO's 24px typeset margin", () => {
    const css = fs.readFileSync(path.join(ROOT, "global.css"), "utf8");
    const utility = css.match(/@utility gg-field\s*\{([^}]*)\}/)?.[1];

    expect(utility).toBeDefined();
    expect(utility).toContain("px-6");
    expect(utility).not.toMatch(/\bpx-3\b/);
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

    expect(flattenedInputStyle("Shop name").paddingHorizontal).toBeGreaterThanOrEqual(
      MINIMUM_TEXT_INSET,
    );
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

    expect(flattenedInputStyle("Password").paddingHorizontal).toBeGreaterThanOrEqual(
      MINIMUM_TEXT_INSET,
    );
    expect(screen.getByLabelText("Show password")).toBeTruthy();
  });
});
