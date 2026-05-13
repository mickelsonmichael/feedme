import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();
  const [contentHeight, setContentHeight] = React.useState(220);
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");

  const sourceHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; media-src data: blob: https: http:; style-src 'unsafe-inline';" />
    <style>
      body {
        margin: 0;
        padding: 0;
        color: ${colors.ink} !important;
        background: transparent !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ${fonts.sans};
        font-size: 17px;
        line-height: 1.45;
        word-wrap: break-word;
      }
      #feedme-content,
      #feedme-content :not(a) {
        color: ${colors.ink} !important;
      }
      #feedme-content,
      #feedme-content *:not(img):not(video):not(svg):not(path):not(g):not(canvas):not(iframe) {
        background: transparent !important;
      }
      #feedme-content a,
      #feedme-content a * {
        color: ${colors.accent} !important;
      }
      img, video {
        max-width: 100%;
        height: auto;
      }
      pre, code { white-space: pre-wrap; }
    </style>
  </head>
  <body><div id="feedme-content">${html}</div></body>
</html>`;
  const injectedJavaScript = `
    (function () {
      function reportHeight() {
        var body = document.body;
        var doc = document.documentElement;
        if (!body || !doc || !window.ReactNativeWebView) return;
        var height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          doc.clientHeight,
          doc.scrollHeight,
          doc.offsetHeight
        );
        window.ReactNativeWebView.postMessage(String(height));
      }
      window.addEventListener("load", reportHeight);
      window.addEventListener("resize", reportHeight);
      setTimeout(reportHeight, 0);
      setTimeout(reportHeight, 150);
      true;
    })();
  `;

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: colors.border, backgroundColor: colors.paperWarm },
      ]}
    >
      <WebView
        source={{ html: sourceHtml }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        injectedJavaScript={injectedJavaScript}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        onMessage={(event) => {
          const parsed = Number(event.nativeEvent.data);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          setContentHeight(Math.max(220, Math.ceil(parsed)));
        }}
        style={[styles.webview, { height: contentHeight }]}
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
    marginTop: spacing.xs,
  },
});
