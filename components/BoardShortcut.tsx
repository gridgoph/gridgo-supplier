import { Pressable, View } from "react-native";
import { router } from "expo-router";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SamplePhoto } from "@/components/SamplePhoto";
import { boardCountLine, boardFace, type Listing } from "@/lib/listings";

type Props = {
  /** The board as GRIDGO returned it, in the shop's own order. */
  listings: Listing[];
};

/**
 * The corner of the board, in the corner of the floor.
 *
 * Home's masthead used to end in a status chip counting today's jobs, and the
 * captain read that corner as a bell — which is fair, because a small pill in
 * the top right of a mobile header is a bell everywhere else. Alerts have a tab
 * with a badge on it and that is the only place they belong, so the corner is
 * given to the one thing a shop otherwise has to go looking for: its board.
 *
 * It is a photograph rather than a glyph, and that is the whole idea. A picture
 * of the shop's own work cannot be mistaken for a notification, a warning or a
 * count of anything — which is exactly the failure being fixed, solved at the
 * root instead of by choosing a quieter icon. It also costs less width than the
 * chip it replaces, so a long shop name has more room than before, not less.
 *
 * The frame is the app's existing one. Crop marks are what a printer trims to,
 * so a photo inside them reads as a sample clipped to a wall, and every listing
 * on the board already wears them: the corner is a scaled-down piece of the
 * screen it opens. Nothing new is invented here, which is the point — the
 * board's signature is spent once and reused, never doubled.
 *
 * There is no count drawn on it and no label under it. The board's situation —
 * how many, what is unfinished — is the card further down this same screen, and
 * saying it twice would make the corner a second, worse version of that card.
 * This is a door. Screen readers get the count spoken instead, because they are
 * the ones a photograph tells nothing, and in the same words the sample strip
 * further down uses: two controls that go to the same place should not announce
 * themselves as two different things.
 */
export function BoardShortcut({ listings }: Props) {
  const face = boardFace(listings);

  return (
    <Pressable
      onPress={() => router.push("/shop")}
      accessibilityRole="button"
      accessibilityLabel={`Open your board. ${boardCountLine(listings.length)}.`}
      className="gg-touch w-14"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {face ? (
        <SamplePhoto fileId={face} altText="" gutter="tight" />
      ) : (
        /*
          A board with nothing on it is a trimmed blank, not a plus sign. The
          frame already draws the quiet panel and its marks, so an empty square
          inside it is the honest picture of an empty wall — and it promises
          nothing about what the tap does, which "add" would.
        */
        <CropMarkFrame gutter="tight">
          <View className="aspect-square w-full" accessibilityElementsHidden />
        </CropMarkFrame>
      )}
    </Pressable>
  );
}
