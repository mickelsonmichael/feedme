// First, so the native splash is held before anything else loads or renders.
import "./src/splash";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import {
  CommonActions,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@react-native-vector-icons/feather";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import FeedListScreen from "./src/screens/FeedListScreen";
import AddFeedScreen from "./src/screens/AddFeedScreen";
import FeedItemScreen from "./src/screens/FeedItemScreen";
import SavedScreen from "./src/screens/SavedScreen";
import ReadLaterScreen from "./src/screens/ReadLaterScreen";
import FeedsScreen from "./src/screens/FeedsScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import FeedSearchScreen from "./src/screens/FeedSearchScreen";
import FeedDetailScreen from "./src/screens/FeedDetailScreen";
import TagDetailScreen from "./src/screens/TagDetailScreen";
import CustomFeedEditScreen from "./src/screens/CustomFeedEditScreen";
import CustomFeedManageScreen from "./src/screens/CustomFeedManageScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ImportExportScreen from "./src/screens/ImportExportScreen";
import InAppBrowserScreen from "./src/screens/InAppBrowserScreen";
import FeedErrorScreen from "./src/screens/FeedErrorScreen";
import {
  Feed,
  Tag,
  TabParamList,
  RootStackParamList,
  CustomFeedWithMemberCount,
} from "./src/types";
import { fonts, fontSize, spacing } from "./src/theme";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { AppHeader } from "./src/components/AppHeader";
import { HeaderContentProvider } from "./src/context/HeaderContentContext";
import {
  FeedScrollProvider,
  useFeedScrollActions,
  useIsFeedScrolled,
} from "./src/context/FeedScrollContext";
import { BackgroundSyncProvider } from "./src/context/BackgroundSyncContext";
import { BackgroundSyncBannerHost } from "./src/components/BackgroundSyncBannerHost";
import {
  getFeeds,
  getTags,
  getCustomFeedsWithMemberCounts,
} from "./src/database";
import { resolveCustomFeedIcon } from "./src/customFeedIcons";
import { getFeedIconUrl } from "./src/feedIcon";
import {
  initializeNotificationSystem,
  subscribeToNotificationOpens,
} from "./src/notifications";
import {
  installCrashHandler,
  checkForCrashReport,
  clearCrashReport,
  buildGitHubIssueUrl,
} from "./src/crashReporter";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

installCrashHandler();

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

// Height of the bottom tab bar, not counting the bottom safe-area inset.
const TAB_BAR_HEIGHT = 62;

// Width of the left sidebar on web
const WEB_SIDEBAR_WIDTH = 180;

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

const TAB_CONFIG: {
  name: keyof TabParamList;
  icon: FeatherIconName;
  label: string;
}[] = [
  { name: "Feed", icon: "inbox", label: "All Feeds" },
  { name: "Saved", icon: "bookmark", label: "Saved" },
  { name: "ReadLater", icon: "clock", label: "Read Later" },
  { name: "Feeds", icon: "rss", label: "Manage Feeds" },
  { name: "Discover", icon: "compass", label: "Discover" },
  { name: "Settings", icon: "settings", label: "Settings" },
];

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function FeatherTabIcon({
  icon,
  focused,
}: {
  icon: FeatherIconName;
  focused: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Feather
      name={icon}
      size={24}
      color={focused ? colors.ink : colors.inkSoft}
    />
  );
}

function FeedTabIcon({ focused }: { focused: boolean }): React.ReactElement {
  const isFeedScrolled = useIsFeedScrolled();
  // When the user is already on the Feed tab and has scrolled down, the tab
  // button acts as a "scroll to top" shortcut — surface that affordance with
  // an up-arrow icon.
  const icon: FeatherIconName = focused && isFeedScrolled ? "arrow-up" : "list";
  return <FeatherTabIcon icon={icon} focused={focused} />;
}

function FeedTabLabel({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}): React.ReactElement {
  const isFeedScrolled = useIsFeedScrolled();
  return (
    <Text style={[styles.tabLabel, { color }]}>
      {focused && isFeedScrolled ? "To Top" : "Feed"}
    </Text>
  );
}

// Width breakpoint at which the web layout switches to the sidebar
const WEB_BREAKPOINT = 768;

const MAIN_NAV = TAB_CONFIG.filter(({ name }) => name !== "Settings");
const SETTINGS_NAV = TAB_CONFIG.find(
  ({ name }) => name === "Settings"
) as (typeof TAB_CONFIG)[number];

const HIDDEN_TAB_OPTIONS = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: "none" as const },
};

function WebSideNav({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const isFeedScrolled = useIsFeedScrolled();
  const [feeds, setFeeds] = React.useState<Feed[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [customFeeds, setCustomFeeds] = React.useState<
    CustomFeedWithMemberCount[]
  >([]);
  const [failedIconUris, setFailedIconUris] = React.useState<Set<string>>(
    new Set()
  );
  const currentRoute = state.routes[state.index]?.name;
  const feedRoute = state.routes.find((route) => route.name === "Feed");
  const feedRouteParams = (feedRoute?.params ?? {}) as {
    selectedFeedId?: number;
    selectedTagId?: number;
    selectedCustomFeedId?: number;
  };
  const selectedFeedId =
    typeof feedRouteParams.selectedFeedId === "number"
      ? feedRouteParams.selectedFeedId
      : undefined;
  const selectedTagId =
    typeof feedRouteParams.selectedTagId === "number"
      ? feedRouteParams.selectedTagId
      : undefined;
  const selectedCustomFeedId =
    typeof feedRouteParams.selectedCustomFeedId === "number"
      ? feedRouteParams.selectedCustomFeedId
      : undefined;

  const loadData = React.useCallback(async () => {
    try {
      const [feedData, tagData, cfData] = await Promise.all([
        getFeeds(),
        getTags(),
        getCustomFeedsWithMemberCounts(),
      ]);
      setFeeds(feedData);
      setTags(tagData);
      setCustomFeeds(cfData);
    } catch {
      setFeeds([]);
      setTags([]);
      setCustomFeeds([]);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData, currentRoute]);

  const renderItem = (
    { name, icon, label }: (typeof TAB_CONFIG)[number],
    iconSize = 20
  ) => {
    const focused =
      currentRoute === name &&
      !(
        name === "Feed" &&
        (selectedFeedId !== undefined ||
          selectedTagId !== undefined ||
          selectedCustomFeedId !== undefined)
      );
    const showScrollToTop = name === "Feed" && focused && isFeedScrolled;
    const displayIcon: FeatherIconName = showScrollToTop ? "arrow-up" : icon;
    const displayLabel = showScrollToTop ? "To Top" : label;
    return (
      <TouchableOpacity
        key={name}
        style={[
          styles.sidebarItem,
          focused && { backgroundColor: colors.paperWarm },
        ]}
        onPress={() => {
          if (name === "Feed") {
            if (currentRoute === "Feed" && isFeedScrolled) {
              // Acting as "To Top" — scroll the current (possibly scoped)
              // view without resetting the active feed/tag/custom-feed scope.
              navigation.dispatch(
                CommonActions.navigate({
                  name: "Feed",
                  params: { scrollToTop: Date.now() },
                  merge: true,
                })
              );
            } else if (currentRoute === "Feed") {
              navigation.navigate("Feed", { scrollToTop: Date.now() });
            } else {
              navigation.navigate("Feed", {});
            }
            return;
          }
          navigation.navigate(name);
        }}
        activeOpacity={0.7}
      >
        <Feather
          name={displayIcon}
          size={iconSize}
          color={focused ? colors.ink : colors.inkSoft}
        />
        <Text
          style={[
            styles.sidebarLabel,
            { color: focused ? colors.ink : colors.inkSoft },
            focused && { fontWeight: "600" },
          ]}
        >
          {displayLabel}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: colors.paper, borderRightColor: colors.border },
      ]}
    >
      <View style={styles.sidebarMain}>
        <Text style={[styles.sidebarSectionHeader, { color: colors.inkFaint }]}>
          VIEWS
        </Text>
        <View style={styles.sidebarTop}>
          {MAIN_NAV.map((item) => renderItem(item, 16))}
        </View>
        <View style={styles.sidebarFeedSpacer} />
        <View style={styles.sidebarSectionRow}>
          <Text
            style={[styles.sidebarSectionHeader, { color: colors.inkFaint }]}
          >
            CUSTOM FEEDS
          </Text>
          <TouchableOpacity
            style={styles.sidebarSectionAddButton}
            onPress={() =>
              navigation.navigate("CustomFeedEdit", {
                from: currentRoute as string,
              })
            }
            accessibilityLabel="Add custom feed"
            activeOpacity={0.7}
          >
            <Feather name="plus" size={14} color={colors.inkSoft} />
          </TouchableOpacity>
        </View>
        <View style={styles.tagList}>
          {customFeeds.length === 0 ? (
            <Text style={[styles.tagEmpty, { color: colors.inkFaint }]}>
              No custom feeds yet
            </Text>
          ) : (
            customFeeds.map((cf) => {
              const focused =
                currentRoute === "Feed" && selectedCustomFeedId === cf.id;
              return (
                <TouchableOpacity
                  key={cf.id}
                  style={[
                    styles.feedItem,
                    focused && { backgroundColor: colors.paperWarm },
                  ]}
                  onPress={() =>
                    navigation.navigate("Feed", {
                      selectedCustomFeedId: cf.id,
                      selectedCustomFeedName: cf.name,
                    })
                  }
                  onLongPress={() =>
                    navigation.navigate("CustomFeedEdit", {
                      customFeedId: cf.id,
                      from: currentRoute as string,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.feedItemRow}>
                    <Feather
                      name={resolveCustomFeedIcon(cf.icon)}
                      size={12}
                      color={focused ? colors.ink : colors.inkSoft}
                    />
                    <Text
                      style={[
                        styles.feedItemLabel,
                        { color: focused ? colors.ink : colors.inkSoft },
                        focused && { fontWeight: "600" },
                      ]}
                      numberOfLines={1}
                    >
                      {cf.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <View style={styles.sidebarFeedSpacer} />
        <View style={styles.sidebarSectionRow}>
          <Text
            style={[styles.sidebarSectionHeader, { color: colors.inkFaint }]}
          >
            TAGS
          </Text>
          <TouchableOpacity
            style={styles.sidebarSectionAddButton}
            onPress={() =>
              navigation.navigate("TagDetail", {
                from: currentRoute as string,
              })
            }
            accessibilityLabel="Add tag"
            activeOpacity={0.7}
          >
            <Feather name="plus" size={14} color={colors.inkSoft} />
          </TouchableOpacity>
        </View>
        <View style={styles.tagList}>
          {tags.length === 0 ? (
            <Text style={[styles.tagEmpty, { color: colors.inkFaint }]}>
              No tags yet
            </Text>
          ) : (
            tags.map((tag) => {
              const focused =
                currentRoute === "Feed" && selectedTagId === tag.id;
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[
                    styles.feedItem,
                    focused && { backgroundColor: colors.paperWarm },
                  ]}
                  onPress={() =>
                    navigation.navigate("Feed", {
                      selectedTagId: tag.id,
                      selectedTagName: tag.name,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.feedItemRow}>
                    <Feather
                      name="tag"
                      size={12}
                      color={focused ? colors.ink : colors.inkSoft}
                    />
                    <Text
                      style={[
                        styles.feedItemLabel,
                        { color: focused ? colors.ink : colors.inkSoft },
                        focused && { fontWeight: "600" },
                      ]}
                      numberOfLines={1}
                    >
                      {tag.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <View style={styles.sidebarFeedSpacer} />
        <View style={styles.sidebarSectionRow}>
          <Text
            style={[styles.sidebarSectionHeader, { color: colors.inkFaint }]}
          >
            FEEDS
          </Text>
          <TouchableOpacity
            style={styles.sidebarSectionAddButton}
            onPress={() =>
              navigation.navigate("AddFeed", { from: currentRoute as string })
            }
            accessibilityLabel="Add feed"
            activeOpacity={0.7}
          >
            <Feather name="plus" size={14} color={colors.inkSoft} />
          </TouchableOpacity>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.feedList}
        >
          {feeds.map((feed) => {
            const focused =
              currentRoute === "Feed" && selectedFeedId === feed.id;
            const iconUri = getFeedIconUrl(feed.url);
            const showIcon = Boolean(iconUri && !failedIconUris.has(iconUri));
            return (
              <TouchableOpacity
                key={feed.id}
                style={[
                  styles.feedItem,
                  focused && { backgroundColor: colors.paperWarm },
                ]}
                onPress={() =>
                  navigation.navigate("Feed", {
                    selectedFeedId: feed.id,
                    selectedFeedTitle: feed.title,
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.feedItemRow}>
                  {showIcon ? (
                    <Image
                      source={{ uri: iconUri ?? undefined }}
                      style={styles.feedItemIcon}
                      cachePolicy="memory-disk"
                      transition={80}
                      onError={() => {
                        if (!iconUri) {
                          return;
                        }
                        setFailedIconUris((prev) => new Set(prev).add(iconUri));
                      }}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.feedItemLabel,
                      { color: focused ? colors.ink : colors.inkSoft },
                      focused && { fontWeight: "600" },
                    ]}
                    numberOfLines={1}
                  >
                    {feed.title}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.sidebarSettings}>{renderItem(SETTINGS_NAV, 18)}</View>
    </View>
  );
}

function Tabs() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const useSidebar = isWeb && width >= WEB_BREAKPOINT;
  // Read at tabPress time rather than subscribed to: the navigator itself
  // shouldn't re-render every time the feed crosses the "To Top" threshold.
  const { getIsFeedScrolled } = useFeedScrollActions();

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarLabelStyle: styles.tabLabel,
      }}
      tabBar={useSidebar ? () => null : undefined}
      layout={({ state, navigation, children }) => {
        if (useSidebar) {
          return (
            <View style={styles.tabsRoot}>
              <AppHeader />
              <BackgroundSyncBannerHost bottom={spacing.md} />
              <View style={styles.webLayout}>
                <WebSideNav
                  state={state}
                  navigation={navigation}
                  descriptors={{}}
                  insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
                />
                <View style={styles.webContent}>{children}</View>
              </View>
            </View>
          );
        }

        return (
          <View style={styles.tabsRoot}>
            <AppHeader />
            {children}
            {/* Here rather than inside a screen so the status spans every tab:
                a sync started on the Feed tab stays visible after switching to
                Feeds/Discover/Settings and keeps running in the background.
                It floats just above the tab bar instead of taking a row of
                the layout, so it never moves the content under it. */}
            <BackgroundSyncBannerHost
              bottom={TAB_BAR_HEIGHT + insets.bottom + spacing.md}
            />
          </View>
        );
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedListScreen}
        options={{
          tabBarIcon: ({ focused }) => <FeedTabIcon focused={focused} />,
          tabBarLabel: ({ focused, color }) => (
            <FeedTabLabel focused={focused} color={color} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (!navigation.isFocused()) {
              // Coming from another tab — let the default behavior switch tabs
              // without resetting params or scrolling to top.
              return;
            }
            // Already on the Feed tab — suppress the default re-jump either way.
            event.preventDefault();
            if (getIsFeedScrolled()) {
              // Acting as "To Top" — let FeedListScreen's own tabPress
              // listener scroll the current (possibly scoped) view to the
              // top without touching the active feed/tag/custom-feed scope.
              return;
            }
            // Already at the top — reset any active scope back to "All Feeds".
            navigation.dispatch(
              CommonActions.navigate({
                name: "Feed",
                params: {},
                merge: false,
              })
            );
          },
        })}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={
          useSidebar
            ? {
                tabBarIcon: ({ focused }) => (
                  <FeatherTabIcon icon="bookmark" focused={focused} />
                ),
              }
            : HIDDEN_TAB_OPTIONS
        }
      />
      <Tab.Screen
        name="ReadLater"
        component={ReadLaterScreen}
        options={
          useSidebar
            ? {
                tabBarLabel: "Read\u00a0Later",
                tabBarIcon: ({ focused }) => (
                  <FeatherTabIcon icon="clock" focused={focused} />
                ),
              }
            : HIDDEN_TAB_OPTIONS
        }
      />
      <Tab.Screen
        name="Feeds"
        component={FeedsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="rss" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="compass" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * The tabs, with every other screen pushed over them on a native stack.
 *
 * These detail screens used to be hidden tabs. A tab has no transition, never
 * unmounts and has no history: opening a post just swapped the screen in place
 * under a tab bar with nothing selected, a second post opened scrolled to
 * wherever the first was left, a video or web page kept running after "back",
 * and every screen had to work out by hand where back should go. On a stack
 * they slide in over the whole app, pop back to whatever opened them, and are
 * torn down when they leave.
 */
function RootStack() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
      // The tabs draw their own header strip and tab bar (which carries the
      // bottom inset); a pushed screen covers both, so it gets the same
      // header strip and pads itself clear of the system navigation bar.
      screenLayout={({ children, route }) =>
        route.name === "Tabs" ? (
          children
        ) : (
          <View
            style={[
              styles.root,
              {
                backgroundColor: colors.paper,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <AppHeader />
            {children}
          </View>
        )
      }
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="FeedItemView" component={FeedItemScreen} />
      <Stack.Screen name="FeedDetail" component={FeedDetailScreen} />
      <Stack.Screen name="FeedError" component={FeedErrorScreen} />
      <Stack.Screen name="FeedSearch" component={FeedSearchScreen} />
      <Stack.Screen name="AddFeed" component={AddFeedScreen} />
      <Stack.Screen name="TagDetail" component={TagDetailScreen} />
      <Stack.Screen name="CustomFeedEdit" component={CustomFeedEditScreen} />
      <Stack.Screen
        name="CustomFeedManage"
        component={CustomFeedManageScreen}
      />
      <Stack.Screen name="ImportExport" component={ImportExportScreen} />
      <Stack.Screen name="InAppBrowser" component={InAppBrowserScreen} />
    </Stack.Navigator>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();

  React.useEffect(() => {
    checkForCrashReport()
      .then((report) => {
        if (!report) return;
        Alert.alert(
          "App Crashed",
          "The app crashed on the previous launch. Would you like to report it?",
          [
            { text: "Dismiss", onPress: () => clearCrashReport() },
            {
              text: "Report Issue",
              onPress: async () => {
                try {
                  await Linking.openURL(buildGitHubIssueUrl(report));
                } finally {
                  await clearCrashReport();
                }
              },
            },
          ]
        );
      })
      .catch(() => {});

    initializeNotificationSystem().catch(() => {});
    const subscription = subscribeToNotificationOpens((payload) => {
      if (!navigationRef.isReady()) {
        return;
      }
      navigationRef.navigate("FeedItemView", {
        item: {
          itemId: payload.itemId,
          title: payload.title,
          url: payload.url,
          content: payload.content,
          imageUrl: payload.imageUrl,
          publishedAt: payload.publishedAt,
          feedTitle: payload.feedTitle,
          read: payload.read,
          useProxy: payload.useProxy,
          nsfw: payload.nsfw,
        },
      });
    });
    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <RootStack />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <HeaderContentProvider>
            <FeedScrollProvider>
              <BackgroundSyncProvider>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </BackgroundSyncProvider>
            </FeedScrollProvider>
          </HeaderContentProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsRoot: { flex: 1 },
  tabLabel: {
    fontSize: 11,
    fontFamily: fonts.sans,
  },
  // Web-only: row layout with sidebar on left and main content on right
  webLayout: {
    flex: 1,
    flexDirection: "row",
  },
  webContent: {
    flex: 1,
  },
  sidebar: {
    width: WEB_SIDEBAR_WIDTH,
    borderRightWidth: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sidebarMain: {
    flex: 1,
  },
  sidebarTop: {
    gap: spacing.xs,
  },
  sidebarSectionHeader: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  sidebarSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sidebarSectionAddButton: {
    marginLeft: "auto",
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarFeedSpacer: {
    height: spacing.md,
  },
  feedList: {
    gap: 2,
    paddingBottom: spacing.sm,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  feedItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  tagList: {
    gap: 2,
    paddingBottom: spacing.sm,
  },
  tagEmpty: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    fontStyle: "italic",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  feedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  feedItemIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  feedItemLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
  sidebarSettings: {
    marginTop: spacing.md,
  },
  sidebarLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
});
