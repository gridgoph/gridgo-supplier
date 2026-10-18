import { fireEvent, render, screen } from "@testing-library/react-native";

import { JobTicketCode } from "@/components/JobTicketCode";

describe("JobTicketCode", () => {
  it("is six boxes over one OS autofill field, not a lone verification field", async () => {
    await render(
      <JobTicketCode
        email="shop@example.com"
        value="148"
        onChange={jest.fn()}
        onVerify={jest.fn()}
        onResend={jest.fn()}
      />,
    );

    expect(screen.getByText("Check your email")).toBeTruthy();
    expect(screen.getByText("We sent a 6-digit code to shop@example.com")).toBeTruthy();
    const field = screen.getByLabelText("6-digit code");
    expect(field).toBeTruthy();
    expect(field.props.textContentType).toBe("oneTimeCode");
    expect(field.props.autoComplete).toBe("one-time-code");
    expect(field.props.inputMode).toBe("numeric");
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.maxLength).toBe(6);
    expect(field.props.keyboardType).toBe("number-pad");
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.getByText("Verify email")).toBeTruthy();
    expect(screen.getByText("Send another code")).toBeTruthy();
  });

  it("calls the emailed code a code, never a job number", async () => {
    await render(
      <JobTicketCode
        title=""
        email="reviewer@example.com"
        value=""
        onChange={jest.fn()}
        onVerify={jest.fn()}
        onResend={jest.fn()}
      />,
    );

    expect(screen.getByText("We sent a 6-digit code to reviewer@example.com")).toBeTruthy();
    expect(screen.queryByText(/job number/)).toBeNull();
    expect(screen.queryByLabelText(/job number/)).toBeNull();
  });

  it("resends and only verifies a full six digits", async () => {
    const onVerify = jest.fn();
    const onResend = jest.fn();
    const onChange = jest.fn();

    const view = await render(
      <JobTicketCode
        email="shop@example.com"
        value="12"
        onChange={onChange}
        onVerify={onVerify}
        onResend={onResend}
      />,
    );

    expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
    await fireEvent.press(screen.getByLabelText("Send another code"));
    expect(onResend).toHaveBeenCalledTimes(1);

    await view.rerender(
      <JobTicketCode
        email="shop@example.com"
        value="148203"
        onChange={onChange}
        onVerify={onVerify}
        onResend={onResend}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Verify email" }));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });
});
