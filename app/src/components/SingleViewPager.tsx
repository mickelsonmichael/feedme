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
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
  StyleSheet,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { FeedItemWithFeed } from "../types";
import { resolveSingleSwipeDirection } from "../singleSwipeDirection";
import { SingleViewPost, SingleViewPostHandle } from "./SingleViewPost";
import { FeedItemContentItem } from "./FeedItemContent";

const SINGLE_SWIPE_ENTER_DURATION_MS = 240;

// How many posts either side of the active one stay mounted.
//
// Two, not one: at one, the slot the user is about to swipe into only mounts
// on the frame the *previous* swipe commits, so its HTML parse and image
// decode land exactly when the animation ends — which is the "it reloads when
// you finish the swipe" jank. At two, that mount happens a whole swipe early,
// while the user is still reading, and swiping back costs no more than
// swiping forward.
export const SINGLE_VIEW_WINDOW = 2;

// Android's own long-press timeout and touch slop, mirrored here.
//
// A press that stays within the slop for this long makes the platform start a
// text selection in the article underneath (the body is selectable so a
// passage can be copied), which puts the selection magnifier and handles on
// screen as a native popup. Those live outside React, so if the pager then
// claims the same touch as a swipe, the popup is left stranded over whatever
// post arrives next with nothing to dismiss it. Hence the guard in the pan
// gesture below: once a touch has dwelled long enough to be a long press, it
// belongs to the selection and can never become a swipe. A selection that is
// finished and released before the swipe starts is fine and needs no guard —
// the platform tears its own overlay down on a touch it still owns.
//
// A press that escapes the slop *before* the timeout cancels the platform's
// pending long press, so no selection can start and the swipe is free to run
// — which is every ordinary flick.
const ANDROID_LONG_PRESS_MS = 500;
const ANDROID_TOUCH_SLOP = 8;

const SWIPE_ACTIVATE_DX = 20;
const SWIPE_FAIL_DY = 10;

// Stands in for "never activate": the selection guard stands the pager down
// by putting activation out of reach rather than failing the gesture, so the
// handler stays alive to report the touch ending and re-arm itself.
const SWIPE_UNREACHABLE_DX = 100_000;

const SNAP_BACK_SPRING = { damping: 26, stiffness: 260, mass: 1 };

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
    // The track's position lives on the UI thread. The gesture writes it and
    // the slide animates it there directly, so a finger-follow or a slide
    // never waits on JavaScript — which is busy exactly when it matters,
    // committing the previous swipe and parsing the next post's HTML.
    const translateX = useSharedValue(-activeIndex * viewportWidth);
    const gestureBaseX = useSharedValue(0);
    const activePostRef = useRef<SingleViewPostHandle | null>(null);

    // UI-thread copies of what the gesture needs to decide a move, so the
    // gesture object is not rebuilt as the user reads. Handing GestureDetector
    // a brand-new gesture while the previous one is still settling produced
    // skipped and duplicated advances. (The selection guard below does
    // rebuild it, but only on a touch it has already taken out of the pager's
    // hands.)
    const activeIndexValue = useSharedValue(activeIndex);
    const itemsLengthValue = useSharedValue(items.length);
    const viewportWidthValue = useSharedValue(viewportWidth);
    useLayoutEffect(() => {
      activeIndexValue.value = activeIndex;
      itemsLengthValue.value = items.length;
      viewportWidthValue.value = viewportWidth;
    }, [
      activeIndex,
      items.length,
      viewportWidth,
      activeIndexValue,
      itemsLengthValue,
      viewportWidthValue,
    ]);

    // JS-side mirrors for the imperative toolbar path.
    const activeIndexRef = useRef(activeIndex);
    activeIndexRef.current = activeIndex;
    const itemsLengthRef = useRef(items.length);
    itemsLengthRef.current = items.length;
    const onAdvanceRef = useRef(onAdvance);
    onAdvanceRef.current = onAdvance;
    const onEdgeForwardRef = useRef(onEdgeForward);
    onEdgeForwardRef.current = onEdgeForward;

    // Whether the pager is at rest. Drives `isLive` below; deliberately *not*
    // used to tear anything down, only to hold new things back.
    const [isSettled, setIsSettled] = useState(true);

    // ── JS-side reactions to UI-thread gesture events ──────────────────────
    // Each is scheduled from the gesture worklets below with scheduleOnRN.

    const handleSlideStart = useCallback((direction: 1 | -1) => {
      if (direction === 1) {
        // End the view-time row for the post being left — only on an
        // explicit forward move. Going back leaves it open (see
        // SingleViewPost).
        activePostRef.current?.endViewTimeForNext();
      }
      setIsSettled(false);
    }, []);

    // Called only once a slide has *finished*. If the user starts another
    // swipe before this one settles, onBegin cancels the animation, the slide
    // reports `finished: false`, and the pending advance is dropped:
    // committing an interrupted slide lands the change right as the new
    // gesture begins, snapping the content forward a full post mid-touch —
    // far more jarring than letting the new gesture take over from wherever
    // the old one got to.
    const handleSlideDone = useCallback((direction: 1 | -1) => {
      setIsSettled(true);
      onAdvanceRef.current(direction);
    }, []);

    const handleSettled = useCallback(() => setIsSettled(true), []);

    // A forward swipe off the last loaded post still leaves that post: the
    // parent pages in more and advances on its own once they land.
    const handleEdgeForward = useCallback(() => {
      activePostRef.current?.endViewTimeForNext();
      onEdgeForwardRef.current();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        // The toolbar buttons: an immediate move with no slide, which the
        // layout effect below turns into the jump itself.
        advance: (direction: 1 | -1) => {
          const index = activeIndexRef.current;
          const canAdvance =
            direction === 1 ? index < itemsLengthRef.current - 1 : index > 0;
          if (direction === 1) {
            activePostRef.current?.endViewTimeForNext();
          }
          if (canAdvance) {
            onAdvanceRef.current(direction);
          } else if (direction === 1) {
            onEdgeForwardRef.current();
          }
        },
        scrollToTop: () => activePostRef.current?.scrollToTop(),
      }),
      []
    );

    // Park the track at the active post's resting position. After a swipe
    // this is the position the slide already reached, so it changes nothing
    // on screen; after a toolbar tap (no animation) it is the jump itself.
    // Also covers viewport resizes such as rotation.
    useLayoutEffect(() => {
      translateX.value = -activeIndex * viewportWidth;
    }, [activeIndex, viewportWidth, translateX]);

    // Where the current touch went down, and the watch that decides whether it
    // has turned into a text selection. The slop check runs on the UI thread
    // with the gesture; the long-press timer runs here on JS.
    const touchStartX = useSharedValue(0);
    const touchStartY = useSharedValue(0);
    const watchingForLongPress = useSharedValue(false);
    const longPressWatchRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    // Set while the touch in progress belongs to a text selection rather than
    // to the pager. Raising activeOffsetX out of reach is what stands the
    // pager down: unlike disabling the gesture it does not cancel it, so the
    // handler stays alive to report the touch ending and re-arm itself.
    const [yieldedToSelection, setYieldedToSelection] = useState(false);

    const endLongPressWatch = useCallback(() => {
      if (longPressWatchRef.current !== null) {
        clearTimeout(longPressWatchRef.current);
        longPressWatchRef.current = null;
      }
    }, []);

    // The watch is armed on touch-down and disarmed by the first movement
    // that leaves the platform's touch slop. Whatever it is still running
    // when the long-press timeout elapses is a finger that has sat still on
    // selectable article text — so the platform is selecting, and the pager
    // stands down for the rest of the touch.
    //
    // Deciding this on a timer rather than on the first move after the dwell
    // is what makes it reliable: the decision is already made and pushed to
    // the native handler before the drag that would race it has begun.
    const armLongPressWatch = useCallback(() => {
      endLongPressWatch();
      longPressWatchRef.current = setTimeout(() => {
        longPressWatchRef.current = null;
        setYieldedToSelection(true);
      }, ANDROID_LONG_PRESS_MS);
    }, [endLongPressWatch]);

    const handleTouchFinished = useCallback(() => {
      endLongPressWatch();
      setYieldedToSelection(false);
    }, [endLongPressWatch]);

    useEffect(() => endLongPressWatch, [endLongPressWatch]);

    const gesture = useMemo(
      () =>
        Gesture.Pan()
          .activeOffsetX(
            yieldedToSelection
              ? [-SWIPE_UNREACHABLE_DX, SWIPE_UNREACHABLE_DX]
              : [-SWIPE_ACTIVATE_DX, SWIPE_ACTIVATE_DX]
          )
          .failOffsetY([-SWIPE_FAIL_DY, SWIPE_FAIL_DY])
          .onTouchesDown((event) => {
            const touch = event.allTouches[0];
            if (!touch) return;
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
            watchingForLongPress.value = true;
            scheduleOnRN(armLongPressWatch);
          })
          .onTouchesMove((event) => {
            // Checked here, per move, on the UI thread; JS only hears about
            // the one move that leaves the slop.
            if (!watchingForLongPress.value) return;
            const touch = event.allTouches[0];
            if (!touch) return;
            const dx = touch.absoluteX - touchStartX.value;
            const dy = touch.absoluteY - touchStartY.value;
            if (
              Math.abs(dx) > ANDROID_TOUCH_SLOP ||
              Math.abs(dy) > ANDROID_TOUCH_SLOP
            ) {
              watchingForLongPress.value = false;
              scheduleOnRN(endLongPressWatch);
            }
          })
          .onFinalize(() => {
            watchingForLongPress.value = false;
            scheduleOnRN(handleTouchFinished);
          })
          .onBegin(() => {
            cancelAnimation(translateX);
            gestureBaseX.value =
              -activeIndexValue.value * viewportWidthValue.value;
          })
          .onUpdate((e) => {
            translateX.value = gestureBaseX.value + e.translationX;
          })
          .onEnd((e) => {
            const width = viewportWidthValue.value;
            const index = activeIndexValue.value;
            const rest = -index * width;
            const swipe = resolveSingleSwipeDirection(
              e.translationX,
              e.translationY,
              e.velocityX
            );
            const direction: 1 | -1 | 0 =
              swipe === "next" ? 1 : swipe === "previous" ? -1 : 0;
            const canAdvance =
              direction === 1
                ? index < itemsLengthValue.value - 1
                : direction === -1 && index > 0;

            if (direction !== 0 && canAdvance) {
              scheduleOnRN(handleSlideStart, direction);
              translateX.value = withTiming(
                -(index + direction) * width,
                {
                  duration: SINGLE_SWIPE_ENTER_DURATION_MS,
                  easing: Easing.out(Easing.cubic),
                },
                (finished) => {
                  if (finished) scheduleOnRN(handleSlideDone, direction);
                }
              );
              return;
            }

            // Nothing to move into (or not a swipe): spring back. A forward
            // swipe off the last loaded post also asks the parent to page in
            // more posts.
            translateX.value = withSpring(
              rest,
              SNAP_BACK_SPRING,
              (finished) => {
                if (finished) scheduleOnRN(handleSettled);
              }
            );
            if (direction === 1) scheduleOnRN(handleEdgeForward);
          }),
      [
        yieldedToSelection,
        translateX,
        gestureBaseX,
        activeIndexValue,
        itemsLengthValue,
        viewportWidthValue,
        touchStartX,
        touchStartY,
        watchingForLongPress,
        armLongPressWatch,
        endLongPressWatch,
        handleTouchFinished,
        handleSlideStart,
        handleSlideDone,
        handleSettled,
        handleEdgeForward,
      ]
    );

    const trackStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

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
              { width: Math.max(1, items.length) * viewportWidth },
              trackStyle,
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
