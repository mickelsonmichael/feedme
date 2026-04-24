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
import { RootStackParamList, TabParamList } from "./src/types";
import { colors, fonts, fontSize } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({
  glyph,
  focused,
}: {
  glyph: string;
  focused: boolean;
}): React.ReactElement {
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: styles.tabBar,
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

export default function App() {
  return (
    <View style={styles.root}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            headerTitleStyle: styles.headerTitle,
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
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  headerTitle: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: fontSize.h2,
    color: colors.ink,
  },
  tabBar: {
    backgroundColor: colors.paper,
    borderTopWidth: 1.5,
    borderTopColor: colors.ink,
    height: 62,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: fonts.mono,
  },
});
