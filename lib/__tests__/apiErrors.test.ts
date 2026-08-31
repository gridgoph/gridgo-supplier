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

  it("names an unrecognized print category instead of a generic shop-details miss", () => {
    const error = new ApiError(400, {
      error: "invalid_application",
      fields: { "serviceCategories.0": "must identify an active governed category" },
    });
    const message = humanizeApiError(error, "fallback");
    expect(message).toMatch(/print categor/i);
    expect(message).not.toMatch(/shop, location, and services/i);
  });

  it("still uses the offline sentence when nothing reached GRIDGO", () => {
    expect(humanizeApiError(new TypeError("Network request failed"), offlineMessage("open your GRIDGO account"))).toBe(
      offlineMessage("open your GRIDGO account"),
    );
  });
});

describe("a refusal is not a dead connection", () => {
  it("never tells a shop to check its signal when GRIDGO answered", () => {
    // The captain's report: pressing start on a job the platform had
    // deliberately refused said "Cannot reach GRIDGO. Check this device's
    // connection." The connection was fine, so trying again did the same
    // thing, forever.
    const refused = new ApiError(409, { error: "some_new_rule" });
    const message = humanizeApiError(refused, offlineMessage("save this step"));
    expect(message).not.toMatch(/Cannot reach GRIDGO/);
    expect(message).not.toMatch(/connection/i);
    // And still no platform code on a screen, which is this app's own rule.
    expect(message).not.toMatch(/some_new_rule/);
    expect(message).not.toMatch(/_/);
    expect(message).toMatch(/[Nn]othing was changed/);
  });

  it("still says so when the request really never arrived", () => {
    expect(humanizeApiError(new Error("network"), offlineMessage("save this step")))
      .toMatch(/Cannot reach GRIDGO/);
  });

  it("names the refusal a shop can actually act on", () => {
    const contained = new ApiError(409, { error: "pickup_fulfillment_not_available" });
    expect(humanizeApiError(contained, offlineMessage("save this step")))
      .toMatch(/Operations/);
  });
});
