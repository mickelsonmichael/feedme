import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

const MIN_WEBVIEW_HEIGHT = 220;
const IMMEDIATE_HEIGHT_CHECK_MS = 0;
const HEIGHT_REMEASURE_DELAY_MS = 150;
const INJECTED_HEIGHT_SCRIPT = `
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
    setTimeout(reportHeight, ${IMMEDIATE_HEIGHT_CHECK_MS});
    setTimeout(reportHeight, ${HEIGHT_REMEASURE_DELAY_MS});
    true;
  })();
`;

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();
  const [contentHeight, setContentHeight] = React.useState(MIN_WEBVIEW_HEIGHT);
  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");

  // Inline CSS is required for injecting runtime theme colors into the HTML.
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
        background: ${colors.paper} !important;
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
  return (
    <View style={styles.wrap}>
      <WebView
        source={{ html: sourceHtml }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        injectedJavaScript={INJECTED_HEIGHT_SCRIPT}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        backgroundColor="transparent"
        onMessage={(event) => {
          const parsed = Number(event.nativeEvent.data);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          setContentHeight(Math.max(MIN_WEBVIEW_HEIGHT, Math.ceil(parsed)));
        }}
        style={[styles.webview, { height: contentHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: MIN_WEBVIEW_HEIGHT,
  },
  webview: {
    minHeight: MIN_WEBVIEW_HEIGHT,
    marginTop: spacing.xs,
  },
});
