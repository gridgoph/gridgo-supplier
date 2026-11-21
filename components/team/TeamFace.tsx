import { Image } from "expo-image";
import { Text, View } from "react-native";

import { useSignedLink } from "@/hooks/useSignedLink";
import { initialOf } from "@/lib/teamRoster";

type Props = {
  name: string;
  /** A private team photo; the first letter stands in until it loads, or forever. */
  photoFileId?: string | null;
  size?: number;
  /** Ring the face: the person picked on the shared phone. */
  selected?: boolean;
};

/**
 * One teammate's face: their optional photo, else their first letter.
 *
 * Photos are private GRIDGO files read through a five-minute signed link
 * (`hooks/useSignedLink`), never a link held in state. The letter is the
 * design, not a fallback that looks broken: most shops will never add a photo.
 */
export function TeamFace({ name, photoFileId, size = 56, selected = false }: Props) {
  const picture = useSignedLink(photoFileId ?? null);
  const letterSize = Math.round(size * 0.4);
  return (
    <View
      aria-hidden
      className={
        selected
          ? "items-center justify-center overflow-hidden rounded-pill border-2 border-action-yellow bg-accent"
          : "items-center justify-center overflow-hidden rounded-pill border border-outline bg-surface-variant"
      }
      style={{ width: size, height: size }}
    >
      <Text
        className={selected ? "font-bold text-accent-on" : "font-bold text-text-primary"}
        style={{ fontSize: letterSize, lineHeight: Math.round(letterSize * 1.25) }}
      >
        {initialOf(name)}
      </Text>
      {picture.uri ? (
        <Image
          source={{ uri: picture.uri }}
          onError={picture.onError}
          onLoad={picture.onLoad}
          contentFit="cover"
          style={{ position: "absolute", width: size, height: size }}
        />
      ) : null}
    </View>
  );
}
