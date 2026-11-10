import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { colors } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { tokenFromLink } from "@/lib/shopTeam";
import { useTeamJoin } from "@/store/teamJoin";

/**
 * Scan the Owner's team QR.
 *
 * The camera asks for permission here and nowhere else, on the tap that
 * brought the person to this screen. The first readable team link closes the
 * camera and hands its token to the join screen; anything else is ignored
 * with one line, so a menu QR on the counter does not end the scan.
 */
export default function ScanTeamScreen() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [notTeam, setNotTeam] = useState(false);
  const done = useRef(false);

  function onScanned(data: string) {
    if (done.current) return;
    const token = tokenFromLink(data);
    if (!token) {
      setNotTeam(true);
      return;
    }
    done.current = true;
    useTeamJoin.getState().holdToken(token);
    router.back();
  }

  const close = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Close the camera"
      className="gg-touch h-11 w-11 items-center justify-center rounded-pill bg-surface"
    >
      <X size={22} color={theme.textPrimary} aria-hidden />
    </Pressable>
  );

  if (!permission?.granted) {
    const blocked = permission != null && !permission.canAskAgain;
    return (
      <View className="gg-screen gg-page" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row justify-end">{close}</View>
        <View className="flex-1 justify-center gap-4">
          <Text className="text-h2 text-text-primary">Scan the owner&apos;s QR</Text>
          <Text className="text-body-lg text-text-secondary">
            {blocked ? "Camera is off for GRIDGO. Turn it on in Settings." : "GRIDGO needs the camera for this."}
          </Text>
          <PrimaryButton
            label={blocked ? "Open Settings" : "Turn on camera"}
            onPress={() => void (blocked ? Linking.openSettings() : requestPermission())}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.dark.canvas }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onScanned(data)}
      />
      {/* The target: where to hold the code. Corners only, so the code shows through. */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View style={{ width: 240, height: 240 }}>
          {CORNERS.map((corner) => (
            <View
              key={corner.key}
              style={{
                position: "absolute",
                width: 36,
                height: 36,
                borderColor: colors.dark.actionYellow,
                ...corner.style,
              }}
            />
          ))}
        </View>
      </View>
      <View
        className="absolute left-0 right-0 flex-row justify-end px-4"
        style={{ top: insets.top + 8 }}
      >
        {close}
      </View>
      <View
        className="absolute left-0 right-0 items-center px-4"
        style={{ bottom: insets.bottom + 32 }}
      >
        <View className="rounded-pill bg-surface px-4 py-2">
          <Text className="text-body font-medium text-text-primary">
            {notTeam ? "That is not a team QR" : "Point at the owner's QR"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const CORNERS = [
  { key: "tl", style: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 } },
  { key: "tr", style: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 } },
  { key: "bl", style: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 } },
  { key: "br", style: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 } },
] as const;
