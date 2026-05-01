import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { fonts, fontSize, radii, spacing } from "../theme";
import {
  RootStackParamList,
  TabParamList,
  type FeedLayoutMode,
  type LinkOpenMode,
} from "../types";
import { useTheme, type ThemeMode } from "../context/ThemeContext";
import { loadConfig, saveConfig } from "../storage";

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
  line: {
    height: 1.5,
    borderRadius: 1,
    marginVertical: 1,
  },
});

export default function SettingsScreen({ navigation }: Props) {
  const { colors, mode, setMode } = useTheme();
  const isMobile = Platform.OS !== "web";
  const [feedLayout, setFeedLayout] = React.useState<FeedLayoutMode>(
    () => loadConfig().feedLayout ?? "compact"
  );
  const [linkOpenMode, setLinkOpenMode] = React.useState<LinkOpenMode>(
    () => loadConfig().linkOpenMode ?? "embedded"
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

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeading label="Appearance" />
        <Segmented
          value={mode}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
          onChange={(v) => setMode(v as ThemeMode)}
        />

        <SectionHeading label="Feed layout" />
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
          ]}
          onChange={handleLayoutChange}
        />

        {isMobile ? (
          <>
            <SectionHeading label="Links" />
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
    paddingVertical: spacing.xs,
    borderRadius: 2,
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
});
