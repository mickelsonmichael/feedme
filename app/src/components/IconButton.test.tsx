import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  function render(props: Partial<React.ComponentProps<typeof IconButton>>) {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <IconButton
          onPress={jest.fn()}
          accessibilityLabel="Save post"
          {...props}
        >
          <Text>icon</Text>
        </IconButton>
      );
    });
    // Pressable is wrapped in RN 0.88, so find it by the props it receives.
    return tree.root.find((node) => node.props.android_ripple !== undefined);
  }

  it("answers a press with the platform ripple, as a labelled button", () => {
    // Arrange / Act
    const button = render({});

    // Assert
    expect(button.props.android_ripple).toEqual(
      expect.objectContaining({ borderless: true })
    );
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Save post");
  });

  it("calls onPress when pressed", () => {
    // Arrange
    const onPress = jest.fn();
    const button = render({ onPress });

    // Act
    act(() => {
      button.props.onPress();
    });

    // Assert
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("reports itself disabled to accessibility when disabled", () => {
    // Arrange / Act
    const button = render({ disabled: true });

    // Assert
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
  });
});
