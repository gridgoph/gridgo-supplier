import { ApiError } from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";

describe("humanizeApiError", () => {
  it("does not call a 404 a connection failure", () => {
    const error = new ApiError(404, { error: "not_found" });
    const message = humanizeApiError(error, offlineMessage("open your GRIDGO account"));
    expect(message).not.toMatch(/Cannot reach GRIDGO/);
    expect(message).not.toMatch(/connection/);
    expect(message).toMatch(/shop account|Operations|Update the app/i);
  });

  it("does not call a 404 without a known code a connection failure either", () => {
    const error = new ApiError(404, { error: "missing_route" });
    const message = humanizeApiError(error, offlineMessage("open your GRIDGO account"));
    expect(message).not.toMatch(/Cannot reach GRIDGO/);
    expect(message).not.toMatch(/connection/);
  });

  it("still uses the offline sentence when nothing reached GRIDGO", () => {
    expect(humanizeApiError(new TypeError("Network request failed"), offlineMessage("open your GRIDGO account"))).toBe(
      offlineMessage("open your GRIDGO account"),
    );
  });
});
