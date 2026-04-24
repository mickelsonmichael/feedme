import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import FeedListScreen from "./src/screens/FeedListScreen";
import AddFeedScreen from "./src/screens/AddFeedScreen";
import FeedItemsScreen from "./src/screens/FeedItemsScreen";
import SavedScreen from "./src/screens/SavedScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ImportExportScreen from "./src/screens/ImportExportScreen";
import { RootStackParamList, TabParamList } from "./src/types";
import { fonts, fontSize } from "./src/theme";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({
  glyph,
  focused,
}: {
  glyph: string;
  focused: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 18,
        color: focused ? colors.ink : colors.inkSoft,
        fontWeight: focused ? "700" : "400",
      }}
    >
      {glyph}
    </Text>
  );
}

function Tabs() {
  const { colors } = useTheme();
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
    >
      <Tab.Screen
        name="Feed"
        component={FeedListScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon glyph="≋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon glyph="❤" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌕" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙" focused={focused} />,
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
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
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
});
