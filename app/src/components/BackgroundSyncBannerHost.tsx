import React from "react";

import { useBackgroundSync } from "../context/BackgroundSyncContext";
import { BackgroundSyncBanner } from "./LoadingState";

/**
 * Renders the background-sync banner from navigator-level state.
 *
 * Mounted once in the tab navigator's layout rather than inside FeedListScreen,
 * so an in-flight sync stays visible after switching to Feeds, Discover or
 * Settings. The Feed screen remains the only writer of the state.
 */
export function BackgroundSyncBannerHost() {
  const { syncing, progress } = useBackgroundSync();
  if (!syncing) return null;
  return <BackgroundSyncBanner progress={progress} />;
}
