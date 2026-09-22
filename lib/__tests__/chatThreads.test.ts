import { CHAT_LIST_ROUTE, CHAT_THREAD_ROUTE, chatThreadRoute, isChatThreadId } from "@/lib/chatThreads";

describe("chat threads", () => {
  it("accepts a live conversation id and refuses a placeholder", () => {
    expect(isChatThreadId("2c1b0a9e-8d7c-4b3a-9f10-1234567890ab")).toBe(true);
    expect(isChatThreadId("ops")).toBe(false);
    expect(isChatThreadId(undefined)).toBe(false);
  });

  it("routes under the list, and names the dynamic route rather than a path", () => {
    expect(CHAT_LIST_ROUTE).toBe("/chat");
    expect(CHAT_THREAD_ROUTE).toBe("/chat/[thread]");
    expect(chatThreadRoute("2c1b0a9e-8d7c-4b3a-9f10-1234567890ab")).toEqual({
      pathname: "/chat/[thread]",
      params: { thread: "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab" },
    });
  });
});
