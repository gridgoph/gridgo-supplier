import { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FileText, Flag, Info, Lock, Paperclip, Send, ShieldCheck, UserRound, X } from "lucide-react-native";

import { ChatDocument } from "@/components/ChatDocument";
import { ChatPhoto } from "@/components/ChatPhoto";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  clientChatReportError,
  clientChatSendError,
  clientChatUnavailable,
  type PickupChatUnavailable,
} from "@/lib/apiErrors";
import { pickChatImages, uploadChatFile } from "@/lib/chatImages";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import {
  CHAT_CHANGES_NOTE,
  CLIENT_CHAT_ATTACHMENT_MAX_COUNT,
  CLIENT_CHAT_NOTICE,
  CLIENT_CHAT_POLL_MS,
  CLIENT_CHAT_PURPOSE,
  CLIENT_MESSAGE_MAX,
  CONTACT_HIDDEN_NOTE,
  CONTACT_WARNING_NOTE,
  REPORT_REASONS,
  chatDateLabel,
  clientChatNotice,
  firstUnreadId,
  hidesContact,
  isPdf,
  isReportReason,
  mergeMessages,
  validateClientChatFile,
  type ClientChatMessage,
  type ClientChatThread,
} from "@/lib/clientChat";
import { chooseFile } from "@/lib/pickFile";
import { useAlertsStore } from "@/store/alerts";
import { askPick } from "@/store/sheets";

type PendingFile = { uri: string; name: string; mimeType: string; pdf: boolean };

/** Pages read on opening before the transcript stops asking: 2,000 messages. */
const MAX_PAGES = 20;

/**
 * The shop's side of one job's conversation with the client, through GRIDGO.
 *
 * The same shape as the rider chat (`PickupChatConversation`), with what this
 * conversation adds: three labels and no names, contact details hidden by
 * GRIDGO before anyone reads them, a Report on every message from the others,
 * photos or PDFs, and a standing reminder that chat changes nothing on the job.
 *
 * New messages arrive on the live stream (a `jobs` refresh) and, while the
 * screen is in front, a slow poll that asks only for what came after the last
 * message held. Reading marks them read on GRIDGO's side, and the shop's
 * unread notices about this conversation go with them.
 */
export function ClientChatConversation({ orderId, onOpenJob }: { orderId: string; onOpenJob: () => void }) {
  const colors = useThemeColors();
  const listRef = useRef<ScrollView>(null);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const sequence = useRef(0);
  const lastId = useRef<string | null>(null);
  const [chat, setChat] = useState<ClientChatThread | null>(null);
  const [messages, setMessages] = useState<ClientChatMessage[]>([]);
  const [newFrom, setNewFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<PickupChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [reported, setReported] = useState<Set<string>>(() => new Set());
  const [reportError, setReportError] = useState<string | null>(null);

  /** Notices about this conversation are read once the conversation is. */
  const clearNotices = useCallback(() => {
    const alerts = useAlertsStore.getState();
    const ids = (alerts.inbox ?? [])
      .filter((row) => row.type === CLIENT_CHAT_NOTICE && row.orderId === orderId && !row.read)
      .map((row) => row.id)
      .filter((id) => alerts.unreadIds.includes(id));
    if (ids.length) void alerts.markManyRead(ids);
  }, [orderId]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    const first = lastId.current === null;
    try {
      let after = lastId.current;
      let thread: ClientChatThread | null = null;
      let unread = 0;
      const incoming: ClientChatMessage[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await api.getClientChat(orderId, after);
        if (current !== sequence.current) return;
        // The first page's count is the one from before this read marked anything.
        if (page === 0) unread = result.chat?.unread ?? 0;
        thread = result.chat ?? thread;
        incoming.push(...result.messages);
        if (!result.nextAfter) break;
        after = result.nextAfter;
      }
      if (thread) setChat(thread);
      setUnavailable(null);
      setLoadError(null);
      if (incoming.length) lastId.current = incoming[incoming.length - 1].id;
      else if (first) lastId.current = "";
      if (first) setNewFrom(firstUnreadId(incoming, unread));
      setMessages((previous) => {
        const next = mergeMessages(previous, incoming);
        if (next !== previous && followingEnd.current) {
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: previous.length > 0 }));
        }
        return next;
      });
      clearNotices();
    } catch (err) {
      if (current !== sequence.current) return;
      const closed = clientChatUnavailable(err);
      if (closed) {
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [clearNotices, orderId]);

  useLiveRefresh(["notifications", "jobs", "orders"], load);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), CLIENT_CHAT_POLL_MS);
      return () => {
        sequence.current++;
        clearInterval(timer);
      };
    }, [load]),
  );

  const trackEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    followingEnd.current = isAtChatEnd({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
  }, []);

  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

  const addFiles = useCallback(async () => {
    const choice = await askPick({
      title: "Attach",
      body: "A photo or a PDF of up to 10 MB. GRIDGO removes a photo's location and phone details before the client sees it.",
      options: [
        { value: "photo", label: "Photo", detail: "From this phone's photos" },
        { value: "file", label: "PDF or image file", detail: "From this phone's files" },
      ],
      selected: null,
    });
    if (!choice) return;
    try {
      const picked =
        choice === "photo"
          ? await pickChatImages()
          : await chooseFile().then((outcome) => {
              if (!outcome.ok) {
                if (!outcome.cancelled) setSendError(outcome.message);
                return [];
              }
              const { document } = outcome;
              return [
                {
                  uri: document.uri,
                  name: document.fileName,
                  mimeType: document.mimeType ?? "",
                  size: document.sizeBytes,
                },
              ];
            });
      if (!picked.length) return;
      const next = [...pending];
      for (const file of picked) {
        const problem = validateClientChatFile(file);
        if (problem) {
          setSendError(problem);
          return;
        }
        if (next.length >= CLIENT_CHAT_ATTACHMENT_MAX_COUNT) {
          setSendError(`A message can include up to ${CLIENT_CHAT_ATTACHMENT_MAX_COUNT} files.`);
          return;
        }
        const pdf = isPdf({ contentType: file.mimeType, originalFilename: file.name });
        next.push({ uri: file.uri, name: file.name, mimeType: pdf ? "application/pdf" : file.mimeType, pdf });
      }
      setSendError(null);
      setPending(next);
    } catch {
      setSendError("This phone could not open its files. Try again.");
    }
  }, [pending]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fileIds: string[] = [];
      for (const file of pending) fileIds.push(await uploadChatFile(file, CLIENT_CHAT_PURPOSE));
      const posted = await api.sendClientChatMessage(orderId, body, fileIds);
      setDraft("");
      setPending([]);
      if (posted.chat) setChat(posted.chat);
      if (posted.message) {
        const message = posted.message;
        lastId.current = message.id;
        setMessages((current) => mergeMessages(current, [message]));
      }
      followingEnd.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setSendError(clientChatSendError(err));
      // A refusal can mean the conversation just closed; re-read to say so.
      void load();
    } finally {
      setSending(false);
    }
  }, [draft, load, orderId, pending, sending]);

  const report = useCallback(
    async (message: ClientChatMessage) => {
      const reason = await askPick({
        title: `Report this message from ${message.senderLabel === "GRIDGO" ? "GRIDGO" : "the client"}`,
        body: "Operations reads every report. The other side is not told who reported it.",
        options: REPORT_REASONS.map(({ value, label, detail }) => ({ value, label, detail })),
        selected: null,
      });
      if (!isReportReason(reason)) return;
      setReportError(null);
      try {
        await api.reportClientChatMessage(orderId, message.id, reason);
        setReported((current) => new Set(current).add(message.id));
      } catch (err) {
        setReportError(clientChatReportError(err));
      }
    },
    [orderId],
  );

  const canSend = !sending && Boolean(draft.trim() || pending.length);
  const open = chat?.status === "open";
  const full = pending.length >= CLIENT_CHAT_ATTACHMENT_MAX_COUNT;

  if (unavailable) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page pt-6">
          <EmptyState
            title={unavailable.title}
            body={unavailable.body}
            secondaryLabel="Back to the job"
            onSecondary={onOpenJob}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1 }}>
        <View className="gg-page flex-1 gap-3 pb-3 pt-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-pill"
              style={{ backgroundColor: colors.surfaceVariant }}
            >
              <UserRound size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">Client</Text>
              <Text className="text-caption text-text-muted">
                {open ? "Through GRIDGO" : chat ? "Conversation closed" : " "}
              </Text>
            </View>
          </View>

          {chat ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ backgroundColor: colors.surfaceVariant }}
              accessible
              accessibilityLabel={clientChatNotice(chat)}
            >
              <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-secondary">{clientChatNotice(chat)}</Text>
            </View>
          ) : null}

          {chat?.warned ? (
            <View
              className="flex-row items-start gap-2 rounded-field border border-outline px-3 py-2"
              accessibilityRole="alert"
              testID="client-chat-warning"
            >
              <ShieldCheck size={14} color={colors.warning} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-secondary">
                <Text className="font-medium text-text-primary">Contact details hidden. </Text>
                {CONTACT_WARNING_NOTE}
              </Text>
            </View>
          ) : null}

          {loadError && !chat ? (
            <ErrorNotice
              message={loadError}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : (
            <ScrollView
              ref={listRef}
              testID="client-chat-transcript"
              className="flex-1"
              contentContainerClassName="grow justify-end gap-3 pb-2"
              keyboardShouldPersistTaps="handled"
              onScroll={trackEnd}
              scrollEventThrottle={32}
              onLayout={keepEndInView}
              // A photo arrives after the text it sits in; stay at the newest message while the shop is there.
              onContentSizeChange={() => {
                if (followingEnd.current) listRef.current?.scrollToEnd({ animated: false });
              }}
            >
              {loading && !chat ? (
                <View className="gap-3">
                  <SkeletonBlock className="h-10 w-2/3 rounded-card" />
                  <SkeletonBlock className="h-10 w-1/2 self-end rounded-card" />
                </View>
              ) : messages.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  body={
                    open
                      ? "Ask the client about anything in the artwork or the spec that is unclear before you print."
                      : "Nobody wrote about this job."
                  }
                />
              ) : (
                messages.map((message) => (
                  <View key={message.id} className="gap-3">
                    {message.id === newFrom ? (
                      <View className="flex-row items-center gap-2" accessibilityRole="header">
                        <View className="h-px flex-1 bg-outline" />
                        <Text className="text-caption font-medium text-text-muted">New messages</Text>
                        <View className="h-px flex-1 bg-outline" />
                      </View>
                    ) : null}
                    <MessageBubble
                      message={message}
                      reported={reported.has(message.id)}
                      onReport={() => void report(message)}
                    />
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {reportError ? (
            <Text className="text-caption text-error" accessibilityLiveRegion="polite">
              {reportError}
            </Text>
          ) : null}
          {sendError ? (
            <Text className="text-caption text-error" accessibilityLiveRegion="polite">
              {sendError}
            </Text>
          ) : null}

          {open && pending.length ? (
            <View className="flex-row flex-wrap gap-2" accessibilityLabel={`${pending.length} files ready to send`}>
              {pending.map((file, index) => (
                <View key={`${file.uri}-${index}`} className="relative">
                  {file.pdf ? (
                    <View
                      className="h-14 w-14 items-center justify-center rounded-field border border-outline bg-surface"
                      accessibilityLabel="PDF document"
                    >
                      <FileText size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                      <Text className="text-caption text-text-muted">PDF</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: file.uri }}
                      accessibilityLabel="Photo"
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  )}
                  <Pressable
                    onPress={() => setPending((current) => current.filter((_, at) => at !== index))}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel={file.pdf ? "Remove the PDF" : "Remove the photo"}
                    hitSlop={10}
                    className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-pill bg-accent"
                  >
                    <X size={12} color={colors.accentOn} strokeWidth={2.5} aria-hidden />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {open ? (
            <>
              <View className="flex-row items-start gap-2" testID="client-chat-changes-note">
                <Info size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 1 }} aria-hidden />
                <Text className="flex-1 text-caption text-text-muted">{CHAT_CHANGES_NOTE}</Text>
              </View>
              <View className="flex-row items-end gap-2">
                <Pressable
                  onPress={() => void addFiles()}
                  disabled={sending || full}
                  accessibilityRole="button"
                  accessibilityLabel="Attach a photo or PDF"
                  accessibilityState={{ disabled: sending || full }}
                  className="gg-touch h-12 w-12 items-center justify-center rounded-field"
                  style={{ borderWidth: 1, borderColor: colors.outline, opacity: sending || full ? 0.38 : 1 }}
                >
                  <Paperclip size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                </Pressable>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Write to the client"
                  accessibilityLabel="Message the client"
                  multiline
                  maxLength={CLIENT_MESSAGE_MAX}
                  editable={!sending}
                  className="min-h-12 min-w-0 flex-1 rounded-field border border-outline bg-surface px-3 py-2 text-body text-text-primary"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable
                  onPress={() => void send()}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  accessibilityState={{ disabled: !canSend }}
                  className="gg-touch h-12 w-12 items-center justify-center rounded-field bg-accent"
                  style={{ opacity: canSend ? 1 : 0.38 }}
                >
                  <Send size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
                </Pressable>
              </View>
            </>
          ) : chat ? (
            <SecondaryButton label="Back to the job" onPress={onOpenJob} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageBubble({
  message,
  reported,
  onReport,
}: {
  message: ClientChatMessage;
  reported: boolean;
  onReport: () => void;
}) {
  const colors = useThemeColors();
  const mine = message.mine;
  const gridgo = message.senderLabel === "GRIDGO";
  return (
    <View className={mine ? "max-w-[80%] items-end self-end" : "max-w-[80%] items-start self-start"}>
      <View
        className="gap-2 rounded-card px-3 py-2"
        style={{
          backgroundColor: mine ? colors.accent : gridgo ? colors.surfaceVariant : colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.outline,
        }}
      >
        {message.body ? (
          <Text className="text-body" style={{ color: mine ? colors.accentOn : colors.textPrimary }}>
            {message.body}
          </Text>
        ) : null}
        {message.attachments.map((attachment) => (
          <View key={attachment.fileId}>
            {isPdf(attachment) ? (
              <ChatDocument attachment={attachment} inverse={mine} />
            ) : (
              <ChatPhoto attachment={{ fileId: attachment.fileId }} />
            )}
          </View>
        ))}
      </View>
      <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
        {gridgo ? <ShieldCheck size={12} color={colors.textMuted} strokeWidth={2} aria-hidden /> : null}
        <Text className="text-caption text-text-muted">
          {message.senderLabel} · {timeOf(message.createdAt)}
        </Text>
        {mine ? null : reported ? (
          <Text className="text-caption text-text-muted" accessibilityLiveRegion="polite">
            · Reported
          </Text>
        ) : (
          <Pressable
            onPress={onReport}
            accessibilityRole="button"
            accessibilityLabel={`Report this message from ${message.senderLabel}`}
            hitSlop={14}
            className="flex-row items-center gap-1"
          >
            <Flag size={12} color={colors.textMuted} strokeWidth={2} aria-hidden />
            <Text className="text-caption font-medium text-text-secondary">Report</Text>
          </Pressable>
        )}
      </View>
      {mine && hidesContact(message) ? (
        <View className="mt-1 flex-row items-start gap-1" testID="contact-hidden-note">
          <Info size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 1 }} aria-hidden />
          <Text className="shrink text-caption text-text-muted">{CONTACT_HIDDEN_NOTE}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The time today; the date as well once the conversation runs over days. */
function timeOf(at: string): string {
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (day(new Date(at)) === day(new Date())) {
    return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  }
  return chatDateLabel(at);
}
