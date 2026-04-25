import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FeedListScreen from "./src/screens/FeedListScreen";
import AddFeedScreen from "./src/screens/AddFeedScreen";
import FeedItemsScreen from "./src/screens/FeedItemsScreen";
import SavedScreen from "./src/screens/SavedScreen";
import FeedsScreen from "./src/screens/FeedsScreen";
import FeedDetailScreen from "./src/screens/FeedDetailScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ImportExportScreen from "./src/screens/ImportExportScreen";
import { RootStackParamList, TabParamList } from "./src/types";
import { fonts, fontSize, spacing } from "./src/theme";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Width of the left sidebar on web
const WEB_SIDEBAR_WIDTH = 180;

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

const TAB_CONFIG: {
  name: keyof TabParamList;
  icon: FeatherIconName;
  label: string;
}[] = [
  { name: "Feed", icon: "home", label: "feed" },
  { name: "Saved", icon: "bookmark", label: "saved" },
  { name: "Feeds", icon: "rss", label: "feeds" },
  { name: "Settings", icon: "settings", label: "settings" },
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
      size={20}
      color={focused ? colors.ink : colors.inkSoft}
    />
  );
}

function WebSideNav({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: colors.paper, borderRightColor: colors.ink },
      ]}
    >
      <Text style={[styles.sidebarTitle, { color: colors.ink }]}>FeedMe</Text>
      {TAB_CONFIG.map(({ name, icon, label }, index) => {
        const focused = state.index === index;
        return (
          <TouchableOpacity
            key={name}
            style={[
              styles.sidebarItem,
              focused && { backgroundColor: colors.paperWarm },
            ]}
            onPress={() => navigation.navigate(name)}
            activeOpacity={0.7}
          >
            <Feather
              name={icon}
              size={20}
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
      })}
    </View>
  );
}

function Tabs() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === "web";

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopWidth: 1.5,
          borderTopColor: colors.ink,
          height: 62,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: styles.tabLabel,
      }}
      tabBar={isWeb ? () => null : undefined}
      layout={
        isWeb
          ? ({ state, navigation, children }) => (
              <View style={styles.webLayout}>
                <WebSideNav
                  state={state}
                  navigation={navigation}
                  descriptors={{}}
                  insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
                />
                <View style={styles.webContent}>{children}</View>
              </View>
            )
          : undefined
      }
    >
      <Tab.Screen
        name="Feed"
        component={FeedListScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <FeatherTabIcon icon="bookmark" focused={focused} />
          ),
        }}
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

function AppContent() {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      <NavigationContainer>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            headerTitleStyle: [styles.headerTitle, { color: colors.ink }],
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.paper },
          }}
        >
          <Stack.Screen
            name="Tabs"
            component={Tabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddFeed"
            component={AddFeedScreen}
            options={{ title: "add feed" }}
          />
          <Stack.Screen
            name="FeedItems"
            component={FeedItemsScreen}
            options={{ title: "" }}
          />
          <Stack.Screen
            name="FeedDetail"
            component={FeedDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ImportExport"
            component={ImportExportScreen}
            options={{ title: "import / export" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: fontSize.h2,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: fonts.mono,
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
    borderRightWidth: 1.5,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  sidebarTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.h2,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
  },
  sidebarLabel: {
    fontFamily: fonts.mono,
    fontSize: fontSize.bodyLg,
  },
});
