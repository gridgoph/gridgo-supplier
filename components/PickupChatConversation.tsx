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
import { Bike, ImagePlus, Lock, Send, X } from "lucide-react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { pickupChatUnavailable, pickupSendError, type PickupChatUnavailable } from "@/lib/apiErrors";
import { pickChatImages, uploadChatImage, validateChatImageAsset } from "@/lib/chatImages";
import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";
import {
  PICKUP_CHAT_IMAGE_MAX_COUNT,
  PICKUP_CHAT_IMAGE_PURPOSE,
  PICKUP_CHAT_POLL_MS,
  PICKUP_MESSAGE_MAX,
  pickupChatNotice,
  riderNameOf,
  senderLabel,
  type PickupChatMessage,
  type PickupChatSummary,
} from "@/lib/pickupChat";

type PendingPhoto = { uri: string; name: string; mimeType: string };

/**
 * The shop's side of one job's conversation with the rider collecting it.
 *
 * Text and photos, no call button: neither side sees the other's number. New
 * messages arrive by polling while the screen is in front — the rider's first
 * message also lands as a notification, but a burst rides on that one notice,
 * so the notice alone cannot keep a transcript current. Opening it marks the
 * rider's messages read on GRIDGO's side.
 */
export function PickupChatConversation({ orderId, onOpenJob }: { orderId: string; onOpenJob: () => void }) {
  const colors = useThemeColors();
  const listRef = useRef<ScrollView>(null);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);
  const sequence = useRef(0);
  const [chat, setChat] = useState<PickupChatSummary | null>(null);
  const [messages, setMessages] = useState<PickupChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<PickupChatUnavailable | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.getPickupChat(orderId);
      if (current !== sequence.current) return;
      setChat(result.chat);
      setUnavailable(null);
      setLoadError(null);
      setMessages((previous) => {
        const changed =
          result.messages.length !== previous.length ||
          result.messages.some((row, index) => row.id !== previous[index]?.id);
        if (changed && followingEnd.current) {
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: previous.length > 0 }));
        }
        return changed ? result.messages : previous;
      });
    } catch (err) {
      if (current !== sequence.current) return;
      const closed = pickupChatUnavailable(err);
      if (closed) {
        // GRIDGO removed it, or it never opened: drop what was shown.
        setUnavailable(closed);
        setChat(null);
        setMessages([]);
      } else {
        setLoadError("Could not load your messages. Check your connection and try again.");
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [orderId]);

  useLiveRefresh(["notifications", "orders"], load);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), PICKUP_CHAT_POLL_MS);
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

  const addPhotos = useCallback(async () => {
    try {
      const assets = await pickChatImages();
      if (!assets.length) return;
      const next = [...pending];
      for (const asset of assets) {
        const problem = validateChatImageAsset(asset);
        if (problem) {
          setSendError(problem);
          return;
        }
        if (next.length >= PICKUP_CHAT_IMAGE_MAX_COUNT) {
          setSendError(`A message can include up to ${PICKUP_CHAT_IMAGE_MAX_COUNT} photos.`);
          return;
        }
        next.push({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      }
      setSendError(null);
      setPending(next);
    } catch {
      setSendError("This phone could not open its photos. Try again.");
    }
  }, [pending]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fileIds: string[] = [];
      for (const asset of pending) {
        fileIds.push(await uploadChatImage(asset, PICKUP_CHAT_IMAGE_PURPOSE));
      }
      const posted = fileIds.length
        ? await api.sendPickupMessage(orderId, body, { attachmentFileIds: fileIds })
        : await api.sendPickupMessage(orderId, body);
      setDraft("");
      setPending([]);
      if (posted.chat) setChat(posted.chat);
      setMessages((current) =>
        current.some((row) => row.id === posted.message.id) ? current : [...current, posted.message],
      );
      followingEnd.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setSendError(pickupSendError(err));
      // A refusal can mean the job was just delivered; re-read to say so.
      void load();
    } finally {
      setSending(false);
    }
  }, [draft, load, orderId, pending, sending]);

  const canSend = !sending && Boolean(draft.trim() || pending.length);
  const open = chat?.status === "open";
  const name = riderNameOf(chat);

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
              <Bike size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-h3 text-text-primary">{chat?.riderFirstName || "Your rider"}</Text>
              <Text className="text-caption text-text-muted">
                {open ? "Collecting this job" : chat ? "Delivered" : " "}
              </Text>
            </View>
          </View>

          {chat ? (
            <View
              className="flex-row items-start gap-2 rounded-field px-3 py-2"
              style={{ backgroundColor: colors.surfaceVariant }}
              accessible
              accessibilityLabel={pickupChatNotice(chat)}
            >
              <Lock size={14} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 3 }} aria-hidden />
              <Text className="flex-1 text-caption text-text-secondary">{pickupChatNotice(chat)}</Text>
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
              testID="pickup-chat-transcript"
              className="flex-1"
              contentContainerClassName="grow justify-end gap-3 pb-2"
              keyboardShouldPersistTaps="handled"
              onScroll={trackEnd}
              scrollEventThrottle={32}
              onLayout={keepEndInView}
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
                      ? `Ask ${name} where they are, or tell them which door to use and what to look for. A photo of your shop front helps.`
                      : "Nobody wrote during this pickup."
                  }
                />
              ) : (
                messages.map((message) => (
                  <View
                    key={message.id}
                    className={message.mine ? "max-w-[80%] items-end self-end" : "max-w-[80%] items-start self-start"}
                  >
                    <View
                      className="rounded-card px-3 py-2"
                      style={{
                        backgroundColor: message.mine ? colors.accent : colors.surface,
                        borderWidth: message.mine ? 0 : 1,
                        borderColor: colors.outline,
                      }}
                    >
                      {message.body ? (
                        <Text className="text-body" style={{ color: message.mine ? colors.accentOn : colors.textPrimary }}>
                          {message.body}
                        </Text>
                      ) : null}
                      {message.attachments?.map((attachment) => (
                        <View key={attachment.fileId} className={message.body ? "mt-2" : undefined}>
                          <ChatPhoto attachment={attachment} />
                        </View>
                      ))}
                    </View>
                    <Text className="mt-1 text-caption text-text-muted">
                      {senderLabel(message, chat)} · {timeOf(message.createdAt)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {sendError ? (
            <Text className="text-caption text-error" accessibilityLiveRegion="polite">
              {sendError}
            </Text>
          ) : null}

          {open && pending.length ? (
            <View className="flex-row flex-wrap gap-2" accessibilityLabel={`${pending.length} photos ready to send`}>
              {pending.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} className="relative">
                  <Image
                    source={{ uri: photo.uri }}
                    accessibilityLabel={photo.name}
                    style={{ width: 56, height: 56, borderRadius: 8 }}
                  />
                  <Pressable
                    onPress={() => setPending((current) => current.filter((_, at) => at !== index))}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${photo.name}`}
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
            <View className="flex-row items-end gap-2">
              <Pressable
                onPress={() => void addPhotos()}
                disabled={sending || pending.length >= PICKUP_CHAT_IMAGE_MAX_COUNT}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                accessibilityState={{ disabled: sending || pending.length >= PICKUP_CHAT_IMAGE_MAX_COUNT }}
                className="gg-touch h-12 w-12 items-center justify-center rounded-field"
                style={{
                  borderWidth: 1,
                  borderColor: colors.outline,
                  opacity: sending || pending.length >= PICKUP_CHAT_IMAGE_MAX_COUNT ? 0.38 : 1,
                }}
              >
                <ImagePlus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={`Write to ${name}`}
                accessibilityLabel={`Message ${name}`}
                multiline
                maxLength={PICKUP_MESSAGE_MAX}
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
          ) : chat ? (
            <SecondaryButton label="Back to the job" onPress={onOpenJob} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function timeOf(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}
