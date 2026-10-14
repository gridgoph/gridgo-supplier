import { router, type Href } from "expo-router";
import { FileText, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { noticeBody, noticeHeading, unseenNotices } from "@/lib/legal";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { useLegalNotices } from "@/store/legalNotices";
import { useSession } from "@/store/session";

const LIBRARY = "/legal" as Href;
const NO_SEEN: string[] = [];
const NONE: never[] = [];

/**
 * An editorial change to a document: said once on Home, never blocking.
 *
 * gridgo-api sends these as `notices` beside the blocking list and leaves it to
 * the app to remember which it has shown. Reading or closing it is that
 * memory, per account on this phone; nothing is recorded server-side and no
 * box is ticked.
 */
export function LegalNoticeCard({ className }: { className?: string }) {
  const colors = useThemeColors();
  const userId = useSession((state) => state.user?.id ?? null);
  const notices = useLegalConsent((state) =>
    legalGateFor(state, userId) === "clear" ? state.notices : NONE,
  );
  const hydrated = useLegalNotices((state) => state.hydrated);
  const seen = useLegalNotices((state) => (userId ? state.seen[userId] : undefined) ?? NO_SEEN);

  const fresh = hydrated ? unseenNotices(notices, seen) : [];
  if (!userId || fresh.length === 0) return null;

  const done = () => useLegalNotices.getState().markSeen(userId, fresh.map((doc) => doc.id));

  return (
    <View className={className}>
      <View className="gg-card-flush flex-row gap-3 py-4 pl-4 pr-1">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
          <FileText size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>

        <View className="min-w-0 flex-1 gap-1 pt-0.5">
          <Text className="text-body-lg font-bold text-text-primary">{noticeHeading(fresh)}</Text>
          <Text className="text-body text-text-secondary">{noticeBody(fresh)}</Text>
          <Pressable
            onPress={() => {
              done();
              router.push(LIBRARY);
            }}
            accessibilityRole="link"
            accessibilityLabel="Read them in Legal & Privacy"
            className="gg-touch justify-center self-start"
          >
            <Text className="text-body font-medium text-text-primary underline">Read them</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={done}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the policy notice"
          hitSlop={4}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}
        >
          <X size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
        </Pressable>
      </View>
    </View>
  );
}
