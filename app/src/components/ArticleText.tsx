import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  articleLineHeight,
  articleParagraphSpacing,
  fonts,
  fontSize,
} from "../theme";
import { toBionic } from "../utils/bionicReading";

type Props = {
  /** Article body already split into paragraphs, in reading order. */
  paragraphs: string[];
  bionicReading: boolean;
  color: string;
  /** Body font size; line height and paragraph gap are derived from it. */
  size?: number;
  /** Rendered as a single paragraph when `paragraphs` is empty. */
  fallbackText?: string;
  testID?: string;
};

/**
 * Renders plain-text article content one `<Text>` per paragraph, separated by
 * the same gap `SanitizedHtmlContent` gives a `<p>` boundary. Rendering the
 * whole body as one string instead would lose the paragraph breaks entirely,
 * since the parser collapses source newlines.
 */
function ArticleTextImpl({
  paragraphs,
  bionicReading,
  color,
  size = fontSize.bodyLg,
  fallbackText,
  testID,
}: Props) {
  const items =
    paragraphs.length > 0 ? paragraphs : fallbackText ? [fallbackText] : [];
  if (items.length === 0) return null;

  const textStyle = {
    color,
    fontSize: size,
    lineHeight: articleLineHeight(size),
  };

  return (
    <View
      style={{ gap: articleParagraphSpacing(size) }}
      testID={testID}
      accessible={false}
    >
      {items.map((paragraph, index) => (
        <Text key={index} style={[styles.paragraph, textStyle]}>
          {bionicReading ? renderBionic(paragraph) : paragraph}
        </Text>
      ))}
    </View>
  );
}

function renderBionic(paragraph: string): React.ReactNode {
  return toBionic(paragraph).map((token, index) =>
    token.kind === "space" ? (
      token.text
    ) : (
      <Text key={index}>
        <Text style={styles.bionicBold}>{token.bold}</Text>
        {token.rest}
      </Text>
    )
  );
}

export const ArticleText = React.memo(ArticleTextImpl);

const styles = StyleSheet.create({
  paragraph: {
    fontFamily: fonts.sans,
  },
  bionicBold: {
    fontWeight: "700",
  },
});
