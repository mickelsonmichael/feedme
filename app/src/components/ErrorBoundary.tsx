import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { colors, fonts, fontSize, spacing } from "../theme";
import {
  buildGitHubIssueUrl,
  clearCrashReport,
  CrashReport,
  persistCrash,
} from "../crashReporter";

type Props = { children: React.ReactNode };
type State = { crash: CrashReport | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { crash: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      crash: {
        message: error.message,
        stack: (error.stack ?? "").slice(0, 20000).trim(),
        platform: Platform.OS,
        platformVersion: Platform.Version,
        timestamp: new Date().toISOString(),
      },
    };
  }

  override componentDidCatch(error: Error): void {
    persistCrash(error);
  }

  private dismiss = () => {
    clearCrashReport().then(() => this.setState({ crash: null }));
  };

  private report = () => {
    const { crash } = this.state;
    if (!crash) return;
    Linking.openURL(buildGitHubIssueUrl(crash)).finally(() => {
      clearCrashReport().then(() => this.setState({ crash: null }));
    });
  };

  override render() {
    if (this.state.crash) {
      return (
        <View style={styles.container}>
          <Text style={styles.heading}>Something went wrong</Text>
          <Text style={styles.body}>
            The app ran into an unexpected error. You can report it to help us
            fix it.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.reportButton]}
              onPress={this.report}
              activeOpacity={0.8}
            >
              <Text style={styles.reportButtonText}>Report Issue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={this.dismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heading: {
    fontFamily: fonts.sans,
    fontSize: fontSize.h2,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 20,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
    width: "100%",
    maxWidth: 280,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 6,
    alignItems: "center",
  },
  reportButton: {
    backgroundColor: colors.accent,
  },
  reportButtonText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
    color: colors.paper,
  },
  dismissText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.inkSoft,
  },
});
