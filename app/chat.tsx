import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Send } from "lucide-react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * One conversation with Operations. The shop already has Alerts for job
 * news; this is the desk they write to when a job notice is not enough.
 */
export default function SupplierChatScreen() {
  const colors = useThemeColors();
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);
  const listRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<api.SupportChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await api.getSupportChatMe();
      setMessages(me.messages);
      if (me.thread) {
        const read = await api.markSupportChatRead();
        setUnreadCount(read.thread?.unreadCount ?? 0);
      } else {
        setUnreadCount(0);
      }
    } catch (err) {
      setError(humanizeApiError(err, offlineMessage("open Operations")));
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stream = openSupportChatStream({
      onEvent: (event) => {
        setMessages((current) => (
          current.some((row) => row.id === event.message.id) ? current : [...current, event.message]
        ));
        setUnreadCount(event.message.mine ? 0 : event.thread.unreadCount ?? 0);
        if (!event.message.mine) {
          void api.markSupportChatRead().then((result) => {
            setUnreadCount(result.thread?.unreadCount ?? 0);
          }).catch(() => {});
        }
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      },
    });
    return () => stream.close();
  }, [setUnreadCount]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const posted = await api.sendSupportChatMessage(body);
      setDraft("");
      setMessages((current) => (
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message]
      ));
      setUnreadCount(0);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(humanizeApiError(err, offlineMessage("send that message")));
    } finally {
      setSending(false);
    }
  }, [draft, sending, setUnreadCount]);

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="gg-page flex-1 gap-3 pb-3 pt-4">
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">Operations</Text>
            <Text className="text-body text-text-secondary">GRIDGO operations</Text>
          </View>
          {error ? <ErrorNotice message={error} onRetry={() => { setLoading(true); void load(); }} /> : null}
          <ScrollView
            ref={listRef}
            className="flex-1"
            contentContainerClassName="grow justify-end gap-3 pb-2"
            keyboardShouldPersistTaps="handled"
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
