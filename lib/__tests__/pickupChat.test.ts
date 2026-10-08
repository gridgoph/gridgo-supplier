import { ApiError, pickupChatUnavailable, pickupSendError } from "@/lib/apiErrors";
import { handoffSummary } from "@/lib/jobBrief";
import { pickupChatEntry, pickupChatNotice, pickupChatOf, senderLabel } from "@/lib/pickupChat";
import { parsePushData, pushTargetRoute } from "@/lib/push";

const NOW = Date.parse("2026-10-08T06:00:00.000Z");

describe("pickupChatOf", () => {
  it("reads the summary GRIDGO puts on the job", () => {
    expect(
      pickupChatOf({ pickupChat: { status: "open", unread: 2, closesAt: null, riderFirstName: "Jun Dela Cruz" } }),
    ).toEqual({ status: "open", unread: 2, closesAt: null, retentionHours: 24, riderFirstName: "Jun" });
  });

  it("keeps only a first name, wherever it is sent", () => {
    expect(pickupChatOf({ pickupChat: { status: "open", rider: { firstName: " Ana  Reyes " } } })?.riderFirstName).toBe("Ana");
  });

  it("has no conversation for a closed or unknown window", () => {
    expect(pickupChatOf({ pickupChat: { status: "closed" } })).toBeNull();
    expect(pickupChatOf({ pickupChat: null })).toBeNull();
    expect(pickupChatOf({})).toBeNull();
  });

  it("never reads a negative or broken unread count", () => {
    expect(pickupChatOf({ pickupChat: { status: "open", unread: -3 } })?.unread).toBe(0);
    expect(pickupChatOf({ pickupChat: { status: "open", unread: "2" } })?.unread).toBe(0);
  });
});

describe("pickup chat words", () => {
  const open = pickupChatOf({ pickupChat: { status: "open", unread: 1, riderFirstName: "Jun" } })!;
  const delivered = pickupChatOf({
    pickupChat: { status: "read_only", unread: 0, closesAt: "2026-10-09T02:00:00.000Z" },
  })!;

  it("names the rider by first name and counts what is new", () => {
    const entry = pickupChatEntry(open, NOW);
    expect(entry.title).toBe("Message Jun");
    expect(entry.unread).toBe("1 new");
    expect(entry.detail).toMatch(/Phone numbers stay private/);
  });

  it("says when delivered messages go", () => {
    expect(pickupChatEntry(delivered, NOW).title).toBe("Messages with the rider");
    expect(pickupChatEntry(delivered, NOW).detail).toBe("Delivered. Readable until 10:00 AM tomorrow, then removed.");
    expect(pickupChatNotice(delivered, NOW)).toMatch(/no new messages can be sent/);
  });

  it("labels each side", () => {
    expect(senderLabel({ mine: true }, open)).toBe("Your shop");
    expect(senderLabel({ mine: false }, open)).toBe("Jun");
    expect(senderLabel({ mine: false }, delivered)).toBe("Rider");
  });

  it("puts new messages on the folded Pickup row", () => {
    const order = { state: "rider_assigned", riderId: "rider_1", pickupChecklist: null };
    expect(handoffSummary({ ...order, pickupChat: { status: "open", unread: 2 } } as never)).toBe(
      "Rider on the way, 2 new messages",
    );
    expect(handoffSummary({ ...order, pickupChat: { status: "open", unread: 0 } } as never)).toBe("Rider on the way");
  });
});

describe("pickup chat refusals", () => {
  it("explains a removed or never-opened conversation, and leaves a dropped line to retry", () => {
    expect(pickupChatUnavailable(new ApiError(410, { error: "pickup_chat_closed" }))?.title).toBe(
      "These messages were removed",
    );
    expect(pickupChatUnavailable(new ApiError(409, { error: "pickup_chat_not_available" }))?.title).toBe(
      "No rider to message yet",
    );
    expect(pickupChatUnavailable(new Error("offline"))).toBeNull();
  });

  it("never shows a code", () => {
    expect(pickupSendError(new ApiError(409, { error: "pickup_chat_read_only" }))).toBe(
      "This job has been delivered, so no new messages can be sent.",
    );
    expect(pickupSendError(new ApiError(429, { error: "too_many_requests" }))).toMatch(/too fast/);
    expect(pickupSendError(new ApiError(500, { error: "boom_code" }))).not.toMatch(/_/);
  });
});

describe("pickup chat push", () => {
  it("opens the conversation on the job", () => {
    expect(pushTargetRoute(parsePushData({ type: "pickup_chat_message", orderId: "ord_1" }))).toBe("/job/ord_1/messages");
    expect(pushTargetRoute(parsePushData({ type: "shop_job_rider_assigned", orderId: "ord_1" }))).toBe("/job/ord_1");
    expect(pushTargetRoute(parsePushData({ type: "pickup_chat_message" }))).toBe("/alerts");
  });
});
