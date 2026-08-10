import { forwardRef, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { KairosMark, KairosWordmark } from '@/components';
import { haptics, motion, radii, spacing, useTheme } from '@/design';
import { authClient } from '@/lib/auth-client';
import { links } from '@/lib/links';

type AuthProvider = 'apple' | 'google' | 'email';

/**
 * KAIROS — Welcome / Auth entry.
 *
 * Hierarchy: logo → wordmark → quiet statement → auth → legal.
 * The mark is the hero. No giant slogans. No bottom-sheet card.
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const reduce = useReducedMotion();

  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(reduce);

  const social = useCallback(async (provider: 'google' | 'apple') => {
    setError(null);
    setBusy(provider);
    try {
      const { error: err } = await authClient.signIn.social({
        provider,
        callbackURL: '/',
      });
      if (err) setError(err.message ?? 'Sign-in failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(null);
    }
  }, []);

  const compact = winH < 720;
  const markSize = compact ? 112 : 136;
  const wordWidth = compact ? 108 : 124;

  // Mark intro (~1s) → wordmark → statement → auth.
  const d = reduce
    ? { wm: 0, line: 0, auth: 0 }
    : { wm: 980, line: 1180, auth: 1380 };

  const termsUrl = links.terms();
  const privacyUrl = links.privacy();

  return (
    <View style={[styles.root, { backgroundColor: theme.color.bg }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <AmbientGlow accent={theme.color.accent} />

      <View
        style={[
          styles.frame,
          {
            paddingTop: insets.top + spacing[6],
            paddingBottom: Math.max(insets.bottom + spacing[4], spacing[6]),
          },
        ]}
      >
        {/* ---------- Identity ---------- */}
        <View style={styles.identity}>
          <BreathingMark active={introDone && !reduce} size={markSize}>
            <Animated.View
              entering={FadeIn.duration(reduce ? 0 : 200)}
              accessibilityLabel="Kairos"
            >
              <KairosMark
                size={markSize}
                color={theme.color.accent}
                mode={reduce ? 'static' : 'intro'}
                onIntroEnd={() => setIntroDone(true)}
              />
            </Animated.View>
          </BreathingMark>

          <Animated.View
            entering={FadeInDown.delay(d.wm).duration(reduce ? 0 : 420)}
            style={styles.wordmark}
          >
            <KairosWordmark
              width={wordWidth}
              color={theme.color.accent}
              strokeWidth={11}
            />
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(d.line).duration(reduce ? 0 : 380)}
            style={[styles.statement, { color: theme.color.textMuted }]}
          >
            Your sports. Your moments.
          </Animated.Text>
        </View>

        {/* ---------- Actions ---------- */}
        <Animated.View
          entering={FadeInUp.delay(d.auth).duration(reduce ? 0 : 360)}
          style={styles.actions}
        >
          {Platform.OS === 'ios' ? (
            <AuthButton
              tone="apple"
              label="Continue with Apple"
              loading={busy === 'apple'}
              disabled={busy !== null && busy !== 'apple'}
              onPress={() => void social('apple')}
            />
          ) : null}

          <AuthButton
            tone="google"
            label="Continue with Google"
            loading={busy === 'google'}
            disabled={busy !== null && busy !== 'google'}
            onPress={() => void social('google')}
          />

          <Link href="/(auth)/sign-in" asChild>
            <AuthButton
              tone="email"
              label="Continue with email"
              disabled={busy !== null}
            />
          </Link>

          {error ? (
            <Text style={[styles.error, { color: theme.color.danger }]}>{error}</Text>
          ) : null}

          <Text style={[styles.legal, { color: theme.color.textFaint }]}>
            By continuing, you agree to our{' '}
            <LegalLink label="Terms" url={termsUrl} />
            {' '}and{' '}
            <LegalLink label="Privacy" url={privacyUrl} />
            .
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ambient glow — almost imperceptible teal atmosphere behind the mark.      */
/* -------------------------------------------------------------------------- */

function AmbientGlow({ accent }: { accent: string }) {
  const { width, height } = Dimensions.get('window');
  const size = Math.max(width, height) * 1.1;
  return (
    <View pointerEvents="none" style={styles.glowWrap}>
      <View style={{ width: size, height: size, marginTop: height * 0.02 }}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="k-glow" cx="50%" cy="42%" r="48%">
              <Stop offset="0%" stopColor={accent} stopOpacity={0.09} />
              <Stop offset="40%" stopColor={accent} stopOpacity={0.03} />
              <Stop offset="100%" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={size} fill="url(#k-glow)" />
        </Svg>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Post-intro breath — scale 1 → 1.012 → 1. Almost imperceptible.            */
/* -------------------------------------------------------------------------- */

function BreathingMark({
  active,
  size,
  children,
}: {
  active: boolean;
  size: number;
  children: React.ReactNode;
}) {
  const breath = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      breath.value = 1;
      return;
    }
    breath.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.012, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [active, breath]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
    width: size,
    height: size,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/* -------------------------------------------------------------------------- */
/*  Legal link                                                                */
/* -------------------------------------------------------------------------- */

function LegalLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return <Text style={styles.legalLink}>{label}</Text>;
  }
  return (
    <Text
      style={styles.legalLink}
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
    >
      {label}
    </Text>
  );
}

/* -------------------------------------------------------------------------- */
/*  Auth controls                                                             */
/* -------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AuthButtonProps = {
  tone: AuthProvider;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
};

const AuthButton = forwardRef(function AuthButton(
  { tone, label, loading, disabled, onPress }: AuthButtonProps,
  ref: React.ForwardedRef<React.ElementRef<typeof Pressable>>,
) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const isEmail = tone === 'email';

  const onIn = useCallback(() => {
    if (loading || disabled) return;
    scale.value = withSpring(0.98, motion.spring.press);
  }, [scale, loading, disabled]);
  const onOut = useCallback(() => {
    scale.value = withSpring(1, motion.spring.press);
  }, [scale]);
  const handle = useCallback(
    (e: GestureResponderEvent) => {
      if (loading || disabled) return;
      haptics.light();
      onPress?.(e);
    },
    [loading, disabled, onPress],
  );

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const s = toneStyles(tone, theme);

  if (isEmail) {
    return (
      <AnimatedPressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={loading || disabled}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={handle}
        style={[styles.emailBtn, { opacity: disabled ? 0.45 : 1 }, anim]}
      >
        <Text style={[styles.emailLabel, { color: theme.color.textMuted }]}>{label}</Text>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading || disabled}
      onPressIn={onIn}
      onPressOut={onOut}
      onPress={handle}
      style={[
        styles.authBtn,
        {
          backgroundColor: s.bg,
          borderColor: s.border ?? 'transparent',
          borderWidth: s.border ? StyleSheet.hairlineWidth : 0,
          opacity: loading || disabled ? 0.55 : 1,
        },
        anim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={s.fg} />
      ) : (
        <View style={styles.authInner}>
          {tone === 'apple' ? <AppleGlyph color={s.fg} /> : null}
          {tone === 'google' ? <GoogleGlyph /> : null}
          <Text style={[styles.authLabel, { color: s.fg }]}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
});

function toneStyles(tone: AuthProvider, theme: ReturnType<typeof useTheme>) {
  switch (tone) {
    case 'apple':
      // Dark Apple treatment on dark UI — quieter primary than a white slab.
      return { bg: '#0A0A0A', fg: '#FFFFFF', border: 'rgba(255,255,255,0.18)' };
    case 'google':
      return {
        bg: theme.color.surface,
        fg: theme.color.text,
        border: theme.color.borderStrong,
      };
    case 'email':
      return { bg: 'transparent', fg: theme.color.textMuted, border: null as string | null };
  }
}

function AppleGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        fill={color}
        d="M16.37 12.28c.03 3.08 2.7 4.1 2.73 4.12-.02.06-.43 1.46-1.4 2.89-.85 1.24-1.73 2.47-3.12 2.5-1.36.03-1.8-.81-3.36-.81s-2.05.78-3.34.84c-1.34.06-2.36-1.34-3.22-2.57C3.12 16.8 1.7 12.7 3.3 9.92c.8-1.38 2.23-2.25 3.78-2.28 1.33-.03 2.58.89 3.36.89.78 0 2.24-1.1 3.78-.94.64.03 2.45.26 3.61 1.96-.09.06-2.15 1.26-2.46 3.73zM14.6 5.5c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.14.09 2.31-.58 3.03-1.46z"
      />
    </Svg>
  );
}

/** Official four-color Google G paths. */
function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.4l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.7-.4-3.9z"
      />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  glowWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  frame: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: 'space-between',
  },
  identity: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing[4],
  },
  wordmark: {
    marginTop: spacing[5],
  },
  statement: {
    marginTop: spacing[6],
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  actions: {
    gap: spacing[3],
    paddingBottom: spacing[1],
  },
  authBtn: {
    height: 52,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  emailBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    marginTop: spacing[1],
  },
  emailLabel: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  error: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing[1],
  },
  legal: {
    marginTop: spacing[3],
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
});
