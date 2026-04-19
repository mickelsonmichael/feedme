import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import FeedListScreen from "./src/screens/FeedListScreen";
import AddFeedScreen from "./src/screens/AddFeedScreen";
import FeedItemsScreen from "./src/screens/FeedItemsScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#4A90E2" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen
          name="FeedList"
          component={FeedListScreen}
          options={{ title: "feedme" }}
        />
        <Stack.Screen
          name="AddFeed"
          component={AddFeedScreen}
          options={{ title: "Add Feed" }}
        />
        <Stack.Screen
          name="FeedItems"
          component={FeedItemsScreen}
          options={{ title: "Feed" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
