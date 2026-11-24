import { useState } from "react";
import { Pressable as NativePressable, type GestureResponderEvent, type PressableProps } from "react-native";

/**
 * React Native's `Pressable`, for any pressable that carries a `className`
 * and also wants a `style={({ pressed }) => …}` function.
 *
 * On a phone, NativeWind (react-native-css) merges `className` and `style`
 * into one array, `[classStyle, styleFunction]`. React Native only calls
 * `style` when `style` is itself a function, so the function inside the array
 * is dropped: no pressed feedback, and any size, colour or opacity it set is
 * lost. Jest and Expo web do not go through that merge, so they still draw it
 * and only a phone shows the difference (issue report 8DC78D1F, where a lost
 * width drew shop product tiles at full photo size).
 *
 * This keeps the pressed state itself and hands the native `Pressable` a plain
 * style object, which merges with `className` everywhere. Behaviour is
 * otherwise React Native's own: a disabled control never reports pressed, and
 * a press cancelled by a scroll ends on `onPressOut`.
 *
 * `components/__tests__/pressableStyle.test.tsx` fails if a pressable imported
 * from `react-native` pairs `className` with a style function again.
 */
export function Pressable({ style, onPressIn, onPressOut, ...rest }: PressableProps) {
  const [pressed, setPressed] = useState(false);

  if (typeof style !== "function") {
    return <NativePressable {...rest} onPressIn={onPressIn} onPressOut={onPressOut} style={style} />;
  }

  return (
    <NativePressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={style({ pressed, hovered: false })}
    />
  );
}
