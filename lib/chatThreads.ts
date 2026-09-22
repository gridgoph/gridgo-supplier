/**
 * A shop writes Operations. History is many conversations with that one desk.
 */

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatThreadId(value: string | undefined): value is string {
  return Boolean(value && THREAD_ID.test(value));
}

export const CHAT_LIST_ROUTE = "/chat";
export const CHAT_THREAD_ROUTE = "/chat/[thread]";

export function chatThreadRoute(threadId: string): { pathname: "/chat/[thread]"; params: { thread: string } } {
  return { pathname: "/chat/[thread]", params: { thread: threadId } };
}
