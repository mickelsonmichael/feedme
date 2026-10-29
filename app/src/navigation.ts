import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList, TabParamList } from "./types";

type RootNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  "canGoBack" | "goBack" | "popTo"
>;

/**
 * Returns to one of the tabs from a screen pushed on the root stack.
 *
 * In React Navigation 7 a stack screen can't `navigate("Feeds")` directly —
 * the tab routes live in the nested tab navigator, not the stack — and
 * `navigate` to a route already in the stack doesn't reliably pop back to it.
 * `popTo` the Tabs route does both: it pops everything above the tabs and
 * selects the requested one.
 */
export function toTab<T extends keyof TabParamList>(
  navigation: RootNavigation,
  tab: T,
  ...params: undefined extends TabParamList[T]
    ? [TabParamList[T]?]
    : [TabParamList[T]]
): void {
  navigation.popTo("Tabs", {
    screen: tab,
    params: params[0],
  } as RootStackParamList["Tabs"]);
}

/** The `from` tab a screen was opened from, if it names a real tab. */
export function tabFromParam(from: string | undefined): keyof TabParamList {
  return from === "Feeds" ||
    from === "Discover" ||
    from === "Settings" ||
    from === "Saved" ||
    from === "ReadLater"
    ? from
    : "Feed";
}

/**
 * Pops back to whatever opened this screen — the normal case on a stack. With
 * nothing to pop (the screen was the first thing opened, say from a
 * notification), lands on `fallbackTab` instead.
 */
export function goBackOr(
  navigation: RootNavigation,
  fallbackTab: keyof TabParamList
): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
  } else {
    toTab(navigation, fallbackTab);
  }
}
