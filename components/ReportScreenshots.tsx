import { Camera, ImagePlus, X } from "lucide-react-native";
import type { ComponentType } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { ProblemReportScreenshot } from "@/lib/problemReport";

const THUMB = 88;

type Props = {
  screenshots: ProblemReportScreenshot[];
  max: number;
  disabled?: boolean;
  onAdd: () => void;
  onTakePhoto: () => void;
  onRemove: (index: number) => void;
};

/**
 * The screenshots going with a problem report: a thumbnail for each with its
 * own remove control, and the add controls while there is room for another.
 * The field's hint already says how many fit, so a full set just drops them.
 */
export function ReportScreenshots({ screenshots, max, disabled, onAdd, onTakePhoto, onRemove }: Props) {
  const colors = useThemeColors();
  const full = screenshots.length >= max;

  return (
    <View className="gap-3">
      {screenshots.length ? (
        <View className="flex-row flex-wrap gap-3">
          {screenshots.map((shot, index) => (
            <View
              key={`${shot.uri}-${index}`}
              className="overflow-hidden rounded-field border border-outline bg-surface-variant"
              style={{ width: THUMB, height: THUMB }}
            >
              <Image
                source={{ uri: shot.uri }}
                resizeMode="cover"
                accessibilityLabel={`Screenshot ${index + 1}`}
                style={{ width: "100%", height: "100%" }}
              />
              <Pressable
                onPress={() => onRemove(index)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove screenshot ${index + 1}`}
                accessibilityState={{ disabled: Boolean(disabled) }}
                hitSlop={4}
                className="absolute right-0 top-0 h-11 w-11 items-end justify-start p-1"
              >
                <View className="h-7 w-7 items-center justify-center rounded-pill border-2 border-surface bg-accent">
                  <X size={16} color={colors.accentOn} strokeWidth={2.5} />
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {full ? null : (
        <View className="flex-row gap-3">
          <AddButton label="Add screenshot" icon={ImagePlus} disabled={disabled} onPress={onAdd} />
          <AddButton label="Take photo" icon={Camera} disabled={disabled} onPress={onTakePhoto} />
        </View>
      )}
    </View>
  );
}

function AddButton({
  label,
  icon: Icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled flex-1" : "gg-btn-secondary flex-1"}
    >
      {({ pressed }) => (
        <>
          <Icon size={18} color={colors.textPrimary} strokeWidth={2} />
          <Text className="text-button text-text-primary">{label}</Text>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
