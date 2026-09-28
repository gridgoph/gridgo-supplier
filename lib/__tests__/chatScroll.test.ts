import { CHAT_END_SLACK, isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";

describe("isAtChatEnd", () => {
  it("counts a transcript shorter than its viewport as at the end", () => {
    expect(isAtChatEnd({ offsetY: 0, viewportHeight: 600, contentHeight: 200 })).toBe(true);
  });

  it("is at the end when scrolled to the newest message", () => {
    expect(isAtChatEnd({ offsetY: 1400, viewportHeight: 600, contentHeight: 2000 })).toBe(true);
  });

  it("allows about one line of slack", () => {
    expect(
      isAtChatEnd({ offsetY: 1400 - CHAT_END_SLACK, viewportHeight: 600, contentHeight: 2000 }),
    ).toBe(true);
    expect(
      isAtChatEnd({ offsetY: 1400 - CHAT_END_SLACK - 1, viewportHeight: 600, contentHeight: 2000 }),
    ).toBe(false);
  });

  it("is not at the end while the reader is up in the history", () => {
    expect(isAtChatEnd({ offsetY: 0, viewportHeight: 600, contentHeight: 2000 })).toBe(false);
  });
});

describe("shouldRepinOnResize", () => {
  it("re-pins when the keyboard shrinks the transcript of a reader at the end", () => {
    // 700 → 380: the keyboard (minus the bottom inset) took 320 from the bottom.
    expect(shouldRepinOnResize(700, 380, true)).toBe(true);
  });

  it("leaves a reader who scrolled into history where they are", () => {
    expect(shouldRepinOnResize(700, 380, false)).toBe(false);
  });

  it("does nothing on the first layout or when the transcript grows back", () => {
    expect(shouldRepinOnResize(null, 700, true)).toBe(false);
    expect(shouldRepinOnResize(380, 700, true)).toBe(false);
    expect(shouldRepinOnResize(700, 700, true)).toBe(false);
  });
});
