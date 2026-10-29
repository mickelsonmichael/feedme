import React from "react";
import { RefreshControl } from "react-native";
import { animatedTranslateX } from "../testUtils/animatedTranslateX";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import renderer, { act } from "react-test-renderer";
import {
  SingleViewPager,
  SingleViewPagerHandle,
  SINGLE_VIEW_WINDOW,
} from "./SingleViewPager";
import { FeedItemWithFeed } from "../types";

const VIEWPORT = 400;

// Records every mount so the tests can prove the pager moves already-painted
// content rather than rebuilding it, and every render so they can prove the
// screen above it can re-render without touching the posts.
const mounts: number[] = [];
const renders: number[] = [];

jest.mock("./SingleViewPost", () => {
  const ReactActual = require("react");
  return {
    SingleViewPost: ReactActual.forwardRef(function SingleViewPostStub(
      props: {
        item: { itemId: number };
        isActive: boolean;
        isLive: boolean;
        refreshControl?: unknown;
      },
      ref: React.Ref<unknown>
    ) {
      renders.push(props.item.itemId);
      ReactActual.useEffect(() => {
        mounts.push(props.item.itemId);
      }, []);
      ReactActual.useImperativeHandle(ref, () => ({
        endViewTimeForNext: jest.fn(),
        scrollToTop: jest.fn(),
      }));
      return ReactActual.createElement("SingleViewPostStub", {
        itemId: props.item.itemId,
        isActive: props.isActive,
        isLive: props.isLive,
        hasRefreshControl: props.refreshControl != null,
      });
    }),
  };
});

function makeItems(count: number): FeedItemWithFeed[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: 100 + i,
        feed_id: 1,
        feed_title: "Alpha",
        title: `Post ${100 + i}`,
        url: `https://alpha.example/${100 + i}`,
        content: "body",
        image_url: null,
        published_at: 1_000 - i,
        read: 0,
      }) as FeedItemWithFeed
  );
}

const buildViewItem = (item: FeedItemWithFeed) => ({
  itemId: item.id,
  title: item.title,
  url: item.url,
  content: item.content,
  imageUrl: item.image_url,
  publishedAt: item.published_at,
  feedTitle: item.feed_title,
  feedUrl: null,
  read: item.read,
  useProxy: false,
  nsfw: false,
});

function renderPager(
  overrides: Partial<React.ComponentProps<typeof SingleViewPager>> = {},
  ref?: React.Ref<SingleViewPagerHandle>
) {
  const props: React.ComponentProps<typeof SingleViewPager> = {
    items: makeItems(8),
    activeIndex: 0,
    viewportWidth: VIEWPORT,
    bionicReading: false,
    buildViewItem,
    onAdvance: jest.fn(),
    onEdgeForward: jest.fn(),
    onOpenContentLink: jest.fn(),
    onScroll: jest.fn(),
    refreshControl: <RefreshControl refreshing={false} onRefresh={jest.fn()} />,
    ...overrides,
  };
  return {
    props,
    element: (
      <GestureHandlerRootView>
        <SingleViewPager ref={ref} {...props} />
      </GestureHandlerRootView>
    ),
  };
}

function getTranslateX(tree: renderer.ReactTestRenderer): number {
  return animatedTranslateX(tree.root.findByType(GestureDetector));
}

/** The `left` each mounted post is laid out at, keyed by post id. */
function slotOffsets(tree: renderer.ReactTestRenderer): Map<number, number> {
  const offsets = new Map<number, number>();
  for (const stub of tree.root.findAllByType("SingleViewPostStub" as never)) {
    let node: renderer.ReactTestInstance | null = stub.parent;
    while (node) {
      const style = node.props?.style;
      const left = Array.isArray(style)
        ? style.find((s) => s && typeof s.left === "number")?.left
        : undefined;
      if (typeof left === "number") {
        offsets.set((stub.props as { itemId: number }).itemId, left);
        break;
      }
      node = node.parent;
    }
  }
  return offsets;
}

function mountedIds(tree: renderer.ReactTestRenderer): number[] {
  return tree.root
    .findAllByType("SingleViewPostStub" as never)
    .map((stub) => (stub.props as { itemId: number }).itemId)
    .sort((a, b) => a - b);
}

type TouchGesture = {
  config: { activeOffsetXStart: number; activeOffsetXEnd: number };
  handlers: {
    onTouchesDown: (event: unknown) => void;
    onTouchesMove: (event: unknown) => void;
    onFinalize: () => void;
  };
};

const touchAt = (x: number, y: number) => ({
  allTouches: [{ absoluteX: x, absoluteY: y }],
});

const readGesture = (tree: renderer.ReactTestRenderer) =>
  tree.root.findByType(GestureDetector).props.gesture as TouchGesture;

/** How far the finger must travel sideways before the pager takes the touch. */
const activationDistance = (tree: renderer.ReactTestRenderer) =>
  readGesture(tree).config.activeOffsetXEnd;

describe("SingleViewPager", () => {
  beforeEach(() => {
    mounts.length = 0;
    renders.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("keeps a window of posts mounted either side of the active one", () => {
    // Arrange / Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(renderPager({ activeIndex: 4 }).element);
    });

    // Assert — the neighbours the user is about to swipe into are already
    // mounted, which is the whole point: no mount lands on the commit frame.
    expect(mountedIds(tree!)).toEqual([102, 103, 104, 105, 106]);
    expect(SINGLE_VIEW_WINDOW).toBe(2);
  });

  it("gives every post a permanent absolute position, so advancing moves only the track", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(renderPager({ activeIndex: 3 }).element);
    });
    const offsetsBefore = slotOffsets(tree!);
    expect(offsetsBefore.get(103)).toBe(3 * VIEWPORT);
    expect(getTranslateX(tree!)).toBe(-3 * VIEWPORT);

    // Act — the active post moves on. The track picks up its new position
    // on the next animation frame.
    act(() => {
      tree!.update(renderPager({ activeIndex: 4 }).element);
      jest.advanceTimersByTime(16);
    });

    // Assert — every post that was already mounted is still laid out at
    // exactly the same offset. Nothing was re-laid-out; only the track's
    // transform changed. This is what the old relative window could not do:
    // there, every slot's `left` changed on every advance and had to be
    // cancelled out by a simultaneous translateX correction.
    const offsetsAfter = slotOffsets(tree!);
    for (const [id, left] of offsetsBefore) {
      if (offsetsAfter.has(id)) expect(offsetsAfter.get(id)).toBe(left);
    }
    expect(getTranslateX(tree!)).toBe(-4 * VIEWPORT);
  });

  it("does not remount a neighbour when it becomes the active post", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(renderPager({ activeIndex: 2 }).element);
    });
    expect(mounts).toContain(103);
    const mountsBefore = [...mounts];

    // Act
    act(() => {
      tree!.update(renderPager({ activeIndex: 3 }).element);
    });

    // Assert — post 103 was already mounted and stays mounted; only the
    // newly-windowed post 105 is built.
    expect(mounts).toEqual([...mountsBefore, 105]);
  });

  it("lands the slide on the new post before committing it, so the commit changes nothing on screen", () => {
    // Arrange
    const onAdvance = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        renderPager({ activeIndex: 2, onAdvance }).element
      );
    });
    const gesture = tree!.root.findByType(GestureDetector).props.gesture as {
      handlers: {
        onBegin: () => void;
        onUpdate: (e: unknown) => void;
        onEnd: (e: unknown) => void;
      };
    };

    // Act — a decisive forward swipe.
    act(() => {
      gesture.handlers.onBegin();
      gesture.handlers.onUpdate({ translationX: -200, translationY: 0 });
      gesture.handlers.onEnd({
        translationX: -200,
        translationY: 0,
        velocityX: -900,
      });
    });
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    // Assert — the advance is only committed once the slide has finished,
    // and the slide has come to rest on the new active post's position.
    expect(onAdvance).toHaveBeenCalledWith(1);
    const slideTarget = getTranslateX(tree!);
    expect(slideTarget).toBe(-3 * VIEWPORT);

    const offsetsBefore = slotOffsets(tree!);

    // Act — the parent commits the new active post.
    act(() => {
      tree!.update(renderPager({ activeIndex: 3, onAdvance }).element);
    });

    // Assert — the commit parks the track at the exact position the slide
    // already reached, and every post is still laid out where it was. So the
    // commit changes nothing on screen: it is a no-op by construction, not
    // by two sources of position being kept in agreement.
    expect(getTranslateX(tree!)).toBe(slideTarget);
    const offsetsAfter = slotOffsets(tree!);
    for (const [id, left] of offsetsBefore) {
      if (offsetsAfter.has(id)) expect(offsetsAfter.get(id)).toBe(left);
    }
  });

  it("asks the parent to page in more posts instead of advancing past the last one", () => {
    // Arrange
    const onAdvance = jest.fn();
    const onEdgeForward = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        renderPager({
          items: makeItems(3),
          activeIndex: 2,
          onAdvance,
          onEdgeForward,
        }).element
      );
    });
    const gesture = tree!.root.findByType(GestureDetector).props.gesture as {
      handlers: {
        onBegin: () => void;
        onEnd: (e: unknown) => void;
      };
    };

    // Act
    act(() => {
      gesture.handlers.onBegin();
      gesture.handlers.onEnd({
        translationX: -200,
        translationY: 0,
        velocityX: -900,
      });
    });
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    // Assert
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onEdgeForward).toHaveBeenCalledTimes(1);
  });

  it("holds heavy embeds back until the pager has settled on a post", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(renderPager({ activeIndex: 2 }).element);
    });
    const liveIds = () =>
      tree!.root
        .findAllByType("SingleViewPostStub" as never)
        .filter((stub) => (stub.props as { isLive: boolean }).isLive)
        .map((stub) => (stub.props as { itemId: number }).itemId);

    // Assert — at rest, exactly the active post is live.
    expect(liveIds()).toEqual([102]);

    // Act — start dragging.
    const gesture = tree!.root.findByType(GestureDetector).props.gesture as {
      handlers: { onBegin: () => void; onUpdate: (e: unknown) => void };
    };
    act(() => {
      gesture.handlers.onBegin();
      gesture.handlers.onUpdate({ translationX: -60, translationY: 0 });
    });

    // Assert — merely touching the screen must not tear down the player the
    // user is already watching.
    expect(liveIds()).toEqual([102]);
  });

  it("gives every mounted post a refresh control, so promoting one never restructures its scroll view", () => {
    // Arrange / Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(renderPager({ activeIndex: 4 }).element);
    });

    // Assert — on Android a ScrollView renders *inside* its refreshControl
    // when it has one and at the top level when it doesn't, so handing the
    // control only to the active slot changes the tree shape of two posts on
    // every swipe and remounts both entire articles. Every slot gets one.
    const flags = tree!.root
      .findAllByType("SingleViewPostStub" as never)
      .map(
        (stub) =>
          (stub.props as { hasRefreshControl: boolean }).hasRefreshControl
      );
    expect(flags).toHaveLength(2 * SINGLE_VIEW_WINDOW + 1);
    expect(flags.every(Boolean)).toBe(true);
  });

  it("does not re-render mounted posts when the screen above it re-renders", () => {
    // Arrange — one fixed props object, as a memoised parent would hand over
    // on a render where nothing relevant to the reader changed.
    const { element } = renderPager({ activeIndex: 2 });
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(element);
    });
    renders.length = 0;

    // Act — the screen re-renders for its own reasons (refresh progress
    // ticks once per feed during a sync, for one).
    act(() => {
      tree!.update(element);
    });

    // Assert — nothing in the reader re-rendered. Without this, every one of
    // those ticks re-parsed and re-laid-out every mounted article.
    expect(renders).toEqual([]);
  });

  it("advances through the imperative handle for the toolbar buttons", () => {
    // Arrange
    const onAdvance = jest.fn();
    const ref = React.createRef<SingleViewPagerHandle>();
    act(() => {
      renderer.create(renderPager({ activeIndex: 2, onAdvance }, ref).element);
    });

    // Act
    act(() => {
      ref.current?.advance(1);
    });

    // Assert — no animation for a button press, so it commits immediately.
    expect(onAdvance).toHaveBeenCalledWith(1);
  });

  // Android starts a text selection in the selectable article body once a
  // press has sat still for its long-press timeout, and draws the magnifier
  // and handles as a native popup React cannot dismiss. If the pager swiped on
  // that same touch, the popup was left stranded over the next post.
  describe("standing down for a text selection", () => {
    it("keeps the swipe reachable for a press that has not dwelled", () => {
      // Arrange / Act
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(200);
      });

      // Assert
      expect(activationDistance(tree!)).toBe(20);
    });

    it("puts the swipe out of reach once the press has dwelled long enough to select text", () => {
      // Arrange
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });

      // Act — finger down and still, past Android's long-press timeout.
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(600);
      });

      // Assert — the decision is already made before any drag can race it.
      expect(activationDistance(tree!)).toBeGreaterThan(1_000);
    });

    it("leaves the swipe reachable when the finger left the press point before the timeout", () => {
      // Arrange — moving off the press point cancels the platform's pending
      // long press, so no selection can start however long the drag then
      // takes. A slow, deliberate swipe must still work.
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });

      // Act
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(100);
        readGesture(tree!).handlers.onTouchesMove(touchAt(288, 400));
        jest.advanceTimersByTime(900);
      });

      // Assert
      expect(activationDistance(tree!)).toBe(20);
    });

    it("ignores a tremor smaller than the platform's touch slop", () => {
      // Arrange — a couple of pixels of drift is still a press held still, and
      // still selects text.
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });

      // Act
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(100);
        readGesture(tree!).handlers.onTouchesMove(touchAt(303, 402));
        jest.advanceTimersByTime(500);
      });

      // Assert
      expect(activationDistance(tree!)).toBeGreaterThan(1_000);
    });

    it("re-arms itself when the touch ends, so the next swipe works", () => {
      // Arrange
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });

      // Act — a dwell that took the touch, then the finger lifts.
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(600);
      });
      expect(activationDistance(tree!)).toBeGreaterThan(1_000);
      act(() => {
        readGesture(tree!).handlers.onFinalize();
        // The touch ending is reported back to JS as scheduled work.
        jest.advanceTimersByTime(0);
      });

      // Assert — standing down lasts for the one touch, not for the session.
      expect(activationDistance(tree!)).toBe(20);
    });

    it("does not stand down for a press that ends before the timeout", () => {
      // Arrange
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(renderPager({ activeIndex: 2 }).element);
      });

      // Act — a tap: down and up well inside the long-press window.
      act(() => {
        readGesture(tree!).handlers.onTouchesDown(touchAt(300, 400));
        jest.advanceTimersByTime(120);
        readGesture(tree!).handlers.onFinalize();
        jest.advanceTimersByTime(1_000);
      });

      // Assert — the disarmed watch must not fire late and block a later swipe.
      expect(activationDistance(tree!)).toBe(20);
    });
  });
});
