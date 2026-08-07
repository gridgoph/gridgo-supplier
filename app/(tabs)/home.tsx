import { ScreenPlaceholder } from "@/components/ScreenPlaceholder";

/**
 * Product catalog: frequently reordered items and one-tap reorder.
 *
 * Named `home` rather than `index` because the launcher at `app/index.tsx`
 * already holds `/`. It becomes the tab group's index once auth lands and the
 * launcher goes.
 */
export default function HomeScreen() {
  return <ScreenPlaceholder name="Home" />;
}
