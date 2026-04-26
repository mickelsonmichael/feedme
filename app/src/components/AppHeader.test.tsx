import React from "react";
import { Platform, Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { AppHeader } from "./AppHeader";
import {
  HeaderContentProvider,
  useHeaderContent,
} from "../context/HeaderContentContext";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "#faf8f3",
      border: "#d9d1c4",
      ink: "#1e1a3a",
    },
  }),
}));

describe("AppHeader", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("renders injected header content on web", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });

    function HeaderContentFixture() {
      const { setHeaderContent } = useHeaderContent();

      React.useLayoutEffect(() => {
        setHeaderContent(<Text>Search slot</Text>);
      }, [setHeaderContent]);

      return <AppHeader />;
    }

    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <HeaderContentProvider>
          <HeaderContentFixture />
        </HeaderContentProvider>
      );
    });

    expect(
      tree!.root
        .findAllByType(Text)
        .some((node) => node.props.children === "Search slot")
    ).toBe(true);

    expect(
      tree!.root.findByProps({ testID: "app-header-content" }).props.style
    ).toMatchObject({
      maxWidth: 440,
      marginLeft: "auto",
    });

    act(() => {
      tree!.unmount();
    });
  });
});
