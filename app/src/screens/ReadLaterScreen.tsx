import React from "react";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getReadLaterPosts, removeFromReadLater } from "../database";
import { ReadLaterPost, RootStackParamList, TabParamList } from "../types";
import { StoredPostList, addedAgo } from "../components/StoredPostList";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "ReadLater">,
  NativeStackScreenProps<RootStackParamList>
>;

// Opened with read=0 so the item gets marked read on entry, which (via
// markItemRead) auto-removes it from the Read Later list.
const toViewItem = (post: ReadLaterPost) => ({
  itemId: post.item_id,
  title: post.title,
  url: post.url,
  content: post.content,
  imageUrl: post.image_url,
  publishedAt: post.published_at,
  feedTitle: post.feed_title,
  read: 0,
});

const addedLabel = (post: ReadLaterPost) => addedAgo("added", post.added_at);

export default function ReadLaterScreen({ navigation }: Props) {
  return (
    <StoredPostList
      icon="clock"
      scopeLabel="Read Later"
      emptyTitle="Nothing to read later."
      emptyBody="Tap the clock icon on any post to add it here. Items disappear once you've read them."
      loadErrorMessage="Failed to load read later list: "
      removeErrorMessage="Could not remove read later item."
      removeAccessibilityLabel="Remove from read later"
      load={getReadLaterPosts}
      remove={removeFromReadLater}
      addedLabel={addedLabel}
      toViewItem={toViewItem}
      navigation={navigation}
    />
  );
}
