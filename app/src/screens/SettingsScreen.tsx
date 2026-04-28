import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
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

  return (
    <Svg width={42} height={28} viewBox="0 0 42 28" fill="none">
      <Rect x="1" y="2" width="40" height="24" rx="5" stroke={stroke} />
      <Rect x="4" y="6" width="8" height="6" rx="1.5" fill={fill} />
      <Line x1="15" y1="8" x2="36" y2="8" stroke={stroke} strokeWidth="1.5" />
      <Line x1="15" y1="11" x2="31" y2="11" stroke={stroke} strokeWidth="1.5" />
      <Rect x="4" y="16" width="8" height="6" rx="1.5" fill={fill} />
      <Line x1="15" y1="18" x2="36" y2="18" stroke={stroke} strokeWidth="1.5" />
      <Line x1="15" y1="21" x2="29" y2="21" stroke={stroke} strokeWidth="1.5" />
    </Svg>
  );
}

function CardLayoutIcon({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const stroke = active ? colors.paper : colors.inkSoft;
  const fill = active ? colors.paper : colors.paperWarm;

  return (
    <Svg width={42} height={28} viewBox="0 0 42 28" fill="none">
      <Rect x="7" y="2" width="28" height="24" rx="5" stroke={stroke} />
      <Rect x="10" y="5" width="22" height="9" rx="2" fill={fill} />
      <Line x1="10" y1="18" x2="31" y2="18" stroke={stroke} strokeWidth="1.5" />
      <Line x1="10" y1="21" x2="28" y2="21" stroke={stroke} strokeWidth="1.5" />
    </Svg>
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
