import { Bell, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { motion, spacing } from "@/constants/theme";
import { useToasts, type Toast } from "@/store/toasts";
import { useThemeColors } from "@/hooks/useTheme";

/** Long enough to read two lines, short enough not to sit on the screen. */
const DWELL_MS = 6000;

/**
 * Alerts that arrive while the shop is somewhere else.
 *
 * ## Why it is at the top
 *
 * Every primary action in this app is at the foot of its screen — the yellow
 * CTA on a flow screen, the tab bar, the action row on a card. A toast that
 * covered one of those would put an interruption exactly where a thumb is
 * already moving. The top of the screen carries headings and status, so a
 * notice there costs a shop nothing it was about to press.
 *
 * ## Why it is not yellow
 *
 * The attention budget belongs to the one action a screen wants taken. A toast
 * is news, not an action, so it is a plain elevated surface with an icon and a
 * label — and it still reads in greyscale.
 *
 * Nothing here is the only copy of anything: every toast corresponds to a
 * notification sitting in the alerts list, which is why it can auto-dismiss
 * without losing information.
 */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (!toasts.length) return null;

  return (
    <View
      // Never intercepts a touch outside a card, so the screen underneath keeps
      // working while a toast is up.
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFillObject, { paddingTop: insets.top + spacing.sm }]}
      className="gg-page"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const colors = useThemeColors();
  const dismiss = useToasts((s) => s.dismiss);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DWELL_MS);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id]);

  const open = () => {
    dismiss(toast.id);
    if (toast.orderId) {
      router.push({ pathname: "/job/[id]", params: { id: toast.orderId } });
    } else {
      router.push("/alerts");
    }
  };

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
      pointerEvents="auto"
      className="mb-2 flex-row items-start gap-3 rounded-card border border-outline bg-surface-high p-3 shadow-sheet"
      accessibilityLiveRegion="polite"
    >
      <View className="pt-0.5">
        <Bell size={18} color={colors.textSecondary} strokeWidth={2} />
      </View>

      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${toast.title}. ${toast.body}`}
        accessibilityHint={toast.orderId ? "Opens the job" : "Opens your alerts"}
        className="min-w-0 flex-1 gap-0.5"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {toast.title}
        </Text>
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {toast.body}
        </Text>
      </Pressable>

      {/* Dismissible by hand, not only by waiting. */}
      <Pressable
        onPress={() => dismiss(toast.id)}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss: ${toast.title}`}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}
