import React from "react";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSavedPosts, unsavePost } from "../database";
import { RootStackParamList, SavedPost, TabParamList } from "../types";
import { StoredPostList, addedAgo } from "../components/StoredPostList";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Saved">,
  NativeStackScreenProps<RootStackParamList>
>;

const toViewItem = (post: SavedPost) => ({
  itemId: post.item_id,
  title: post.title,
  url: post.url,
  content: post.content,
  imageUrl: null,
  publishedAt: post.published_at,
  feedTitle: post.feed_title,
  read: 1,
});

const addedLabel = (post: SavedPost) => addedAgo("saved", post.saved_at);

export default function SavedScreen({ navigation }: Props) {
  return (
    <StoredPostList
      icon="bookmark"
      scopeLabel="Saved"
      emptyTitle="No saved posts yet."
      emptyBody="Tap the bookmark icon on any post to keep it here forever."
      loadErrorMessage="Failed to load saved posts: "
      removeErrorMessage="Could not remove saved post."
      removeAccessibilityLabel="Remove saved post"
      load={getSavedPosts}
      remove={unsavePost}
      addedLabel={addedLabel}
      toViewItem={toViewItem}
      navigation={navigation}
    />
  );
}
