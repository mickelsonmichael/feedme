// SettingsScreen — mock settings tab modeled on wire-other.jsx SettingsView.

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fonts, fontSize, radii, spacing } from "../theme";
import { RootStackParamList, TabParamList } from "../types";
import { useTheme, type ThemeMode } from "../context/ThemeContext";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Settings">,
  NativeStackScreenProps<RootStackParamList>
>;

type Density = "compact" | "comfy" | "spacious";

function SectionHeading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>
      {label}
    </Text>
  );
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
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.inkFaint }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.inkSoft }]}>
        {value} ›
      </Text>
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
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.inkFaint }]}
      onPress={() => onChange(!on)}
      activeOpacity={0.6}
    >
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      <View
        style={[
          styles.toggle,
          { borderColor: colors.ink, backgroundColor: colors.paper },
          on && { backgroundColor: colors.accent, borderColor: colors.accent },
        ]}
      >
        <View
          style={[
            styles.knob,
            on
              ? { backgroundColor: colors.paper, alignSelf: "flex-end" }
              : { backgroundColor: colors.ink, alignSelf: "flex-start" },
          ]}
        />
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
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        { borderColor: colors.ink, backgroundColor: colors.paper },
      ]}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              styles.segment,
              active && { backgroundColor: colors.accent },
            ]}
            onPress={() => onChange(opt)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.ink },
                active && { color: colors.paper, fontWeight: "600" },
              ]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SettingsScreen({ navigation }: Props) {
  const { colors, mode, setMode } = useTheme();
  const [density, setDensity] = useState<Density>("comfy");
  const [cacheImages, setCacheImages] = useState(true);
  const [downloadWifi, setDownloadWifi] = useState(true);
  const [markAllButton, setMarkAllButton] = useState(true);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
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
          value={mode}
          options={["light", "dark", "system"] as const}
          onChange={(v) => setMode(v as ThemeMode)}
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
        <Row
          label="Import / export"
          value="OPML"
          onPress={() => navigation.navigate("ImportExport")}
        />

        <SectionHeading label="About" />
        <Row label="Version" value="dev" />
        <Row label="Licenses" value="open source" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
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
    borderStyle: "dashed",
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.bodyLg,
  },
  rowValue: {
    fontSize: fontSize.body,
    fontFamily: fonts.mono,
  },
  toggle: {
    width: 36,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 999,
    justifyContent: "center",
    padding: 1,
  },
  knob: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderRadius: radii.sm,
    padding: 3,
    alignSelf: "flex-start",
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 2,
  },
  segmentText: {
    fontSize: fontSize.body,
  },
});
