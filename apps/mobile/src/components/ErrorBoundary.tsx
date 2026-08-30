import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/design';
import { Button } from './Button';

const reported = new Set<string>();

function reportOnce(error: Error, info?: ErrorInfo) {
  const key = `${error.name}:${error.message}`.slice(0, 200);
  if (reported.has(key)) return;
  reported.add(key);
  void api('/api/errors', {
    method: 'POST',
    json: {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 1200),
      path: info?.componentStack?.slice(0, 180),
    },
  }).catch(() => undefined);
}

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportOnce(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorFallback
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.color.bg }]}>
      <Text style={[styles.title, { color: theme.color.text }]}>Something broke</Text>
      <Text style={[styles.desc, { color: theme.color.textMuted }]}>
        The screen hit an error. Try again — if it keeps happening, force-quit the app.
      </Text>
      <View style={{ marginTop: spacing[4] }}>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing[6] },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  desc: { fontSize: 14, textAlign: 'center', marginTop: spacing[2], lineHeight: 20 },
});
