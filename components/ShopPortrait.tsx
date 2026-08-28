import { Store } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** Clerk's hosted portrait. Absent until the shop has set one. */
  imageUrl?: string | null;
  /** The shop's name, so anyone who cannot see the picture knows whose it is. */
  shopName: string;
  /** Edge length in points. 56 in a card, 96 at the head of a form. */
  size: number;
};

/**
 * The shop itself, as a picture.
 *
 * Every other photograph in this app is a print sample, and it wears the
 * crop-mark frame that says so: squared, registration marks, work that came off
 * a machine. This is the one picture that is not a print, and it is the only
 * round frame in the product — that contrast is the whole point. A circle reads
 * as premises and people; a trimmed rectangle reads as a job. Keeping the two
 * apart is what stops a shop's own portrait being scanned as another listing.
 *
 * With no picture yet it is a shop mark, never an initial. A letter in a
 * coloured disc is the house style of every product that has no idea who its
 * user is, and this one does — it is a print shop in Davao, and the frame can
 * say so while it waits.
 */
export function ShopPortrait({ imageUrl, shopName, size }: Props) {
  const colors = useThemeColors();
  const [failed, setFailed] = useState(false);

  // A new portrait in the same frame: the last one's failure goes with it, or
  // one bad load sticks to every picture the shop sets afterwards.
  useEffect(() => setFailed(false), [imageUrl]);

  const showing = imageUrl && !failed;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={showing ? `${shopName}, shop photo` : `${shopName}, no shop photo yet`}
      className="items-center justify-center overflow-hidden border border-outline bg-surface-variant"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {showing ? (
        <Image
          source={{ uri: imageUrl }}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
          onError={() => setFailed(true)}
          accessibilityElementsHidden
        />
      ) : (
        <Store size={Math.round(size * 0.38)} color={colors.textMuted} strokeWidth={1.75} />
      )}
    </View>
  );
}
