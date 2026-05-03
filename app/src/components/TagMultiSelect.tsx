import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Tag, MAX_TAGS_PER_FEED } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

/**
 * A "tag" as represented in the multi-select. Tags that already exist in the
 * database have a numeric `id`; freshly-typed tags that the user is creating
 * inline have `id: null` and are persisted by the parent screen on save.
 */
export type SelectedTag = { id: number | null; name: string };

type Props = {
  /** Currently selected tags (existing + newly-created). */
  value: SelectedTag[];
  onChange: (next: SelectedTag[]) => void;
  /** All known tags loaded from the database (for the suggestion list). */
  availableTags: Tag[];
  /** Maximum number of tags allowed. Defaults to {@link MAX_TAGS_PER_FEED}. */
  maxTags?: number;
  testID?: string;
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function TagMultiSelect({
  value,
  onChange,
  availableTags,
  maxTags = MAX_TAGS_PER_FEED,
  testID,
}: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");

  const selectedNames = useMemo(
    () => new Set(value.map((t) => normalize(t.name))),
    [value]
  );

  const suggestions = useMemo(() => {
    const query = normalize(draft);
    return availableTags
      .filter((t) => !selectedNames.has(normalize(t.name)))
      .filter((t) => (query ? normalize(t.name).includes(query) : true))
      .slice(0, 8);
  }, [availableTags, selectedNames, draft]);

  const atLimit = value.length >= maxTags;

  const addTag = (name: string, id: number | null) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedNames.has(normalize(trimmed))) {
      setDraft("");
      return;
    }
    if (atLimit) return;
    onChange([...value, { id, name: trimmed }]);
    setDraft("");
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const existing = availableTags.find(
      (t) => normalize(t.name) === normalize(trimmed)
    );
    addTag(trimmed, existing ? existing.id : null);
  };

  const removeTag = (name: string) => {
    onChange(value.filter((t) => normalize(t.name) !== normalize(name)));
  };

  const showCreateOption =
    draft.trim().length > 0 &&
    !suggestions.some((s) => normalize(s.name) === normalize(draft)) &&
    !selectedNames.has(normalize(draft));

  return (
    <View testID={testID}>
      <View style={styles.chipRow}>
        {value.map((t) => (
          <View
            key={`${t.id ?? "new"}-${t.name}`}
            style={[
              styles.chip,
              { borderColor: colors.accent, backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.paper }]}>
              {t.name}
            </Text>
            <TouchableOpacity
              onPress={() => removeTag(t.name)}
              hitSlop={8}
              accessibilityLabel={`Remove tag ${t.name}`}
            >
              <Feather name="x" size={12} color={colors.paper} />
            </TouchableOpacity>
          </View>
        ))}
        {value.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.inkFaint }]}>
            No tags yet
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.inputRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.paperWarm,
          },
          atLimit && styles.inputRowDisabled,
        ]}
      >
        <Feather name="plus" size={14} color={colors.inkSoft} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={atLimit ? `Tag limit reached (${maxTags})` : "Add tag…"}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, { color: colors.ink }]}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!atLimit}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          accessibilityLabel="Add tag"
        />
      </View>

      {!atLimit && (suggestions.length > 0 || showCreateOption) ? (
        <View
          style={[
            styles.suggestionList,
            { borderColor: colors.border, backgroundColor: colors.paper },
          ]}
        >
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              onPress={() => addTag(tag.name, tag.id)}
              activeOpacity={0.7}
              style={styles.suggestionRow}
              accessibilityLabel={`Select tag ${tag.name}`}
            >
              <Feather name="tag" size={12} color={colors.inkSoft} />
              <Text style={[styles.suggestionText, { color: colors.ink }]}>
                {tag.name}
              </Text>
            </TouchableOpacity>
          ))}
          {showCreateOption ? (
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.7}
              style={styles.suggestionRow}
              accessibilityLabel={`Create tag ${draft.trim()}`}
            >
              <Feather name="plus-circle" size={12} color={colors.accent} />
              <Text style={[styles.suggestionText, { color: colors.accent }]}>
                Create &quot;{draft.trim()}&quot;
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.counter, { color: colors.inkFaint }]}>
        {value.length} / {maxTags}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontStyle: "italic",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputRowDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    paddingVertical: 0,
  },
  suggestionList: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  counter: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    textAlign: "right",
  },
});
