import { DELETION_NO_SESSION, DELETION_PASSWORD_WRONG, DELETION_REQUEST_FAILED } from "@/lib/accountDeletion";
import { requestAccountDeletion } from "@/lib/api";
import { useAccountDeletion } from "@/store/accountDeletion";

jest.mock("@/lib/api", () => ({ requestAccountDeletion: jest.fn() }));

const send = requestAccountDeletion as jest.Mock;

function session(attempt: jest.Mock = jest.fn(async () => ({ status: "complete" }))) {
  return {
    startVerification: jest.fn(async () => ({
      status: "needs_first_factor",
      supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "c***@example.com" }],
    })),
    prepareFirstFactorVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
    attemptFirstFactorVerification: attempt,
  };
}

beforeEach(() => {
  useAccountDeletion.getState().reset();
  send.mockReset().mockResolvedValue({ ok: true, message: "We will delete your account within 30 days" });
});

describe("the deletion request waits on the person proving it is them", () => {
  it("sends one request only after the password is confirmed", async () => {
    const s = session();
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", s);

    expect(s.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "password", password: "secret-pass" });
    expect(send).toHaveBeenCalledTimes(1);
    const state = useAccountDeletion.getState();
    expect(state.sent).toBe(true);
    // The password does not outlive the check.
    expect(state.secret).toBe("");
  });

  it("never sends the request when the password is wrong", async () => {
    const s = session(jest.fn(async () => {
      throw { errors: [{ code: "form_password_incorrect" }] };
    }));
    useAccountDeletion.getState().setSecret("wrong");
    await useAccountDeletion.getState().submit("password", s);

    expect(send).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, fieldError: DELETION_PASSWORD_WRONG, busy: null });
  });

  it("never sends without a Clerk session to check against", async () => {
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", null);

    expect(send).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState().error).toBe(DELETION_NO_SESSION);
  });

  it("emails a code, then sends after the code is confirmed", async () => {
    const s = session();
    await useAccountDeletion.getState().emailCode(s);
    expect(useAccountDeletion.getState()).toMatchObject({ codeSent: true, destination: "c***@example.com" });
    expect(send).not.toHaveBeenCalled();

    useAccountDeletion.getState().setSecret("123456");
    await useAccountDeletion.getState().submit("email_code", s);
    expect(s.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().sent).toBe(true);
  });

  it("retries a failed send without asking for the proof again", async () => {
    const s = session();
    send.mockRejectedValueOnce(new Error("offline"));
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", s);
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, error: DELETION_REQUEST_FAILED });

    await useAccountDeletion.getState().submit("password", s);
    expect(s.attemptFirstFactorVerification).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(useAccountDeletion.getState().sent).toBe(true);
  });

  it("forgets everything when the screen closes", async () => {
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", session());
    useAccountDeletion.getState().reset();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, secret: "", confirmedAt: null });
  });
});
