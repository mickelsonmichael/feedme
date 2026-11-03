import React from "react";
import { Alert, Text, TouchableOpacity } from "react-native";
import renderer, { act } from "react-test-renderer";
import { StoredPostList, type StoredPost } from "./StoredPostList";

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

type Post = StoredPost & { added_at: number };

const POST: Post = {
  id: 10,
  item_id: 5,
  feed_title: "Feed",
  title: "A post",
  url: "https://example.com/a",
  content: "<p>Some <b>bold</b> text</p>",
  published_at: 1,
  added_at: Date.now(),
};

function renderList(
  overrides: Partial<React.ComponentProps<typeof StoredPostList<Post>>> = {}
) {
  const props = {
    icon: "clock" as const,
    scopeLabel: "Read Later",
    emptyTitle: "Nothing here.",
    emptyBody: "Add something.",
    loadErrorMessage: "Failed to load: ",
    removeErrorMessage: "Could not remove.",
    removeAccessibilityLabel: "Remove post",
    load: jest.fn(async () => [POST]),
    remove: jest.fn(async () => {}),
    addedLabel: (post: Post) => `added ${post.id}`,
    toViewItem: (post: Post) => ({
      itemId: post.item_id,
      title: post.title,
      url: post.url,
      content: post.content,
      imageUrl: null,
      publishedAt: post.published_at,
      feedTitle: post.feed_title,
      read: 0,
    }),
    navigation: { navigate: jest.fn() },
    ...overrides,
  };
  let tree: renderer.ReactTestRenderer;
  return {
    props,
    mount: async () => {
      await act(async () => {
        tree = renderer.create(<StoredPostList<Post> {...props} />);
      });
      return tree!;
    },
  };
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat().join(""));

const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.props.accessibilityLabel === label)!;

describe("StoredPostList", () => {
  it("lists the loaded posts with plain-text summaries", async () => {
    const tree = await renderList().mount();

    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        "Viewing: Read Later",
        "A post",
        "Some bold text",
        "added 10",
      ])
    );
  });

  it("shows the empty state when there are no posts", async () => {
    const tree = await renderList({ load: jest.fn(async () => []) }).mount();

    expect(texts(tree)).toEqual(
      expect.arrayContaining(["Nothing here.", "Add something."])
    );
  });

  it("opens the post with the screen's view item", async () => {
    const { props, mount } = renderList();
    const tree = await mount();

    await act(async () => {
      pressable(tree, "Open post: A post").props.onPress();
    });

    expect(props.navigation.navigate).toHaveBeenCalledWith("FeedItemView", {
      item: expect.objectContaining({ itemId: 5, read: 0 }),
    });
  });

  it("removes a post by its item id and drops it from the list", async () => {
    const { props, mount } = renderList();
    const tree = await mount();

    await act(async () => {
      await pressable(tree, "Remove post").props.onPress();
    });

    expect(props.remove).toHaveBeenCalledWith(5);
    expect(texts(tree)).toContain("Nothing here.");
  });

  it("keeps the post and alerts when removing fails", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { mount } = renderList({
      remove: jest.fn(async () => {
        throw new Error("nope");
      }),
    });
    const tree = await mount();

    await act(async () => {
      await pressable(tree, "Remove post").props.onPress();
    });

    expect(alert).toHaveBeenCalledWith("Error", "Could not remove.");
    expect(texts(tree)).toContain("A post");
    alert.mockRestore();
  });
});
