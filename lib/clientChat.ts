/*
  The conversation between the shop and the client on one job, through GRIDGO
  (gridgo-client#246; gridgo-api `docs/ORDER_CLIENT_SHOP_CHAT_API.md`). Built
  on the same plumbing as the rider chat (`lib/pickupChat.ts`): the same
  upload route, the same signed links, the same live refresh.

  Three rules this module holds:

  - **Nobody is named.** The three parties are exactly "Client", "Print shop"
    and "GRIDGO". GRIDGO sends only those labels; a label it has never sent
    reads "GRIDGO", never a guess at a person.
  - **Contacts are masked by GRIDGO, before anyone sees them.** A phone
    number, email, handle or link arrives as `[contact hidden]`, the sender's
    own copy included. This app never masks or unmasks anything; it only says
    so kindly when it happened.
  - **Chat changes nothing.** Price, spec and deadline go through the job's
    change request or deadline request; the conversation is evidence of what
    was said, kept with the order after it closes.

  The job says whether the conversation exists (`clientShopChat`): `open`
  from the shop's acceptance until the issue window closes, `read_only`
  after, `unavailable` before acceptance. Its unread count is not on the job,
  so the job screen reads it from the shop's own unread notices.
*/

export type ClientChatStatus = "open" | "read_only" | "unavailable";

export type ClientChatSummary = {
  status: ClientChatStatus;
  /** When writing stops: the end of the issue window. Null until GRIDGO knows it. */
  closesAt: string | null;
};

/** What the thread read adds to the job's summary. */
export type ClientChatThread = ClientChatSummary & {
  /** Messages from the others not read before this read. */
  unread: number;
  /** True once GRIDGO has warned this shop about repeated contact sharing. */
  warned: boolean;
};

export type ClientChatSender = "Client" | "Print shop" | "GRIDGO";

export type ClientChatAttachment = {
  fileId: string;
  contentType: string | null;
  size: number | null;
  /** Always GRIDGO's neutral name: "image.png" or "document.pdf". */
  originalFilename: string | null;
};

export type ClientChatMessage = {
  id: string;
  senderLabel: ClientChatSender;
  /** As GRIDGO masked it. Empty when an attachment is the whole message. */
  body: string;
  mine: boolean;
  createdAt: string;
  attachments: ClientChatAttachment[];
};

export const CLIENT_CHAT_PURPOSE = "client_shop_chat_attachment";
export const CLIENT_MESSAGE_MAX = 1000;
export const CLIENT_CHAT_ATTACHMENT_MAX_COUNT = 4;
export const CLIENT_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** The inbox and push type of a new message from the client or GRIDGO. */
export const CLIENT_CHAT_NOTICE = "client_shop_chat_message";
/** A fallback while the screen is in front; the live stream is the main signal. */
export const CLIENT_CHAT_POLL_MS = 10_000;
/** What GRIDGO puts where a phone number, email, handle or link was. */
export const CONTACT_HIDDEN = "[contact hidden]";

const SENDERS: ClientChatSender[] = ["Client", "Print shop", "GRIDGO"];
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function readStatus(value: unknown): ClientChatStatus | null {
  return value === "open" || value === "read_only" || value === "unavailable" ? value : null;
}

function readDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/** The job's conversation, or null when GRIDGO sent none (an older API, or a job this shop no longer holds). */
export function clientChatOf(order: { clientShopChat?: unknown } | null | undefined): ClientChatSummary | null {
  const raw = order?.clientShopChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, closesAt } = raw as Record<string, unknown>;
  const read = readStatus(status);
  return read ? { status: read, closesAt: readDate(closesAt) } : null;
}

/** The thread read's `chat`, defensively. */
export function parseClientChatThread(raw: unknown): ClientChatThread | null {
  const summary = clientChatOf({ clientShopChat: raw });
  if (!summary) return null;
  const { unread, warning } = raw as Record<string, unknown>;
  return {
    ...summary,
    unread: typeof unread === "number" && Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0,
    warned: typeof warning === "string" && warning.length > 0,
  };
}

function parseAttachment(raw: unknown): ClientChatAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const { fileId, contentType, size, originalFilename } = raw as Record<string, unknown>;
  if (typeof fileId !== "string" || !fileId) return null;
  return {
    fileId,
    contentType: typeof contentType === "string" ? contentType : null,
    size: typeof size === "number" && size > 0 ? size : null,
    originalFilename: typeof originalFilename === "string" ? originalFilename : null,
  };
}

/** One message, or null when it is not one. An unknown sender is GRIDGO, never a name. */
export function parseClientChatMessage(raw: unknown): ClientChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || !readDate(row.createdAt)) return null;
  const label = SENDERS.find((sender) => sender === row.senderLabel) ?? "GRIDGO";
  return {
    id: row.id,
    senderLabel: label,
    body: typeof row.body === "string" ? row.body : "",
    mine: row.mine === true,
    createdAt: row.createdAt as string,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.map(parseAttachment).filter((item): item is ClientChatAttachment => item !== null)
      : [],
  };
}

export function clientChatHref(orderId: string): { pathname: "/job/[id]/client-messages"; params: { id: string } } {
  return { pathname: "/job/[id]/client-messages", params: { id: orderId } };
}

/** The conversation is worth a way in: it has opened, even if it has since closed. */
export function showsClientChat(chat: ClientChatSummary | null): chat is ClientChatSummary {
  return chat !== null && chat.status !== "unavailable";
}

/** "Oct 24, 3:40 PM", in Davao time. */
export function chatDateLabel(at: string): string {
  return new Date(at).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The row on the job that opens the conversation. `unread` is true while a notice about it is unread. */
export function clientChatEntry(chat: ClientChatSummary, unread: boolean) {
  const open = chat.status === "open";
  const title = open ? "Message the client" : "Messages with the client";
  const detail = open
    ? "Ask about the work through GRIDGO. Names and contact details stay private."
    : chat.closesAt
      ? `Closed ${chatDateLabel(chat.closesAt)}. The messages stay with this job.`
      : "Closed. The messages stay with this job.";
  return {
    title,
    detail,
    unread: unread ? "New" : null,
    accessibilityLabel: `${title}${unread ? ", new messages" : ""}`,
  };
}

/** The line under the conversation's heading. */
export function clientChatNotice(chat: ClientChatSummary): string {
  if (chat.status === "open") {
    return chat.closesAt
      ? `You, the client and GRIDGO see these messages. Names and contact details stay hidden. Open until ${chatDateLabel(chat.closesAt)}.`
      : "You, the client and GRIDGO see these messages. Names and contact details stay hidden.";
  }
  if (chat.status === "read_only") {
    return "This conversation has closed, so no new messages can be sent. GRIDGO keeps it with the job.";
  }
  return "You can message the client once you accept this job.";
}

/** Said beside the composer, every time: what chat cannot do and where it goes instead. */
export const CHAT_CHANGES_NOTE =
  "Chat cannot change the price, the spec or the deadline. Ask for those with Request a change or Request a new deadline on the job.";

/** Under the shop's own message when GRIDGO hid something in it. */
export const CONTACT_HIDDEN_NOTE =
  "GRIDGO hid contact details in this message. Keep talking here, so GRIDGO can help if something goes wrong.";

/** Once GRIDGO has warned this shop: what it means, in calm words. */
export const CONTACT_WARNING_NOTE =
  "Several of your messages included contact details. They were hidden, and Operations will review this conversation. Keep every arrangement inside GRIDGO.";

export function hidesContact(message: Pick<ClientChatMessage, "body">): boolean {
  return message.body.includes(CONTACT_HIDDEN);
}

export function isPdf(attachment: Pick<ClientChatAttachment, "contentType" | "originalFilename">): boolean {
  return attachment.contentType === "application/pdf" || /\.pdf$/i.test(attachment.originalFilename ?? "");
}

export type ReportReason = "contact_sharing" | "inappropriate" | "change_request" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string; detail: string }[] = [
  { value: "contact_sharing", label: "Sharing contact details", detail: "A number, email, handle or link to deal outside GRIDGO." },
  { value: "change_request", label: "Changing the order in chat", detail: "Price, spec or deadline agreed outside a change request." },
  { value: "inappropriate", label: "Rude or inappropriate", detail: "Language or pictures that do not belong here." },
  { value: "other", label: "Something else", detail: "Operations will read the conversation." },
];

export function isReportReason(value: string | null): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.value === value);
}

/** A file the shop picked, checked before it is sent: null when it can go. */
export function validateClientChatFile(file: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  const type = file.mimeType === "image/jpg" ? "image/jpeg" : (file.mimeType ?? "");
  const name = String(file.name ?? "").toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].some((ext) => name.endsWith(ext));
  if (!TYPES.includes(type) && !extensionOk) return "Send a photo (JPEG, PNG or WebP) or a PDF.";
  if (file.size === 0) return "That file is empty.";
  if (typeof file.size === "number" && file.size > CLIENT_CHAT_ATTACHMENT_MAX_BYTES) {
    return "Files can be up to 10 MB.";
  }
  return null;
}

/** Messages after these ids, appended in GRIDGO's order with nothing drawn twice. */
export function mergeMessages(current: ClientChatMessage[], incoming: ClientChatMessage[]): ClientChatMessage[] {
  if (!incoming.length) return current;
  const seen = new Set(current.map((row) => row.id));
  const fresh = incoming.filter((row) => !seen.has(row.id));
  return fresh.length ? [...current, ...fresh] : current;
}

/**
 * Where the "New messages" line goes: before the first of the last `unread`
 * messages that are not the shop's own. Null when nothing was unread.
 */
export function firstUnreadId(messages: ClientChatMessage[], unread: number): string | null {
  if (unread <= 0) return null;
  const theirs = messages.filter((row) => !row.mine);
  return theirs[Math.max(0, theirs.length - unread)]?.id ?? null;
}
