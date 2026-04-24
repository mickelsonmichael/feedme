// SettingsScreen — mock settings tab modeled on wire-other.jsx SettingsView.
// State is local (useState) only — nothing persists yet. Import / Export
// buttons link to the existing OPML flows on the Feed screen.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Wordmark } from "../components/ui";
import { colors, fonts, fontSize, radii, spacing } from "../theme";

type Density = "compact" | "comfy" | "spacious";
type ThemeMode = "light" | "dark" | "system";

function SectionHeading({ label }: { label: string }) {
  return <Text style={styles.sectionHeading}>{label}</Text>;
}

function Row({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value} ›</Text>
    </TouchableOpacity>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onChange(!on)}
      activeOpacity={0.6}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.toggle, on && styles.toggleOn]}>
        <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
      </View>
    </TouchableOpacity>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const [density, setDensity] = useState<Density>("comfy");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [cacheImages, setCacheImages] = useState(true);
  const [downloadWifi, setDownloadWifi] = useState(true);
  const [markAllButton, setMarkAllButton] = useState(true);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Wordmark size={22} />
        <Text style={styles.subtitle}>/ settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeading label="Reading" />
        <Row label="Open links in" value="reader view" />
        <Row label="After reading" value="mark as read" />
        <Row label="Swipe left on card" value="hide post" />
        <Row label="Swipe right on card" value="save for later" />

        <SectionHeading label="Feed density" />
        <Segmented
          value={density}
          options={["compact", "comfy", "spacious"] as const}
          onChange={setDensity}
        />

        <SectionHeading label="Appearance" />
        <Segmented
          value={themeMode}
          options={["light", "dark", "system"] as const}
          onChange={setThemeMode}
        />

        <SectionHeading label="Offline" />
        <Toggle
          label="Download full articles on wifi"
          on={downloadWifi}
          onChange={setDownloadWifi}
        />
        <Toggle
          label="Cache images"
          on={cacheImages}
          onChange={setCacheImages}
        />
        <Row label="Keep articles for" value="30 days" />

        <SectionHeading label="Inbox zero" />
        <Toggle
          label="Show 'mark all read' button"
          on={markAllButton}
          onChange={setMarkAllButton}
        />
        <Toggle
          label="Confirm before marking all read"
          on={confirmMarkAll}
          onChange={setConfirmMarkAll}
        />

        <SectionHeading label="Import / export" />
        <Text style={styles.hint}>
          Use the Import / Export buttons on the Feed tab to bring OPML in or
          out. A dedicated settings flow is coming soon.
        </Text>

        <SectionHeading label="About" />
        <Row label="Version" value="dev" />
        <Row label="Licenses" value="open source" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1.2,
    borderBottomColor: colors.ink,
    gap: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
    color: colors.inkSoft,
  },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    color: colors.ink,
  },
  rowValue: {
    fontSize: fontSize.body,
    color: colors.inkSoft,
    fontFamily: fonts.mono,
  },
  toggle: {
    width: 36,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 999,
    backgroundColor: colors.paper,
    justifyContent: "center",
    padding: 1,
  },
  toggleOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  knob: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  knobOff: {
    backgroundColor: colors.ink,
    alignSelf: "flex-start",
  },
  knobOn: {
    backgroundColor: colors.paper,
    alignSelf: "flex-end",
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.sm,
    padding: 3,
    alignSelf: "flex-start",
    backgroundColor: colors.paper,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 2,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize: fontSize.body,
    color: colors.ink,
  },
  segmentTextActive: {
    color: colors.paper,
    fontWeight: "600",
  },
  hint: {
    fontSize: fontSize.body,
    color: colors.inkSoft,
    fontStyle: "italic",
    lineHeight: 18,
    paddingVertical: spacing.sm,
  },
});
