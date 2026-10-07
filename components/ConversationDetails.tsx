import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

import { ChatAvatar } from "@/components/ChatAvatar";
import { ChatPhoto } from "@/components/ChatPhoto";
import { useThemeColors } from "@/hooks/useTheme";
import type { SupportChatAttachment, SupportChatMessage } from "@/lib/api";
import { formatNotificationAt } from "@/lib/dates";

function snippet(message: SupportChatMessage): string {
  const body = message.body?.trim();
  if (body) return body;
  return message.attachments?.length ? "Photo" : "Message";
}

export function ConversationDetails({
  name,
  subtitle,
  imageUrl,
  searchValue,
  onSearchValueChange,
  searchResults,
  photos,
  onDelete,
  onClose,
}: {
  name: string;
  subtitle: string;
  imageUrl?: string | null;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  searchResults: SupportChatMessage[];
  photos: SupportChatAttachment[];
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const searchRef = useRef<TextInput>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const query = searchValue.trim();
  const resultCount = query ? searchResults.length : 0;

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  if (searchOpen) {
    return (
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setSearchOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            className="gg-touch h-11 w-11 items-center justify-center"
          >
            <X size={18} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text className="text-h2 text-text-primary">Search</Text>
        </View>

        <View
          className="mt-3 flex-row items-center gap-2 rounded-field border border-outline px-3"
          style={{ backgroundColor: colors.surface }}
        >
          <Search size={16} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            ref={searchRef}
            value={searchValue}
            onChangeText={onSearchValueChange}
            placeholder="Search this chat"
            accessibilityLabel="Search this chat"
            className="min-h-11 min-w-0 flex-1 text-body text-text-primary"
            placeholderTextColor={colors.textMuted}
          />
          {query ? (
            <Text className="text-caption text-text-muted">
              {resultCount === 1 ? "1 result" : `${resultCount} results`}
            </Text>
          ) : null}
          {searchValue ? (
            <Pressable
              onPress={() => onSearchValueChange("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              className="h-11 w-8 items-center justify-center"
            >
              <X size={16} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          className="mt-3 flex-1"
          contentContainerClassName="pb-6"
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Search results"
        >
          {!query ? (
            <Text className="pt-4 text-body text-text-muted">
              Type a word to find it in this conversation.
            </Text>
          ) : searchResults.length === 0 ? (
            <Text className="pt-4 text-body text-text-muted">No messages match that search.</Text>
          ) : (
            searchResults.map((message) => {
              const sender = message.mine ? "You" : name;
              const text = snippet(message);
              const when = formatNotificationAt(message.createdAt);
              return (
                <View
                  key={message.id}
                  className="flex-row items-start gap-3 border-b border-outline py-3"
                  accessibilityLabel={`${sender}, ${text}, ${when}`}
                >
                  <ChatAvatar name={sender} imageUrl={message.senderImageUrl} size={40} />
                  <View className="min-w-0 flex-1">
                    <Text className="text-body text-text-primary" numberOfLines={2}>
                      {text}
                    </Text>
                    <Text className="mt-1 text-caption text-text-muted">{when}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-caption text-text-muted">Conversation</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close conversation details"
          className="gg-touch h-11 w-11 items-center justify-center"
        >
          <X size={18} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        <View className="items-center gap-2 pt-2">
          <ChatAvatar name={name} imageUrl={imageUrl} size={80} />
          <Text className="text-h2 text-text-primary">{name}</Text>
          <Text className="text-body text-text-secondary">{subtitle}</Text>
        </View>

        <View className="items-center">
          <Pressable
            onPress={() => setSearchOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Search in conversation"
            className="h-11 w-11 items-center justify-center rounded-pill"
            style={{ borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface }}
          >
            <Search size={18} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="text-body-lg font-medium text-text-primary">Media & files</Text>
          {photos.length === 0 ? (
            <Text className="text-caption text-text-muted">No photos in this chat yet.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {photos.map((attachment) => (
                <View key={attachment.fileId} className="w-[48%]">
                  <ChatPhoto attachment={attachment} fill />
                </View>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete chat"
          className="gg-touch h-12 items-center justify-center rounded-field"
          style={{ borderWidth: 1, borderColor: colors.outline }}
        >
          <Text className="text-body text-error">Delete chat</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
