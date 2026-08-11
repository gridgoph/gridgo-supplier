import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { PasswordField } from "@/components/controls/PasswordField";

describe("PasswordField", () => {
  it("starts hidden and toggles without changing the value", async () => {
    const onChange = jest.fn();
    await render(
      <PasswordField
        value="secret-value"
        onChange={onChange}
        placeholder="Your password"
        accessibilityLabel="Password"
      />,
    );

    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Show password")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Show password"));

    await waitFor(() => {
      expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    });
    expect(screen.getByLabelText("Hide password")).toBeTruthy();
    expect(screen.getByLabelText("Password").props.value).toBe("secret-value");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Hide password"));

    await waitFor(() => {
      expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    });
    expect(screen.getByLabelText("Show password")).toBeTruthy();
  });
});
