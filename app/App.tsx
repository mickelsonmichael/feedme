import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { CommonActions, NavigationContainer } from "@react-navigation/native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import FeedListScreen from "./src/screens/FeedListScreen";
import AddFeedScreen from "./src/screens/AddFeedScreen";
import FeedItemsScreen from "./src/screens/FeedItemsScreen";
import FeedItemScreen from "./src/screens/FeedItemScreen";
import SavedScreen from "./src/screens/SavedScreen";
import ReadLaterScreen from "./src/screens/ReadLaterScreen";
import FeedsScreen from "./src/screens/FeedsScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import FeedSearchScreen from "./src/screens/FeedSearchScreen";
import FeedDetailScreen from "./src/screens/FeedDetailScreen";
import TagDetailScreen from "./src/screens/TagDetailScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ImportExportScreen from "./src/screens/ImportExportScreen";
import InAppBrowserScreen from "./src/screens/InAppBrowserScreen";
import { Feed, Tag, TabParamList } from "./src/types";
import { fonts, fontSize, spacing } from "./src/theme";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { AppHeader } from "./src/components/AppHeader";
import { HeaderContentProvider } from "./src/context/HeaderContentContext";
import { getFeeds, getTags } from "./src/database";
import { getFeedIconUrl } from "./src/feedIcon";

const Tab = createBottomTabNavigator<TabParamList>();

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
  const [feeds, setFeeds] = React.useState<Feed[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [failedIconUris, setFailedIconUris] = React.useState<Set<string>>(
    new Set()
  );
  const currentRoute = state.routes[state.index]?.name;
  const feedRoute = state.routes.find((route) => route.name === "Feed");
  const feedRouteParams = (feedRoute?.params ?? {}) as {
    selectedFeedId?: number;
    selectedTagId?: number;
  };
  const selectedFeedId =
    typeof feedRouteParams.selectedFeedId === "number"
      ? feedRouteParams.selectedFeedId
      : undefined;
  const selectedTagId =
    typeof feedRouteParams.selectedTagId === "number"
      ? feedRouteParams.selectedTagId
      : undefined;

  const loadData = React.useCallback(async () => {
    try {
      const [feedData, tagData] = await Promise.all([getFeeds(), getTags()]);
      setFeeds(feedData);
      setTags(tagData);
    } catch {
      setFeeds([]);
      setTags([]);
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
        (selectedFeedId !== undefined || selectedTagId !== undefined)
      );
    return (
      <TouchableOpacity
        key={name}
        style={[
          styles.sidebarItem,
          focused && { backgroundColor: colors.paperWarm },
        ]}
        onPress={() => {
          if (name === "Feed") {
            if (currentRoute === "Feed" && selectedFeedId === undefined) {
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
          name={icon}
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
          {label}
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

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
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
          </View>
        );
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="list" focused={focused} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
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
      <Tab.Screen
        name="FeedSearch"
        component={FeedSearchScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="AddFeed"
        component={AddFeedScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="FeedItems"
        component={FeedItemsScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="FeedItemView"
        component={FeedItemScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="FeedDetail"
        component={FeedDetailScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="TagDetail"
        component={TagDetailScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="ImportExport"
        component={ImportExportScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="InAppBrowser"
        component={InAppBrowserScreen}
        options={HIDDEN_TAB_OPTIONS}
      />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <NavigationContainer>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Tabs />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <HeaderContentProvider>
          <AppContent />
        </HeaderContentProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsRoot: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.h2,
  },
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
