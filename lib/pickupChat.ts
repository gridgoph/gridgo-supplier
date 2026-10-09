/*
  Messages between the shop and the rider collecting one job
  (gridgo-supplier#148, report C2BE8E7A). Built the way the client–rider
  delivery chat is (gridgo-client `lib/deliveryChat.ts`, gridgo-rider
  `lib/deliveryChat.ts`): same shapes, same photos, same window rules.

  The API decides the window and says so on the job as `pickupChat`: `open`
  from the moment a rider accepts the pick-up until delivery, `read_only` for a
  day after, and absent otherwise. This module only reads that answer and
  words it. It never works the window out from the job's state, because a
  second copy of the rule is how a screen offers a conversation the server has
  already deleted. A job handed to another rider starts a clean conversation.

  Calls with the rider are in-app internet audio (`lib/orderCall.ts`): the
  rider never sees a shop member's phone, and the shop sees the rider's first
  name only. A message may carry up to four photos,
  uploaded as `pickup_chat_image`; only the two parties can open them.

  The API's refusal codes are read in `lib/apiErrors.ts`, like every other.
*/

export type PickupChatStatus = "open" | "read_only";

export type PickupChatSummary = {
  status: PickupChatStatus;
  /** Messages from the rider this shop has not opened yet. */
  unread: number;
  /** When a delivered conversation is removed. Null while it is open. */
  closesAt: string | null;
  retentionHours: number;
  /** The rider's first name, when GRIDGO sends one. Never a surname or number. */
  riderFirstName: string | null;
};

export type PickupChatAttachment = {
  fileId: string;
  contentType?: string | null;
  originalFilename?: string | null;
};

export type PickupChatMessage = {
  id: string;
  senderRole: "supplier" | "rider";
  /** Empty when a photo is the whole message. */
  body: string;
  attachments?: PickupChatAttachment[];
  createdAt: string;
  mine: boolean;
};

export const PICKUP_MESSAGE_MAX = 1000;
export const PICKUP_CHAT_IMAGE_PURPOSE = "pickup_chat_image";
export const PICKUP_CHAT_IMAGE_MAX_COUNT = 4;
/** The inbox and push type of a new message from the rider. */
export const PICKUP_CHAT_NOTICE = "pickup_chat_message";
/** How often an open conversation asks for new messages while on screen. */
export const PICKUP_CHAT_POLL_MS = 5_000;

function firstName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.trim().split(/\s+/)[0];
  return word ? word.slice(0, 40) : null;
}

/** The job's conversation, or null when it has none or sent something unknown. */
export function pickupChatOf(order: { pickupChat?: unknown } | null | undefined): PickupChatSummary | null {
  const raw = order?.pickupChat;
  if (!raw || typeof raw !== "object") return null;
  const { status, unread, closesAt, retentionHours, riderFirstName, rider } = raw as Record<string, unknown>;
  if (status !== "open" && status !== "read_only") return null;
  return {
    status,
    unread: typeof unread === "number" && Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0,
    closesAt: typeof closesAt === "string" && Number.isFinite(Date.parse(closesAt)) ? closesAt : null,
    retentionHours: typeof retentionHours === "number" && retentionHours > 0 ? retentionHours : 24,
    riderFirstName:
      firstName(riderFirstName) ??
      (rider && typeof rider === "object" ? firstName((rider as Record<string, unknown>).firstName) : null),
  };
}

export function pickupChatHref(orderId: string): { pathname: "/job/[id]/messages"; params: { id: string } } {
  return { pathname: "/job/[id]/messages", params: { id: orderId } };
}

/** "3:40 PM today" / "9:05 AM tomorrow" / "Thu, Oct 9, 9:05 AM", in Davao time. */
export function closesAtLabel(closesAt: string, now: Date | number = Date.now()): string {
  const at = new Date(closesAt);
  const time = at.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const today = new Date(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (day(at) === day(today)) return `${time} today`;
  if (day(at) === day(tomorrow)) return `${time} tomorrow`;
  const date = at.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

export function riderNameOf(chat: Pick<PickupChatSummary, "riderFirstName"> | null): string {
  return chat?.riderFirstName || "the rider";
}

/** The row on the job that opens the conversation. */
export function pickupChatEntry(chat: PickupChatSummary, now: Date | number = Date.now()) {
  const name = riderNameOf(chat);
  const unread = chat.unread > 0 ? `${chat.unread} new` : null;
  if (chat.status === "open") {
    return {
      title: chat.riderFirstName ? `Message ${chat.riderFirstName}` : "Message the rider",
      detail: "Ask where they are or tell them which door to use. Phone numbers stay private.",
      unread,
      accessibilityLabel: `Message ${name} about this pickup${unread ? `, ${unread} messages` : ""}`,
    };
  }
  return {
    title: chat.riderFirstName ? `Messages with ${chat.riderFirstName}` : "Messages with the rider",
    detail: chat.closesAt
      ? `Delivered. Readable until ${closesAtLabel(chat.closesAt, now)}, then removed.`
      : `Delivered. Removed ${chat.retentionHours} hours after delivery.`,
    unread,
    accessibilityLabel: `Read your messages with ${name}${unread ? `, ${unread} messages` : ""}`,
  };
}

/** The line under the conversation's heading. */
export function pickupChatNotice(chat: PickupChatSummary, now: Date | number = Date.now()): string {
  if (chat.status === "open") {
    return `Only your shop and ${riderNameOf(chat)} see these messages. They are removed ${chat.retentionHours} hours after delivery.`;
  }
  return chat.closesAt
    ? `This job has been delivered, so no new messages can be sent. These are removed at ${closesAtLabel(chat.closesAt, now)}.`
    : "This job has been delivered, so no new messages can be sent.";
}

export function senderLabel(message: Pick<PickupChatMessage, "mine">, chat: PickupChatSummary | null): string {
  if (message.mine) return "Your shop";
  return chat?.riderFirstName || "Rider";
}
