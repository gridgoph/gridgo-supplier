import * as WebBrowser from "expo-web-browser";
import { ChevronRight, ImageOff, Receipt } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** The wallet receipt Operations kept when this part was sent. */
  fileId: string;
  /** The wallet's reference for the transfer, when one was typed. */
  reference?: string | null;
  /** Names the part, for anyone who cannot see the picture. */
  label: string;
};

/**
 * The receipt behind one release.
 *
 * When Operations sends a part of a job, the wallet shows a confirmation with a
 * reference number, and that screenshot is the shop's proof the money left
 * GRIDGO. It is drawn small beside the line it belongs to - a thumbnail and the
 * reference are enough to match against the wallet on the shop's own phone -
 * and opens full size on a tap, through a fresh signed link so an old one is
 * never handed to the browser.
 *
 * The thumbnail's link lives five minutes, and this screen can sit in the
 * background far longer: `useSignedLink` renews an expired one once and on
 * resume, so coming back to the app is a brief sweep, not "will not load".
 */
export function PayoutReceipt({ fileId, reference, label }: Props) {
  const colors = useThemeColors();
  const picture = useSignedLink(fileId);
  const [openFailed, setOpenFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function open() {
    if (opening) return;
    setOpening(true);
    try {
      const link = await api.getDownloadUrl(fileId);
      if (mounted.current) await WebBrowser.openBrowserAsync(link.url);
    } catch {
      if (mounted.current) setOpenFailed(true);
    } finally {
      if (mounted.current) setOpening(false);
    }
  }

  return (
    <Pressable
      onPress={() => void open()}
      accessibilityRole="button"
      accessibilityLabel={`Open the wallet receipt for ${label}`}
      className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface p-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-16 w-12 overflow-hidden rounded-field bg-white"
        aria-hidden
      >
        {picture.uri ? (
          <Image
            testID="payout-receipt-image"
            source={{ uri: picture.uri }}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
            onLoad={picture.onLoad}
            onError={picture.onError}
          />
        ) : picture.failed ? (
          <View className="flex-1 items-center justify-center">
            <ImageOff size={18} color={colors.textMuted} strokeWidth={2} />
          </View>
        ) : (
          <SkeletonBlock className="h-full w-full" />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Receipt size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          <Text className="text-body text-text-primary">Wallet receipt</Text>
        </View>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {reference ? `Reference ${reference}` : "No reference recorded"}
          {picture.failed || openFailed ? " · picture will not load" : ""}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
