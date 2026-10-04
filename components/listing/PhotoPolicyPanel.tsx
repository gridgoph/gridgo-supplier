import {
  CircleCheck,
  CircleX,
  Copyright,
  Stamp,
  Store,
  type LucideIcon,
} from "lucide-react-native";
import { Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { useThemeColors } from "@/hooks/useTheme";
import { PHOTO_POLICY_ALLOWED, PHOTO_POLICY_RULES, type PhotoPolicyRule } from "@/lib/photoPolicy";

const RULE_ICONS: Record<PhotoPolicyRule["key"], LucideIcon> = {
  watermark: Copyright,
  logo: Stamp,
  branding: Store,
};

/**
 * The photo policies, shown rather than only told.
 *
 * The same print twice, inside the crop marks a sample wears on the board:
 * once as GRIDGO wants it, once with the three things that send a photo back
 * drawn on top. A shop recognises its own habit faster than it parses a rule,
 * and the pair makes clear the rules are about what is added to a photo, not
 * about the work in it. Drawn, not photographed, so no example carries a real
 * shop's mark and both themes paint it from tokens.
 */
export function PhotoPolicyPanel() {
  const colors = useThemeColors();

  return (
    <View className="gap-5">
      <View className="flex-row gap-3" accessible={false}>
        <View className="min-w-0 flex-1 gap-2">
          <CropMarkFrame gutter="tight">
            <ExamplePrint />
          </CropMarkFrame>
          <Verdict
            icon={CircleCheck}
            tint={colors.success}
            label="Like this"
            detail={PHOTO_POLICY_ALLOWED}
          />
        </View>
        <View className="min-w-0 flex-1 gap-2">
          <CropMarkFrame gutter="tight">
            <ExamplePrint branded />
          </CropMarkFrame>
          <Verdict
            icon={CircleX}
            tint={colors.error}
            label="Not like this"
            detail="Watermark, logo, shop name"
          />
        </View>
      </View>

      <View className="gap-3">
        {PHOTO_POLICY_RULES.map((rule) => {
          const Icon = RULE_ICONS[rule.key];
          return (
            <View
              key={rule.key}
              className="flex-row items-start gap-3"
              accessible
              accessibilityLabel={`${rule.title}. ${rule.example}`}
            >
              <View className="h-8 w-8 items-center justify-center rounded-pill bg-surface-variant">
                <Icon size={16} color={colors.textPrimary} strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-body font-bold text-text-primary">{rule.title}</Text>
                <Text className="text-caption text-text-secondary">{rule.example}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Verdict({
  icon: Icon,
  tint,
  label,
  detail,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  detail: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${detail}`} className="gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <Icon size={14} color={tint} strokeWidth={2.25} />
        <Text className="text-caption font-bold text-text-primary">{label}</Text>
      </View>
      <Text className="text-caption text-text-muted">{detail}</Text>
    </View>
  );
}

/**
 * A tarpaulin, in miniature. `branded` lays on the three things the rules
 * name: a watermark across it, a logo in the corner, a phone strip along the
 * foot — the usual ways a shop signs a photo.
 */
function ExamplePrint({ branded = false }: { branded?: boolean }) {
  const colors = useThemeColors();

  return (
    <View className="h-24 justify-center overflow-hidden bg-surface px-3" aria-hidden>
      <Text className="text-caption font-bold text-text-primary" numberOfLines={1}>
        Grand opening
      </Text>
      <Text className="text-caption text-text-muted" numberOfLines={1}>
        This Saturday
      </Text>
      <View className="mt-2 h-1.5 w-3/5 rounded-pill bg-outline" />

      {branded ? (
        <>
          <View className="absolute inset-0 items-center justify-center">
            <Text
              className="-rotate-12 text-body font-black text-text-muted opacity-50"
              numberOfLines={1}
            >
              © YOUR SHOP
            </Text>
          </View>
          <View className="absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-pill bg-accent">
            <Store size={12} color={colors.accentOn} strokeWidth={2.25} />
          </View>
          <View className="absolute bottom-0 left-0 right-0 bg-accent px-2 py-0.5">
            <Text className="text-caption text-accent-on" numberOfLines={1}>
              Call 0900 000 0000
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
