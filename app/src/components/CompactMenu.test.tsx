import React from "react";
import renderer, { act } from "react-test-renderer";
import { CompactMenu } from "./CompactMenu";

jest.mock("@react-native-vector-icons/feather", () => ({
  Feather: "Feather",
}));

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;

function renderMenu(onChange = jest.fn()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <CompactMenu
        value="all"
        options={[...OPTIONS]}
        onChange={onChange}
        accessibilityLabel="Filter posts"
      />
    );
  });
  return tree;
}

// The element carrying `onPress`, not the host view under it that shares the
// accessibility label.
const press = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .find(
      (node) =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function"
    )
    .props.onPress();

const menuItems = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityRole === "menuitem");

describe("CompactMenu", () => {
  it("opens its options from the trigger, animating in", () => {
    // Arrange
    const tree = renderMenu();
    expect(menuItems(tree)).toHaveLength(0);

    // Act
    act(() => {
      press(tree, "Filter posts");
    });

    // Assert
    expect(menuItems(tree).length).toBeGreaterThan(0);
    const menu = tree.root.find((node) => node.props.entering !== undefined);
    expect(menu.props.exiting).toBeDefined();
  });

  it("reports the chosen option and closes", () => {
    // Arrange
    const onChange = jest.fn();
    const tree = renderMenu(onChange);
    act(() => {
      press(tree, "Filter posts");
    });

    // Act
    act(() => {
      tree.root
        .findAll(
          (node) =>
            node.props.accessibilityRole === "menuitem" &&
            node.props.accessibilityLabel === "Unread"
        )[0]
        .props.onPress();
    });

    // Assert
    expect(onChange).toHaveBeenCalledWith("unread");
    expect(menuItems(tree)).toHaveLength(0);
  });

  it("closes without a choice when tapping outside", () => {
    // Arrange
    const onChange = jest.fn();
    const tree = renderMenu(onChange);
    act(() => {
      press(tree, "Filter posts");
    });

    // Act
    act(() => {
      press(tree, "Dismiss menu");
    });

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(menuItems(tree)).toHaveLength(0);
  });
});
