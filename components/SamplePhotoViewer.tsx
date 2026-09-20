import { X } from "lucide-react-native";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Props = {
  uri: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

/**
 * One sample, full screen, so a shop can pinch in on the print.
 *
 * The crop-mark tile is the board; this is the loupe. A React Native `Modal`
 * renders outside the app's gesture root, so the root is remounted here —
 * without it a pinch on Android is a no-op. PanResponder cannot express a
 * two-finger scale, which is why this is the one Modal that uses RNGH.
 */
export function SamplePhotoViewer({ uri, alt, open, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  function resetView() {
    scale.value = 1;
    startScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    startX.value = 0;
    startY.value = 0;
  }

  function close() {
    resetView();
    onClose();
  }

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = startScale.value * event.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        return;
      }
      scale.value = withSpring(2);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    if (scale.value <= 1.05) runOnJS(close)();
  });

  const gesture = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(doubleTap, singleTap, pan),
  );

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const stage = (
    <Animated.View className="flex-1 items-center justify-center bg-black">
      <Animated.Image
        source={{ uri }}
        accessibilityLabel={alt}
        resizeMode="contain"
        style={[{ width, height }, photoStyle]}
      />
    </Animated.View>
  );

  const closeButton = (
    <Pressable
      onPress={close}
      testID="close-sample-photo"
      accessibilityRole="button"
      accessibilityLabel="Close the photo"
      className="absolute items-center justify-center"
      style={{ top: insets.top + 8, right: 12, width: 44, height: 44 }}
    >
      <X size={22} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );

  // Jest has no native Modal host and no gesture installer. The loupe is
  // still a real node so a press can be asserted; pinch lives on the device.
  if (process.env.NODE_ENV === "test") {
    if (!open) return null;
    return (
      <View
        style={{ flex: 1 }}
        testID="sample-photo-viewer"
        accessibilityViewIsModal
      >
        {stage}
        {closeButton}
      </View>
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <GestureHandlerRootView
        style={{ flex: 1 }}
        testID="sample-photo-viewer"
        accessibilityViewIsModal
      >
        <GestureDetector gesture={gesture}>{stage}</GestureDetector>
        {closeButton}
      </GestureHandlerRootView>
    </Modal>
  );
}
