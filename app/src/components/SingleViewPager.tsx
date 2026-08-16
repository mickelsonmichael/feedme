import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
  StyleSheet,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { FeedItemWithFeed } from "../types";
import { resolveSingleSwipeDirection } from "../singleSwipeDirection";
import { SingleViewPost, SingleViewPostHandle } from "./SingleViewPost";
import { FeedItemContentItem } from "./FeedItemContent";

export const SINGLE_SWIPE_ENTER_DURATION_MS = 240;

// How many posts either side of the active one stay mounted.
//
// Two, not one: at one, the slot the user is about to swipe into only mounts
// on the frame the *previous* swipe commits, so its HTML parse and image
// decode land exactly when the animation ends — which is the "it reloads when
// you finish the swipe" jank. At two, that mount happens a whole swipe early,
// while the user is still reading, and swiping back costs no more than
// swiping forward.
export const SINGLE_VIEW_WINDOW = 2;

export type SingleViewPagerHandle = {
  /** Move one post forward/back, as the toolbar buttons do (no animation). */
  advance: (direction: 1 | -1) => void;
  /** Scroll the active post back to the top, leaving the position alone. */
  scrollToTop: () => void;
};

type Props = {
  /** The reading sequence. Append-only for the life of a scope: this pager
   *  positions posts by their absolute index, so anything that reorders or
   *  removes entries moves content under the reader. */
  items: FeedItemWithFeed[];
  activeIndex: number;
  viewportWidth: number;
  bionicReading: boolean;
  buildViewItem: (item: FeedItemWithFeed) => FeedItemContentItem;
  /** A move within the loaded sequence succeeded — commit the new active
   *  post. Called *after* the slide animation has already landed on it. */
  onAdvance: (direction: 1 | -1) => void;
  /** Forward move requested past the last loaded post. */
  onEdgeForward: () => void;
  onOpenContentLink: (url: string) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshControl: React.ReactElement<RefreshControlProps>;
};

/**
 * The single-post reader's swipe pager.
 *
 * Every post gets a permanent absolute position — post `i` lives at
 * `left: i * viewportWidth` and never moves for as long as the sequence
 * lasts. Navigating is therefore *only* a change of the track's translateX;
 * no slot is re-laid-out, no key changes position in the children array, and
 * nothing needs re-synchronising after the fact.
 *
 * That is what makes the commit invisible: the slide animation finishes at
 * exactly `-newIndex * viewportWidth`, and the React state update that
 * follows re-runs the layout effect below with that same number. It is a
 * no-op by construction, rather than two sources of position that have to be
 * kept in agreement frame by frame.
 */
export const SingleViewPager = memo(
  forwardRef<SingleViewPagerHandle, Props>(function SingleViewPager(
    {
      items,
      activeIndex,
      viewportWidth,
      bionicReading,
      buildViewItem,
      onAdvance,
      onEdgeForward,
      onOpenContentLink,
      onScroll,
      refreshControl,
    },
    ref
  ) {
    const translateX = useRef(
      new Animated.Value(-activeIndex * viewportWidth)
    ).current;
    const activePostRef = useRef<SingleViewPostHandle | null>(null);

    // Mirrors of values the gesture callbacks read, so the Gesture.Pan object
    // never has to be rebuilt as the user reads. Handing GestureDetector a
    // brand-new gesture while the previous one is still settling produced
    // skipped and duplicated advances.
    const activeIndexRef = useRef(activeIndex);
    activeIndexRef.current = activeIndex;
    const itemsLengthRef = useRef(items.length);
    itemsLengthRef.current = items.length;
    const viewportWidthRef = useRef(viewportWidth);
    viewportWidthRef.current = viewportWidth;
    const onAdvanceRef = useRef(onAdvance);
    onAdvanceRef.current = onAdvance;
    const onEdgeForwardRef = useRef(onEdgeForward);
    onEdgeForwardRef.current = onEdgeForward;

    // Whether the pager is at rest. Drives `isLive` below; deliberately *not*
    // used to tear anything down, only to hold new things back.
    const [isSettled, setIsSettled] = useState(true);

    const restingX = useCallback(
      (index: number) => -index * viewportWidthRef.current,
      []
    );

    // Slides to `edge`, then commits. Only on a clean finish: if the user
    // starts another swipe before this one settles, onBegin's stopAnimation
    // interrupts it (`finished: false`) and the pending advance is dropped.
    // Committing an interrupted slide lands the change right as the new
    // gesture begins, snapping the content forward a full post mid-touch —
    // far more jarring than simply letting the new gesture take over from
    // wherever the old one got to.
    const slideTo = useCallback(
      (edge: number, onComplete: () => void) => {
        setIsSettled(false);
        Animated.timing(translateX, {
          toValue: edge,
          duration: SINGLE_SWIPE_ENTER_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setIsSettled(true);
            onComplete();
          }
        });
      },
      [translateX]
    );

    const snapBack = useCallback(() => {
      Animated.spring(translateX, {
        toValue: restingX(activeIndexRef.current),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setIsSettled(true);
      });
    }, [restingX, translateX]);

    const beginAdvance = useCallback(
      (direction: 1 | -1, animated: boolean) => {
        if (direction === 1) {
          // End the view-time row for the post being left — only on an
          // explicit forward move. Going back leaves it open (see
          // SingleViewPost).
          activePostRef.current?.endViewTimeForNext();
        }

        const index = activeIndexRef.current;
        const canAdvance =
          direction === 1 ? index < itemsLengthRef.current - 1 : index > 0;

        if (canAdvance) {
          if (animated) {
            slideTo(restingX(index + direction), () =>
              onAdvanceRef.current(direction)
            );
          } else {
            onAdvanceRef.current(direction);
          }
          return;
        }

        if (direction === 1) {
          // Nothing loaded to move into — let the parent decide whether to
          // page in more, and put the track back where it was meanwhile.
          if (animated) snapBack();
          onEdgeForwardRef.current();
          return;
        }

        if (animated) snapBack();
      },
      [restingX, slideTo, snapBack]
    );

    useImperativeHandle(
      ref,
      () => ({
        advance: (direction: 1 | -1) => beginAdvance(direction, false),
        scrollToTop: () => activePostRef.current?.scrollToTop(),
      }),
      [beginAdvance]
    );

    // Park the track at the active post's resting position. After a swipe
    // this is the position the animation already reached, so it changes
    // nothing on screen; after a toolbar tap (no animation) it is the jump
    // itself. Also covers viewport resizes such as rotation.
    useLayoutEffect(() => {
      translateX.setValue(-activeIndex * viewportWidth);
    }, [activeIndex, viewportWidth, translateX]);

    const gestureBaseXRef = useRef(0);
    const gesture = useMemo(
      () =>
        Gesture.Pan()
          .activeOffsetX([-20, 20])
          .failOffsetY([-10, 10])
          .onBegin(() => {
            translateX.stopAnimation();
            gestureBaseXRef.current = restingX(activeIndexRef.current);
          })
          .onUpdate((e) => {
            translateX.setValue(gestureBaseXRef.current + e.translationX);
          })
          .onEnd((e) => {
            const direction = resolveSingleSwipeDirection(
              e.translationX,
              e.translationY,
              e.velocityX
            );
            if (direction === "next") {
              beginAdvance(1, true);
            } else if (direction === "previous") {
              beginAdvance(-1, true);
            } else {
              snapBack();
            }
          }),
      [beginAdvance, restingX, snapBack, translateX]
    );

    const activeItemId = items[activeIndex]?.id ?? null;

    // Heavy embeds (YouTube/GIF WebViews) and view-time tracking upgrade only
    // once the pager has come to rest on a post — never mid-slide, which
    // would mount a WebView during the animation. Sticky by design: it only
    // ever moves *to* the settled post, so merely touching the screen can't
    // tear down the player the user is watching.
    const [liveItemId, setLiveItemId] = useState<number | null>(activeItemId);
    useEffect(() => {
      if (!isSettled || activeItemId === null) return;
      setLiveItemId(activeItemId);
    }, [isSettled, activeItemId]);

    const windowStart = Math.max(0, activeIndex - SINGLE_VIEW_WINDOW);
    const windowEnd = Math.min(
      items.length - 1,
      activeIndex + SINGLE_VIEW_WINDOW
    );
    const slots: { item: FeedItemWithFeed; index: number }[] = [];
    for (let index = windowStart; index <= windowEnd; index += 1) {
      slots.push({ item: items[index], index });
    }

    return (
      <View style={styles.viewport}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              styles.track,
              {
                width: Math.max(1, items.length) * viewportWidth,
                transform: [{ translateX }],
              },
            ]}
          >
            {slots.map(({ item, index }) => (
              <View
                key={item.id}
                style={[
                  styles.slot,
                  { width: viewportWidth, left: index * viewportWidth },
                ]}
              >
                <SingleViewPost
                  ref={index === activeIndex ? activePostRef : undefined}
                  item={buildViewItem(item)}
                  feedId={item.feed_id}
                  isActive={index === activeIndex}
                  isLive={item.id === liveItemId}
                  bionicReading={bionicReading}
                  onOpenContentLink={onOpenContentLink}
                  onScroll={onScroll}
                  // Given to *every* slot, not just the active one, and this
                  // is load-bearing. On Android a ScrollView with a
                  // refreshControl renders itself nested inside that control,
                  // and without one it renders at the top level — two
                  // different tree shapes at the same position. Handing the
                  // control to only the active slot therefore restructured
                  // two posts on every swipe (the one losing it and the one
                  // gaining it), remounting each entire article. The text
                  // came back looking identical, so what you actually saw was
                  // the images and favicons restarting their load: "the
                  // content is the same but everything reloads".
                  refreshControl={refreshControl}
                />
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>
    );
  })
);

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  track: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
  },
  slot: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});
