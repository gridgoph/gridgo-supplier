import { Text } from "react-native";

import { huntSegments } from "@/lib/highlight";

type Props = {
  name: string;
  /** What the shop typed. Blank leaves the name exactly as it was. */
  hunt: string;
  className: string;
  numberOfLines?: number;
};

/**
 * A listing's name, with the run the shop hunted for set in bold.
 *
 * GRIDGO ranks a hunt across the whole listing — its description, its kind of
 * work, its add-on labels, its prep steps — so a tile can come back for words
 * that are nowhere in its name. Marking the name is what answers "why is this
 * one here", and leaving the rest unmarked is what keeps that answer readable.
 *
 * The mark is weight, not colour: yellow belongs to the one action on this
 * screen, and a wash behind a name would read as a standing this listing does
 * not have. With no hunt running this renders the plain string, so the resting
 * wall is exactly what it was before.
 */
export function HuntedName({ name, hunt, className, numberOfLines }: Props) {
  const segments = huntSegments(name, hunt);
  const marked = segments.some((segment) => segment.match);

  return (
    <Text className={className} numberOfLines={numberOfLines}>
      {marked
        ? segments.map((segment, index) =>
            segment.match ? (
              <Text key={index} className="font-bold">
                {segment.text}
              </Text>
            ) : (
              segment.text
            ),
          )
        : name}
    </Text>
  );
}
