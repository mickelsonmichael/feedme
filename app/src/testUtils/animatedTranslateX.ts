import type { ReactTestInstance } from "react-test-renderer";
import Animated, { getAnimatedStyle } from "react-native-reanimated";

// Reanimated's web typings declare getAnimatedStyle() with no parameters; the
// build Jest actually runs takes the component.
const readAnimatedStyle = getAnimatedStyle as unknown as (component: {
  props: Record<string, unknown>;
}) => { transform?: { translateX?: number }[] };

/**
 * The live translateX of the Reanimated view under `root`. Reanimated puts the
 * animated style on the host view it renders, not on the Animated.View
 * wrapper. `+ 0` folds a resting -0 (from `-0 * width`) into 0.
 */
export function animatedTranslateX(root: ReactTestInstance): number {
  const host = root
    .findByType(Animated.View)
    .find((node) => node.props.jestAnimatedStyle !== undefined);
  const translate = readAnimatedStyle(host).transform?.find(
    (entry) => entry.translateX !== undefined
  );
  return (translate?.translateX ?? 0) + 0;
}
