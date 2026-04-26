import React from "react";
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
        { borderColor: colors.border, backgroundColor: colors.paper },
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

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeading label="Appearance" />
        <Segmented
          value={mode}
          options={["light", "dark", "system"] as const}
          onChange={(v) => setMode(v as ThemeMode)}
        />

        <SectionHeading label="Import / export" />
        <Row
          label="Import / export"
          value="OPML"
          onPress={() => navigation.navigate("ImportExport")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  sectionHeading: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
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
    fontFamily: fonts.sans,
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.md,
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
