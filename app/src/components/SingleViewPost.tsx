import React, {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { startItemViewTime, endItemViewTime } from "../database";
import { fonts, fontSize, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedIcon } from "./FeedIcon";
import { FeedItemContent, FeedItemContentItem } from "./FeedItemContent";

export type SingleViewPostHandle = {
  // Ends the view-time row for this post if one is open — called by the
  // parent when the user explicitly advances to the next post. Going
  // backward or switching away intentionally does NOT end the row (it's
  // left open and discarded on next app startup); see the effect below.
  endViewTimeForNext: () => void;
  // Scrolls this post's content back to the top without changing which
  // post is active — used for tab re-tap / pull-to-refresh-landed-new-posts.
  scrollToTop: () => void;
};

type Props = {
  item: FeedItemContentItem;
  feedId: number;
  /** This slot is the post the reader is on. Governs cheap, immediate things:
   *  scroll reset, and which slot the imperative handle points at. */
  isActive: boolean;
  /** Active *and* the pager has come to rest. Governs everything expensive —
   *  view-time tracking and heavy embeds (YouTube/GIF players) — so none of
   *  it is set up for a post that is merely flying past under the finger. */
  isLive: boolean;
  bionicReading: boolean;
  isDesktopWeb?: boolean;
  onOpenContentLink?: (url: string) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

/**
 * One post's worth of the single-view layout: header (icon/title/date),
 * NSFW gate, and body. Rendered once per window slot so swiping is a
 * translateX shift over already-mounted, already-painted content instead of
 * a mount-on-demand — see SingleViewPager.
 *
 * Memoised, and it matters: this subtree parses and lays out a whole
 * article. The screen above it re-renders constantly (refresh progress alone
 * ticks once per feed), and without this every one of those ticks re-rendered
 * every mounted post.
 */
export const SingleViewPost = memo(
  forwardRef<SingleViewPostHandle, Props>(function SingleViewPost(
    {
      item,
      feedId,
      isActive,
      isLive,
      bionicReading,
      isDesktopWeb = false,
      onOpenContentLink,
      onScroll,
      refreshControl,
    },
    ref
  ) {
    const { colors } = useTheme();
    const [nsfwRevealed, setNsfwRevealed] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const viewTimeRowIdRef = useRef<number | null>(null);
    const isNsfw = item.nsfw ?? false;

    useImperativeHandle(
      ref,
      () => ({
        endViewTimeForNext: () => {
          const rowId = viewTimeRowIdRef.current;
          if (rowId !== null) {
            viewTimeRowIdRef.current = null;
            endItemViewTime(rowId).catch(() => {
              // Non-critical — silently ignore view time failures.
            });
          }
        },
        scrollToTop: () => {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        },
      }),
      []
    );

    // Reset scroll to top whenever this slot becomes the active post.
    useEffect(() => {
      if (isActive) {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    }, [isActive]);

    // Start the view-time timer once the reader has settled on this post —
    // unless it's NSFW, in which case the companion effect below waits for
    // reveal. Keyed to isLive, not isActive: a post swiped straight past
    // hasn't been read, and shouldn't open a view-time row.
    useEffect(() => {
      viewTimeRowIdRef.current = null;
      if (!isLive || isNsfw) return;

      let cancelled = false;
      startItemViewTime(item.itemId ?? 0, feedId)
        .then((id) => {
          if (!cancelled) {
            viewTimeRowIdRef.current = id;
          }
        })
        .catch(() => {
          // Non-critical — silently ignore view time failures.
        });

      return () => {
        cancelled = true;
        viewTimeRowIdRef.current = null;
      };
    }, [isLive, isNsfw, item.itemId, feedId]);

    // NSFW posts: start the timer the first time the user reveals the
    // content. The guard prevents double-starting if the user toggles
    // visibility off and on again.
    useEffect(() => {
      if (
        !isLive ||
        !isNsfw ||
        !nsfwRevealed ||
        viewTimeRowIdRef.current !== null
      )
        return;

      let cancelled = false;
      startItemViewTime(item.itemId ?? 0, feedId)
        .then((id) => {
          if (!cancelled) {
            viewTimeRowIdRef.current = id;
          }
        })
        .catch(() => {
          // Non-critical — silently ignore view time failures.
        });

      return () => {
        cancelled = true;
      };
    }, [isLive, isNsfw, nsfwRevealed, item.itemId, feedId]);

    return (
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
        refreshControl={refreshControl}
        onScroll={onScroll}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.singleInner,
            isDesktopWeb ? styles.desktopInner : null,
          ]}
        >
          <View style={styles.singlePostHeader}>
            <View style={styles.singlePostMetaRow}>
              <FeedIcon feedUrl={item.feedUrl} />
              <Text style={[styles.singlePostMeta, { color: colors.inkSoft }]}>
                {item.feedTitle} - {formatRelativeDate(item.publishedAt)}
              </Text>
            </View>
            <Text style={[styles.singlePostTitle, { color: colors.ink }]}>
              {item.title}
            </Text>
          </View>
          <View
            style={[
              styles.singlePostSeparator,
              { backgroundColor: colors.border },
            ]}
          />
          {isNsfw ? (
            <TouchableOpacity
              onPress={() => setNsfwRevealed((v) => !v)}
              style={styles.singleNsfwRevealButton}
              activeOpacity={0.7}
              accessibilityLabel={
                nsfwRevealed ? "Hide NSFW content" : "Reveal NSFW content"
              }
              accessibilityRole="button"
            >
              <Text
                style={[styles.singleNsfwRevealText, { color: colors.inkSoft }]}
              >
                {nsfwRevealed ? "Hide NSFW" : "Reveal NSFW"}
              </Text>
              <Feather
                name={nsfwRevealed ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.inkSoft}
              />
            </TouchableOpacity>
          ) : null}

          {isNsfw && !nsfwRevealed ? (
            <View style={styles.singleNsfwPlaceholder}>
              <Feather name="eye-off" size={48} color={colors.inkFaint} />
              <Text
                style={[
                  styles.singleNsfwPlaceholderText,
                  { color: colors.inkFaint },
                ]}
              >
                NSFW content hidden
              </Text>
            </View>
          ) : (
            <FeedItemContent
              item={item}
              bionicReading={bionicReading}
              onOpenContentLink={onOpenContentLink}
              includeRedditCommentsInLinks
              isLive={isLive}
            />
          )}
        </View>
      </ScrollView>
    );
  })
);

function formatRelativeDate(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  singleInner: {
    width: "100%",
    gap: spacing.lg,
  },
  desktopInner: {
    maxWidth: 920,
  },
  singlePostHeader: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  singlePostMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  singlePostMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  singlePostTitle: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: fontSize.h2,
    lineHeight: 26,
  },
  singlePostSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  singleNsfwRevealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: "center",
  },
  singleNsfwRevealText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
  },
  singleNsfwPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  singleNsfwPlaceholderText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
});
