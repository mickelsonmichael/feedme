import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, radii, spacing } from "../theme";

export type CompactMenuOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: CompactMenuOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/**
 * Minimal label + chevron trigger that opens a small popover menu anchored
 * just below itself. Used to compact toggle groups (e.g. All / Unread,
 * Newest / Stacked) into a single tap-target.
 */
export function CompactMenu<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const current = options.find((o) => o.value === value);
  const displayLabel = current?.label ?? "";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityLabel={accessibilityLabel ?? displayLabel}
        accessibilityRole="button"
        style={styles.trigger}
      >
        <Text style={[styles.triggerText, { color: colors.ink }]}>
          {displayLabel}
        </Text>
        <Feather name="chevron-down" size={12} color={colors.inkSoft} />
      </TouchableOpacity>

      {open ? (
        <>
          {/* Transparent backdrop swallows outside taps to close the menu */}
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss menu"
          />
          <View
            style={[
              styles.menu,
              {
                backgroundColor: colors.paperWarm,
                borderColor: colors.border,
              },
            ]}
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setOpen(false);
                    onChange(opt.value);
                  }}
                  activeOpacity={0.7}
                  style={styles.menuItem}
                  accessibilityLabel={opt.label}
                  accessibilityRole="menuitem"
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      {
                        color: selected ? colors.accent : colors.ink,
                        fontWeight: selected ? "700" : "500",
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {selected ? (
                    <Feather name="check" size={14} color={colors.accent} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 4,
    minHeight: 30,
  },
  triggerText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    fontWeight: "600",
  },
  backdrop: {
    position: "absolute",
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    zIndex: 10,
  },
  menu: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
    minWidth: 140,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  menuItemText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
});
