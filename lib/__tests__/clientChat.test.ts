import { parsePushData, pushTargetRoute } from "@/lib/push";
import {
  CHAT_CHANGES_NOTE,
  CONTACT_HIDDEN,
  clientChatEntry,
  clientChatNotice,
  clientChatOf,
  firstUnreadId,
  hidesContact,
  isPdf,
  mergeMessages,
  parseClientChatMessage,
  parseClientChatThread,
  showsClientChat,
  validateClientChatFile,
  type ClientChatMessage,
} from "@/lib/clientChat";

const message = (id: string, mine = false, body = "Hello"): ClientChatMessage => ({
  id,
  senderLabel: mine ? "Print shop" : "Client",
  body,
  mine,
  createdAt: "2026-10-17T04:00:00.000Z",
  attachments: [],
});

describe("the job's conversation with the client", () => {
  it("opens from GRIDGO's own answer and draws nothing for a job without one", () => {
    expect(clientChatOf({ clientShopChat: { status: "open", closesAt: null, participants: [] } })).toEqual({
      status: "open",
      closesAt: null,
    });
    expect(clientChatOf({})).toBeNull();
    expect(clientChatOf({ clientShopChat: { status: "archived" } })).toBeNull();
    // Before acceptance there is nothing to open yet.
    expect(showsClientChat(clientChatOf({ clientShopChat: { status: "unavailable" } }))).toBe(false);
    expect(showsClientChat(clientChatOf({ clientShopChat: { status: "read_only" } }))).toBe(true);
  });

  it("reads the thread's unread count and GRIDGO's warning", () => {
    expect(
      parseClientChatThread({ status: "open", unread: 3, warning: "Contact details are hidden.", contactAttempts: 3 }),
    ).toEqual({ status: "open", closesAt: null, unread: 3, warned: true });
    expect(parseClientChatThread({ status: "read_only", unread: -1 })).toEqual({
      status: "read_only",
      closesAt: null,
      unread: 0,
      warned: false,
    });
  });

  it("labels every message Client, Print shop or GRIDGO, never a name", () => {
    const parsed = parseClientChatMessage({
      id: "m1",
      senderLabel: "Juan Dela Cruz",
      body: "Hi",
      mine: false,
      createdAt: "2026-10-17T04:00:00.000Z",
      attachments: [{ fileId: "f1", contentType: "application/pdf", size: 2048, originalFilename: "document.pdf" }],
    });
    expect(parsed?.senderLabel).toBe("GRIDGO");
    expect(parsed?.attachments).toEqual([
      { fileId: "f1", contentType: "application/pdf", size: 2048, originalFilename: "document.pdf" },
    ]);
    expect(parseClientChatMessage({ id: "m2", senderLabel: "Client", createdAt: "2026-10-17T04:00:00.000Z" })?.senderLabel).toBe(
      "Client",
    );
    expect(parseClientChatMessage({ id: "m3" })).toBeNull();
  });

  it("notices when GRIDGO hid a contact, as it masked it", () => {
    expect(hidesContact({ body: `Call ${CONTACT_HIDDEN} or ${CONTACT_HIDDEN}` })).toBe(true);
    expect(hidesContact({ body: "Please print 100 copies, 8.5 x 11 inches." })).toBe(false);
  });

  it("names nobody in its own words", () => {
    const open = clientChatEntry({ status: "open", closesAt: null }, true);
    expect(open).toMatchObject({ title: "Message the client", unread: "New" });
    expect(open.accessibilityLabel).toBe("Message the client, new messages");
    expect(clientChatEntry({ status: "read_only", closesAt: "2026-10-24T07:40:00.000Z" }, false).detail).toBe(
      "Closed Oct 24, 3:40 PM. The messages stay with this job.",
    );
    expect(clientChatNotice({ status: "open", closesAt: null })).toContain("Names and contact details stay hidden");
    expect(clientChatNotice({ status: "read_only", closesAt: null })).toContain("no new messages can be sent");
  });

  it("sends price, spec and deadline changes to the change request, not the chat", () => {
    expect(CHAT_CHANGES_NOTE).toMatch(/price, the spec or the deadline/);
    expect(CHAT_CHANGES_NOTE).toMatch(/Request a change/);
  });

  it("accepts photos and PDFs up to 10 MB, and nothing else", () => {
    expect(validateClientChatFile({ name: "proof.pdf", mimeType: "application/pdf", size: 1_000 })).toBeNull();
    expect(validateClientChatFile({ name: "shop.jpg", mimeType: "image/jpg", size: 1_000 })).toBeNull();
    expect(validateClientChatFile({ name: "notes.docx", mimeType: "application/msword", size: 1_000 })).toMatch(
      /photo .* or a PDF/,
    );
    expect(validateClientChatFile({ name: "big.png", mimeType: "image/png", size: 11 * 1024 * 1024 })).toBe(
      "Files can be up to 10 MB.",
    );
    expect(isPdf({ contentType: null, originalFilename: "document.pdf" })).toBe(true);
    expect(isPdf({ contentType: "image/png", originalFilename: "image.png" })).toBe(false);
  });

  it("appends a page in GRIDGO's order without drawing a message twice", () => {
    const held = [message("a"), message("b", true)];
    expect(mergeMessages(held, [])).toBe(held);
    expect(mergeMessages(held, [message("b", true)])).toBe(held);
    expect(mergeMessages(held, [message("b", true), message("c")]).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("puts the New messages line before the first unread message from the others", () => {
    const rows = [message("a"), message("b", true), message("c"), message("d")];
    expect(firstUnreadId(rows, 2)).toBe("c");
    expect(firstUnreadId(rows, 9)).toBe("a");
    expect(firstUnreadId(rows, 0)).toBeNull();
  });

  it("opens the conversation from a tapped notice about it", () => {
    expect(pushTargetRoute(parsePushData({ type: "client_shop_chat_message", orderId: "ord_1" }))).toBe(
      "/job/ord_1/client-messages",
    );
    // A notice with no job behind it opens the alerts list.
    expect(pushTargetRoute(parsePushData({ type: "client_shop_chat_message" }))).toBe("/alerts");
  });
});
