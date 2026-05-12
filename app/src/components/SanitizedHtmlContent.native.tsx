import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");

  const sourceHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        padding: 0;
        color: ${colors.ink};
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ${fonts.sans};
        font-size: 17px;
        line-height: 1.45;
        word-wrap: break-word;
      }
      img, video {
        max-width: 100%;
        height: auto;
      }
      a { color: ${colors.accent}; }
      pre, code { white-space: pre-wrap; }
    </style>
  </head>
  <body>${html}</body>
</html>`;

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <WebView
        source={{ html: sourceHtml }}
        originWhitelist={["*"]}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        scrollEnabled
        nestedScrollEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 220,
  },
  webview: {
    minHeight: 220,
    height: 360,
    marginTop: spacing.xs,
  },
});
