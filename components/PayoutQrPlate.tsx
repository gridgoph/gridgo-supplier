import { ImageOff, QrCode } from "lucide-react-native";
import { useState } from "react";
import { Image, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/Skeleton";
import { useSignedLink } from "@/hooks/useSignedLink";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** The plate GRIDGO holds. */
  fileId?: string | null;
  /** The plate as just photographed on this phone, before the round trip lands. */
  localUri?: string | null;
  /** Drawn over the picture while the bytes are still travelling. */
  sending?: boolean;
  /** One line under the plate, in the plate's own voice. */
  caption?: string | null;
};

/**
 * The shop's receiving QR, drawn as the plate it is.
 *
 * A QR is read by a camera, not a person, so this frame does one thing the
 * rest of the app never does: it stays white in the dark theme. A plate drawn
 * on a dark surface is a plate a wallet app may refuse to read, and the whole
 * point of the picture is that Operations can point a phone at it.
 *
 * Square, because every wallet's plate is. No crop marks: those mean "print
 * sample" everywhere else in this app, and this is not a sample of anything.
 *
 * GRIDGO's copy is drawn through `useSignedLink`: the link lives five minutes,
 * and a shop that leaves this screen in the background comes back to its plate,
 * not to "This picture will not load".
 */
export function PayoutQrPlate(props: Props) {
  // A replacement source owns fresh loading state before it is painted.
  return <Plate key={JSON.stringify([props.fileId, props.localUri])} {...props} />;
}

function Plate({ fileId, localUri, sending, caption }: Props) {
  const colors = useThemeColors();
  const [localRefused, setLocalRefused] = useState(false);
  // The plate as just photographed wins until GRIDGO's own copy is asked for.
  const drawLocal = Boolean(localUri) && !localRefused;
  const stored = useSignedLink(fileId, !localUri);
  const uri = drawLocal ? localUri! : stored.uri;
  const failed = localUri ? localRefused : stored.failed;

  const empty = !fileId && !localUri;

  return (
    <View className="items-center gap-2">
      <View
        className="w-full max-w-64 overflow-hidden rounded-card border border-outline bg-white"
        style={{ aspectRatio: 1 }}
        accessibilityRole="image"
        accessibilityLabel={empty ? "No payout QR yet" : "Your payout QR"}
      >
        {uri && !failed ? (
          <Image
            testID="payout-qr-image"
            source={{ uri }}
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
            onLoad={drawLocal ? undefined : stored.onLoad}
            onError={drawLocal ? () => setLocalRefused(true) : stored.onError}
          />
        ) : empty ? (
          <View className="flex-1 items-center justify-center gap-2 p-4">
            <QrCode size={40} color={colors.textMuted} strokeWidth={1.5} />
            <Text className="text-center text-caption text-text-muted">No QR yet</Text>
          </View>
        ) : failed ? (
          <View className="flex-1 items-center justify-center gap-2 p-4">
            <ImageOff size={24} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-center text-caption text-text-muted">
              This picture will not load
            </Text>
          </View>
        ) : (
          <SkeletonBlock className="h-full w-full" />
        )}
        {sending ? (
          <View className="absolute inset-0 items-center justify-center bg-scrim">
            <Text className="text-caption text-accent-on">Sending…</Text>
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text className="text-center text-caption text-text-muted">{caption}</Text>
      ) : null}
    </View>
  );
}
