import { CircleCheck, MessageSquareText, TriangleAlert } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { ItemInstructions } from "@/lib/orderChanges";
import { formatDeadlineFull } from "@/lib/dates";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  notes: ItemInstructions[];
  /** When this shop ticked that it read them; null while it has not. */
  readAt: string | null;
  /** True while the job is still an offer, so the tick is still to come. */
  offer: boolean;
  /** Opens the change request, when one can be asked for. */
  onRequestChange?: () => void;
};

/**
 * The client's own words about the job, set apart from the fixed options.
 *
 * Each note hangs off a warning-coloured rule, the way a slip is clipped to a
 * job ticket: it is the one part of the job nobody chose from a list, so it is
 * the part a shop skims past unless the page stops it. The tick is said
 * underneath in words and an icon, never by the colour alone.
 */
export function SpecialInstructionsPanel({ notes, readAt, offer, onRequestChange }: Props) {
  const colors = useThemeColors();
  const named = notes.length > 1;
  return (
    <View className="gg-card gap-4" testID="special-instructions">
      <View className="flex-row items-start gap-3">
        <MessageSquareText size={20} color={colors.warning} aria-hidden />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary">Special instructions</Text>
          <Text className="text-caption text-text-muted">
            The client wrote these for this job. They do not change the price.
          </Text>
        </View>
      </View>

      {notes.map((note, index) => (
        <View key={note.lineItemId || index} className="flex-row gap-3">
          <View className="w-1 rounded-pill bg-warning" />
          <View className="min-w-0 flex-1 gap-2 py-0.5">
            {named ? (
              <Text className="text-caption text-text-muted">
                Item {index + 1} · {note.itemName}
              </Text>
            ) : null}
            {note.text ? <Text className="text-body-lg text-text-primary">{note.text}</Text> : null}
            {note.agreedChange ? (
              <View className="gap-0.5">
                <Text className="text-caption text-text-muted">Agreed change</Text>
                <Text className="text-body text-text-primary">{note.agreedChange}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}

      {readAt ? (
        <View className="flex-row items-center gap-2" testID="special-instructions-read">
          <CircleCheck size={16} color={colors.success} aria-hidden />
          <Text className="min-w-0 flex-1 text-body text-success">
            Read and ticked {formatDeadlineFull(readAt)}
          </Text>
        </View>
      ) : offer ? (
        <View className="flex-row items-center gap-2">
          <TriangleAlert size={16} color={colors.warning} aria-hidden />
          <Text className="min-w-0 flex-1 text-body text-warning">
            You tick that you read these when you accept.
          </Text>
        </View>
      ) : null}

      {onRequestChange ? (
        <Pressable
          onPress={onRequestChange}
          accessibilityRole="link"
          className="gg-touch justify-center self-start"
        >
          <Text className="text-button text-brand">Costs more? Request a change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
