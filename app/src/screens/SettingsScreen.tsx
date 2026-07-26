import React from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as BackgroundTask from "expo-background-task";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fonts, fontSize, radii, spacing } from "../theme";
import {
  RootStackParamList,
  TabParamList,
  type BackgroundSyncFrequency,
  type FeedLayoutMode,
  type GroupFeedsMode,
  type LinkOpenMode,
} from "../types";
import { useTheme, type ThemeMode } from "../context/ThemeContext";
import { loadConfig, saveConfig } from "../storage";
import {
  runBackgroundNotificationSync,
  updateBackgroundSyncSchedule,
} from "../notifications";
import { refreshFeeds } from "../feedRefresher";
import { getFeeds, resetStatistics } from "../database";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Settings">,
  NativeStackScreenProps<RootStackParamList>
>;

function SectionHeading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>
      {label}
    </Text>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={colors.paper}
        trackColor={{ false: colors.inkFaint, true: colors.accent }}
      />
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  danger,
  disabled,
  /** "nav" for a plain action/navigation row, "picker" for one that opens a
   *  value picker — controls which trailing icon signals tappability. */
  variant = "nav",
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  /** Renders the label (and trailing icon) in the theme's danger color, for
   *  destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  variant?: "nav" | "picker";
}) {
  const { colors } = useTheme();
  const trailingColor = danger ? colors.danger : colors.inkSoft;
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={!onPress || disabled}
      activeOpacity={0.6}
    >
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? colors.danger : colors.ink },
        ]}
      >
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.inkSoft }]}>
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <Feather
          name={variant === "picker" ? "chevron-down" : "chevron-right"}
          size={18}
          color={trailingColor}
          style={styles.rowChevron}
        />
      ) : null}
    </TouchableOpacity>
  );
}

/** Small caption above a multi-option control within a section, used when a
 *  section groups more than one distinct control (e.g. "Theme" and "Feed
 *  layout" both live under "Appearance"). */
function FieldLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{label}</Text>
  );
}

/** A titled, bordered card grouping related controls. Gives each section a
 *  clear visual boundary instead of relying on spacing alone. */
function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <SectionHeading label={heading} />
      <View
        style={[
          styles.sectionCard,
          { borderColor: colors.border, backgroundColor: colors.paperWarm },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        { borderColor: colors.border, backgroundColor: colors.paper },
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.segment,
              active && { backgroundColor: colors.accent },
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <View style={styles.segmentContent}>
              {opt.icon ? (
                <View style={styles.segmentIcon}>{opt.icon}</View>
              ) : null}
              <Text
                style={[
                  styles.segmentText,
                  { color: colors.ink },
                  active && { color: colors.paper, fontWeight: "600" },
                ]}
              >
                {opt.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A picker rendered as a `Row` (label left, selected value + "▾" right) so
 *  it lines up with every other control in a section instead of being its
 *  own boxed widget. Tapping it opens a modal list of options. */
function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <Row
        label={label}
        value={selectedLabel}
        variant="picker"
        onPress={() => setOpen(true)}
      />

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setOpen(false)}
        >
          <View
            style={[
              styles.dropdownMenu,
              {
                backgroundColor: colors.paper,
                borderColor: colors.border,
              },
            ]}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.dropdownMenuItem,
                    { borderBottomColor: colors.inkFaint },
                    active && { backgroundColor: colors.accent },
                  ]}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dropdownMenuItemText,
                      { color: colors.ink },
                      active && { color: colors.paper, fontWeight: "600" },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function CompactLayoutIcon({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const stroke = active ? colors.paper : colors.inkSoft;
  const fill = active ? colors.paper : colors.paperWarm;

  const row = (
    <View style={layoutIconStyles.row}>
      <View
        style={[
          layoutIconStyles.compactThumb,
          { backgroundColor: fill, borderColor: stroke },
        ]}
      />
      <View style={layoutIconStyles.compactLines}>
        <View
          style={[
            layoutIconStyles.line,
            { backgroundColor: stroke, width: 21 },
          ]}
        />
        <View
          style={[
            layoutIconStyles.line,
            { backgroundColor: stroke, width: 16 },
          ]}
        />
      </View>
    </View>
  );

  return (
    <View
      style={[
        layoutIconStyles.frame,
        layoutIconStyles.compactFrame,
        { borderColor: stroke },
      ]}
    >
      {row}
      <View style={layoutIconStyles.compactSpacer} />
      {row}
    </View>
  );
}

function CardLayoutIcon({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const stroke = active ? colors.paper : colors.inkSoft;
  const fill = active ? colors.paper : colors.paperWarm;

  return (
    <View
      style={[
        layoutIconStyles.frame,
        layoutIconStyles.cardFrame,
        { borderColor: stroke },
      ]}
    >
      <View
        style={[
          layoutIconStyles.cardThumb,
          { backgroundColor: fill, borderColor: stroke },
        ]}
      />
      <View
        style={[
          layoutIconStyles.line,
          { backgroundColor: stroke, width: 22, marginTop: 3 },
        ]}
      />
      <View
        style={[
          layoutIconStyles.line,
          { backgroundColor: stroke, width: 19, marginTop: 2 },
        ]}
      />
    </View>
  );
}

function SingleLayoutIcon({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const stroke = active ? colors.paper : colors.inkSoft;
  const fill = active ? colors.paper : colors.paperWarm;

  return (
    <View
      style={[
        layoutIconStyles.frame,
        layoutIconStyles.singleFrame,
        { borderColor: stroke },
      ]}
    >
      <View
        style={[
          layoutIconStyles.singleHeader,
          { borderBottomColor: stroke, backgroundColor: fill },
        ]}
      />
      <View style={layoutIconStyles.singleBody}>
        <View
          style={[
            layoutIconStyles.singleMedia,
            { borderColor: stroke, backgroundColor: fill },
          ]}
        />
        <View
          style={[
            layoutIconStyles.line,
            { backgroundColor: stroke, width: 19, marginTop: 3 },
          ]}
        />
        <View
          style={[
            layoutIconStyles.line,
            { backgroundColor: stroke, width: 16, marginTop: 2 },
          ]}
        />
      </View>
    </View>
  );
}

const layoutIconStyles = StyleSheet.create({
  frame: {
    width: 42,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
  },
  compactFrame: {
    paddingHorizontal: 3,
    paddingVertical: 3,
    justifyContent: "space-between",
  },
  cardFrame: {
    width: 28,
    alignSelf: "center",
    paddingHorizontal: 3,
    paddingTop: 3,
  },
  singleFrame: {
    padding: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactSpacer: {
    height: 2,
  },
  compactThumb: {
    width: 8,
    height: 8,
    borderRadius: 1.5,
    borderWidth: 0.5,
    marginRight: 3,
  },
  compactLines: {
    flex: 1,
    justifyContent: "center",
  },
  cardThumb: {
    width: 22,
    height: 9,
    borderRadius: 2,
    borderWidth: 0.5,
  },
  singleHeader: {
    height: 4,
    borderRadius: 1.5,
    borderBottomWidth: 0.5,
  },
  singleBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  singleMedia: {
    width: 18,
    height: 7,
    borderRadius: 2,
    borderWidth: 0.5,
    marginTop: 2,
  },
  line: {
    height: 1.5,
    borderRadius: 1,
    marginVertical: 1,
  },
});

/**
 * Dev-only panel for end-to-end testing of the background notification
 * pipeline. Rendered only when `__DEV__` is true.
 *
 *  - "Run sync now (in-process)" invokes `runBackgroundNotificationSync`
 *    directly from JS. Verifies the refresh + dispatch logic without
 *    involving WorkManager.
 *  - "Trigger OS background worker" calls expo-background-task's debug-only
 *    `triggerTaskWorkerForTestingAsync`, which actually fires the registered
 *    WorkManager job. Use this to verify the OS-scheduled path without
 *    waiting for Android's 15-minute periodic minimum.
 */
function BackgroundSyncDevPanel() {
  const { colors } = useTheme();
  const [busy, setBusy] = React.useState<null | "in-process" | "os">(null);

  const runInProcess = React.useCallback(async () => {
    if (busy) return;
    setBusy("in-process");
    try {
      // Force-refresh all feeds first to bypass per-feed adaptive
      // scheduling (`next_fetch_at`), which otherwise skips recently
      // fetched feeds during the regular sync. This makes the dev panel
      // reliably exercise the full fetch + notify pipeline.
      const feeds = await getFeeds();
      await refreshFeeds(feeds, { force: true });
      await runBackgroundNotificationSync();
      Alert.alert(
        "Background sync",
        "In-process sync completed. Check the notification tray."
      );
    } catch (e) {
      Alert.alert("Background sync failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const triggerOsWorker = React.useCallback(async () => {
    if (busy) return;
    setBusy("os");
    try {
      const fired = await BackgroundTask.triggerTaskWorkerForTestingAsync();
      Alert.alert(
        "OS background worker",
        fired
          ? "WorkManager was asked to run the registered task. Watch logcat for the result."
          : "WorkManager did not accept the trigger (release build or no task registered)."
      );
    } catch (e) {
      Alert.alert("Trigger failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  return (
    <>
      <FieldLabel label="Background sync (debug)" />
      <Text style={[styles.settingHint, { color: colors.inkFaint }]}>
        Dev-only tools for verifying the notification pipeline end-to-end.
        Hidden in release builds.
      </Text>
      <Row
        label={busy === "in-process" ? "Running…" : "Run sync now (in-process)"}
        onPress={runInProcess}
        disabled={busy !== null}
      />
      <Row
        label={
          busy === "os" ? "Triggering…" : "Trigger OS background worker"
        }
        onPress={triggerOsWorker}
        disabled={busy !== null}
      />
    </>
  );
}

export default function SettingsScreen({ navigation }: Props) {
  const { colors, mode, setMode } = useTheme();
  const isMobile = Platform.OS !== "web";
  const [feedLayout, setFeedLayout] = React.useState<FeedLayoutMode>(
    () => loadConfig().feedLayout ?? "compact"
  );
  const [linkOpenMode, setLinkOpenMode] = React.useState<LinkOpenMode>(
    () => loadConfig().linkOpenMode ?? "embedded"
  );
  const [markAsReadOnScroll, setMarkAsReadOnScroll] = React.useState(
    () => loadConfig().markAsReadOnScroll ?? false
  );
  const [hideReadByDefault, setHideReadByDefault] = React.useState(
    () => loadConfig().hideReadByDefault ?? false
  );
  const [defaultSort, setDefaultSort] = React.useState<"newest" | "stacked">(
    () => loadConfig().defaultSort ?? "stacked"
  );
  const [bionicReading, setBionicReading] = React.useState(
    () => loadConfig().bionicReading ?? false
  );
  const [groupFeeds, setGroupFeeds] = React.useState<GroupFeedsMode>(
    () => loadConfig().groupFeeds ?? "none"
  );
  const [backgroundSyncFrequency, setBackgroundSyncFrequency] =
    React.useState<BackgroundSyncFrequency>(
      () => loadConfig().backgroundSyncFrequency ?? "15m"
    );
  const [backgroundSyncWifiOnly, setBackgroundSyncWifiOnly] = React.useState(
    () => loadConfig().backgroundSyncWifiOnly ?? false
  );

  const handleLayoutChange = React.useCallback((nextLayout: FeedLayoutMode) => {
    setFeedLayout(nextLayout);
    try {
      saveConfig({ feedLayout: nextLayout });
    } catch (e) {
      console.warn("[feedme] Failed to persist feed layout:", e);
    }
  }, []);

  const handleLinkOpenModeChange = React.useCallback(
    (nextMode: LinkOpenMode) => {
      setLinkOpenMode(nextMode);
      try {
        saveConfig({ linkOpenMode: nextMode });
      } catch (e) {
        console.warn("[feedme] Failed to persist link open mode:", e);
      }
    },
    []
  );

  const handleMarkAsReadOnScrollChange = React.useCallback((value: boolean) => {
    setMarkAsReadOnScroll(value);
    try {
      saveConfig({ markAsReadOnScroll: value });
    } catch (e) {
      console.warn("[feedme] Failed to persist markAsReadOnScroll:", e);
    }
  }, []);

  const handleHideReadByDefaultChange = React.useCallback((value: boolean) => {
    setHideReadByDefault(value);
    try {
      saveConfig({ hideReadByDefault: value });
    } catch (e) {
      console.warn("[feedme] Failed to persist hideReadByDefault:", e);
    }
  }, []);

  const handleDefaultSortChange = React.useCallback(
    (value: "newest" | "stacked") => {
      setDefaultSort(value);
      try {
        saveConfig({ defaultSort: value });
      } catch (e) {
        console.warn("[feedme] Failed to persist defaultSort:", e);
      }
    },
    []
  );

  const handleBionicReadingChange = React.useCallback((value: boolean) => {
    setBionicReading(value);
    try {
      saveConfig({ bionicReading: value });
    } catch (e) {
      console.warn("[feedme] Failed to persist bionicReading:", e);
    }
  }, []);

  const handleGroupFeedsChange = React.useCallback((value: GroupFeedsMode) => {
    setGroupFeeds(value);
    try {
      saveConfig({ groupFeeds: value });
    } catch (e) {
      console.warn("[feedme] Failed to persist groupFeeds:", e);
    }
  }, []);

  const handleBackgroundSyncFrequencyChange = React.useCallback(
    (value: BackgroundSyncFrequency) => {
      setBackgroundSyncFrequency(value);
      try {
        saveConfig({ backgroundSyncFrequency: value });
      } catch (e) {
        console.warn("[feedme] Failed to persist backgroundSyncFrequency:", e);
      }
      updateBackgroundSyncSchedule().catch((e) => {
        console.warn("[feedme] Failed to update background sync schedule:", e);
      });
    },
    []
  );

  const handleBackgroundSyncWifiOnlyChange = React.useCallback(
    (value: boolean) => {
      setBackgroundSyncWifiOnly(value);
      try {
        saveConfig({ backgroundSyncWifiOnly: value });
      } catch (e) {
        console.warn("[feedme] Failed to persist backgroundSyncWifiOnly:", e);
      }
    },
    []
  );

  const handleResetStatistics = React.useCallback(() => {
    const message =
      "This clears fetch success/failure counts, failure streaks, and average read time stats for every feed. This cannot be undone.";

    const doReset = async () => {
      try {
        await resetStatistics();
      } catch (e) {
        const errMsg = "Could not reset statistics: " + (e as Error).message;
        if (Platform.OS === "web") {
          window.alert(errMsg);
        } else {
          Alert.alert("Error", errMsg);
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        doReset();
      }
      return;
    }

    Alert.alert("Reset statistics?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: doReset },
    ]);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section heading="Appearance">
          <FieldLabel label="Theme" />
          <Segmented
            value={mode}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            onChange={(v) => setMode(v as ThemeMode)}
          />
          <FieldLabel label="Feed layout" />
          <Segmented
            value={feedLayout}
            options={[
              {
                value: "compact",
                label: "Compact",
                icon: <CompactLayoutIcon active={feedLayout === "compact"} />,
              },
              {
                value: "card",
                label: "Card",
                icon: <CardLayoutIcon active={feedLayout === "card"} />,
              },
              {
                value: "single",
                label: "Single",
                icon: <SingleLayoutIcon active={feedLayout === "single"} />,
              },
            ]}
            onChange={handleLayoutChange}
          />
        </Section>

        <Section heading="Reading">
          <ToggleRow
            label="Mark as read on scroll"
            value={markAsReadOnScroll}
            onValueChange={handleMarkAsReadOnScrollChange}
          />
          <ToggleRow
            label="Hide read items by default"
            value={hideReadByDefault}
            onValueChange={handleHideReadByDefaultChange}
          />
          <ToggleRow
            label="Bionic Reading"
            value={bionicReading}
            onValueChange={handleBionicReadingChange}
          />
          <FieldLabel label="Sort order" />
          <Segmented
            value={defaultSort}
            options={[
              { value: "newest", label: "Newest" },
              { value: "stacked", label: "Stacked" },
            ]}
            onChange={handleDefaultSortChange}
          />
          <Text style={[styles.settingHint, { color: colors.inkFaint }]}>
            Insert time-bucket dividers in the feed. Only applies to Newest
            sort.
          </Text>
          <Dropdown
            label="Group feeds"
            value={groupFeeds}
            options={[
              { value: "none", label: "None" },
              { value: "hourly", label: "Hourly" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
            onChange={handleGroupFeedsChange}
          />
          {isMobile ? (
            <>
              <FieldLabel label="Open links" />
              <Segmented
                value={linkOpenMode}
                options={[
                  { value: "embedded", label: "Embedded" },
                  { value: "external", label: "External" },
                ]}
                onChange={handleLinkOpenModeChange}
              />
            </>
          ) : null}
        </Section>

        {isMobile ? (
          <Section heading="Background sync">
            <Text style={[styles.settingHint, { color: colors.inkFaint }]}>
              How often the app refreshes your feeds in the background to
              check for new items and deliver notifications.
            </Text>
            <Dropdown
              label="Sync frequency"
              value={backgroundSyncFrequency}
              options={[
                { value: "off", label: "Off" },
                { value: "15m", label: "Every 15 minutes" },
                { value: "30m", label: "Every 30 minutes" },
                { value: "1h", label: "Every hour" },
                { value: "3h", label: "Every 3 hours" },
                { value: "6h", label: "Every 6 hours" },
                { value: "12h", label: "Every 12 hours" },
                { value: "24h", label: "Every 24 hours" },
              ]}
              onChange={handleBackgroundSyncFrequencyChange}
            />
            <ToggleRow
              label="Sync only on Wi-Fi"
              value={backgroundSyncWifiOnly}
              onValueChange={handleBackgroundSyncWifiOnlyChange}
            />
            <Text style={[styles.settingHint, { color: colors.inkFaint }]}>
              When on, background syncs are skipped on cellular networks.
              Manual pull-to-refresh always works.
            </Text>
            {__DEV__ ? <BackgroundSyncDevPanel /> : null}
          </Section>
        ) : null}

        <Section heading="Data">
          <Row
            label="Import / export"
            value="OPML"
            onPress={() => navigation.navigate("ImportExport")}
          />
          <Row label="Reset statistics" onPress={handleResetStatistics} danger />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: {
    gap: spacing.xs,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.bodyLg,
  },
  rowValue: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  rowChevron: {
    marginLeft: spacing.xs,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  fieldLabel: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 3,
  },
  settingHint: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  segmentContent: {
    alignItems: "center",
    gap: spacing.xs,
  },
  segmentIcon: {
    height: 28,
    justifyContent: "center",
  },
  segmentText: {
    fontSize: fontSize.body,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownMenu: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    minWidth: 180,
  },
  dropdownMenuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownMenuItemText: {
    fontSize: fontSize.bodyLg,
  },
});
