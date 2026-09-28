import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Send } from "lucide-react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * One Operations conversation. The shop already has Alerts for job news; this
 * is the desk they write to when a job notice is not enough.
 */
export function SupportChatConversation({ threadId }: { threadId?: string }) {
  const colors = useThemeColors();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const listRef = useRef<ScrollView>(null);
  // The keyboard pads this screen from its bottom edge, but the view's own
  // layout starts below the stack header — `onLayout` reports y = 0 here. The
  // header's height is that missing distance; without it the padding came up
  // one header short and the composer sat under the keyboard
  // (gridgoph/gridgo-client#128). Outside a stack (tests) there is no header, so 0.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  // Whether the shop is looking at the newest message. See lib/chatScroll.ts.
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(threadId);
  const [messages, setMessages] = useState<api.SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const adopt = useCallback((next: api.SupportChatMessage[]) => {
    setMessages(next);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (threadId) {
        const detail = await api.getSupportChatThread(threadId);
        setActiveId(detail.thread.id);
        adopt(detail.messages);
        const read = await api.markSupportChatRead(detail.thread.id);
        if (typeof read.unreadCount === "number") setUnreadCount(read.unreadCount);
        else {
          const me = await api.getSupportChatMe();
          setUnreadCount(me.unreadCount ?? me.threads?.reduce((sum, row) => sum + row.unreadCount, 0) ?? 0);
        }
        return;
      }
      const me = await api.getSupportChatMe();
      setActiveId(me.thread?.id);
      adopt(me.messages);
      if (me.thread) {
        const read = await api.markSupportChatRead(me.thread.id);
        setUnreadCount(read.unreadCount ?? me.unreadCount ?? 0);
      } else {
        setUnreadCount(me.unreadCount ?? 0);
      }
    } catch (err) {
      setError(humanizeApiError(err, offlineMessage("open Operations")));
    } finally {
      setLoading(false);
    }
  }, [adopt, setUnreadCount, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        if (activeId && event.thread.id !== activeId) return;
        setActiveId(event.thread.id);
        setMessages((current) => (
          current.some((row) => row.id === event.message.id) ? current : [...current, event.message]
        ));
        if (event.message.mine) return;
        void api.markSupportChatRead(event.thread.id).then((result) => {
          if (typeof result.unreadCount === "number") setUnreadCount(result.unreadCount);
        }).catch(() => {});
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      },
    });
    return () => stream.close();
  }, [activeId, setUnreadCount]);

  const trackEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    followingEnd.current = isAtChatEnd({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
  }, []);

  // The keyboard opening (or the composer growing a line) shrinks the
  // transcript from the bottom while its offset stays put, which pushed the
  // newest messages out of sight. Keep them in view — unless the shop had
  // scrolled up into history.
  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const posted = await api.sendSupportChatMessage(body, activeId);
      setActiveId(posted.thread.id);
      setDraft("");
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(humanizeApiError(err, offlineMessage("send that message")));
    } finally {
      setSending(false);
    }
  }, [activeId, draft, sending]);

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
        <View className="gg-page flex-1 gap-3 pb-3 pt-4">
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">Operations</Text>
            <Text className="text-body text-text-secondary">GRIDGO operations</Text>
          </View>
          {error ? (
            <ErrorNotice
              message={error}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : null}
          <ScrollView
            ref={listRef}
            testID="support-chat-transcript"
            className="flex-1"
            contentContainerClassName="grow justify-end gap-3 pb-2"
            keyboardShouldPersistTaps="handled"
            onScroll={trackEnd}
            scrollEventThrottle={32}
            onLayout={keepEndInView}
          >
            {!loading && messages.length === 0 ? (
              <EmptyState
                title="No messages yet"
                body="Ask about a job, a payout, or anything the desk needs to settle. They write back here."
              />
            ) : (
              messages.map((message) => (
                <View key={message.id} className={message.mine ? "items-end" : "items-start"}>
                  <View
                    className="max-w-[85%] rounded-field px-3 py-2"
                    style={{
                      backgroundColor: message.mine ? colors.surfaceVariant : colors.surface,
                      borderWidth: 1,
                      borderColor: colors.outline,
                    }}
                  >
                    <Text className="text-body text-text-primary">{message.body}</Text>
                  </View>
                  <Text className="mt-1 text-caption text-text-muted">
                    {message.mine ? "You" : "Operations"}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
          <View className="flex-row items-end gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write to Operations"
              accessibilityLabel="Message Operations"
              multiline
              maxLength={4000}
              editable={!sending}
              className="min-h-12 min-w-0 flex-1 rounded-field border border-outline bg-surface px-3 py-2 text-body text-text-primary"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: sending || !draft.trim() }}
              className="gg-touch h-12 w-12 items-center justify-center rounded-field bg-accent"
              style={{ opacity: sending || !draft.trim() ? 0.38 : 1 }}
            >
              <Send size={18} color={colors.accentOn} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
