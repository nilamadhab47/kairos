import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { haptics, radii, spacing, useTheme } from '@/design';
import { SettingsIcon, type SettingsIconName } from './SettingsIcon';

/* -------------------------------------------------------------------------- */
/*  Layout constants — one source of truth for the row grid                   */
/* -------------------------------------------------------------------------- */

const ICON_COLUMN = 32; // width of the leading icon slot
const ICON_TO_BODY = 14; // gap between icon column and body
const BODY_TO_ACCESSORY = 12; // gap between body and trailing accessory
const ROW_H_PADDING = spacing[4]; // 16pt
/** Extra top/bottom so title+subtitle rows don't kiss the card edge. */
const ROW_V_PADDING = spacing[5]; // 20pt

/* -------------------------------------------------------------------------- */
/*  Section — eyebrow + grouped surface with correct spacing                  */
/* -------------------------------------------------------------------------- */

export function SettingsSection({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: ViewProps['style'];
}) {
  const theme = useTheme();
  return (
    <View style={[sectionStyles.wrap, style]}>
      <Text style={[sectionStyles.eyebrow, { color: theme.color.textFaint }]}>
        {title.toUpperCase()}
      </Text>
      <SettingsSurface>{children}</SettingsSurface>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing[5],
    marginTop: spacing[6],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: spacing[3],
    paddingHorizontal: spacing[1],
  },
});

/* -------------------------------------------------------------------------- */
/*  Surface — grouped card container for stacked rows                         */
/* -------------------------------------------------------------------------- */

export function SettingsSurface({
  children,
  style,
}: ViewProps & { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        surfaceStyles.wrap,
        { backgroundColor: theme.color.surface, borderColor: theme.color.borderStrong },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const surfaceStyles = StyleSheet.create({
  wrap: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});

/* -------------------------------------------------------------------------- */
/*  Row — HStack: [icon] [title/subtitle body] [switch OR chevron]            */
/* -------------------------------------------------------------------------- */

type RowProps = {
  icon?: SettingsIconName;
  title: string;
  subtitle?: string;
  /** Trailing text (e.g. "Allowed", "v0.1.0"). */
  value?: string;
  /** Custom trailing element (Switch etc). If present, no chevron is shown. */
  trailing?: React.ReactNode;
  /**
   * Content rendered under the body, aligned to the body column (indented
   * past the icon). Use for chip rows inside a settings row.
   */
  bottomContent?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Hide the divider under this row (last row in a surface). */
  isLast?: boolean;
};

export function SettingsRow({
  icon,
  title,
  subtitle,
  value,
  trailing,
  bottomContent,
  destructive,
  disabled,
  onPress,
  isLast,
}: RowProps) {
  const theme = useTheme();
  const iconColor = destructive ? theme.color.danger : theme.color.textMuted;
  const titleColor = destructive ? theme.color.danger : theme.color.text;
  // Chevron when the row is tappable and nothing else owns the accessory slot.
  const showChevron = !trailing && Boolean(onPress);
  const showDivider = !isLast;

  const inner = (
    <View
      style={[
        rowStyles.container,
        // Subtitle rows need a touch more air so text doesn't kiss the
        // card / divider edges; single-line rows stay slightly tighter.
        subtitle || bottomContent
          ? rowStyles.padWithSubtitle
          : rowStyles.padSingle,
      ]}
    >
      {/* Row 1 — icon + body + accessory, always horizontal */}
      <View style={rowStyles.hstack}>
        <View style={rowStyles.iconSlot}>
          {icon ? <SettingsIcon name={icon} color={iconColor} size={20} /> : null}
        </View>

        <View style={rowStyles.body}>
          <Text
            style={[rowStyles.title, { color: titleColor }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[rowStyles.subtitle, { color: theme.color.textMuted }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {value ? (
          <Text
            style={[rowStyles.value, { color: theme.color.textMuted }]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {trailing ? <View style={rowStyles.accessory}>{trailing}</View> : null}
        {showChevron ? (
          <View style={rowStyles.chevronSlot}>
            <SettingsIcon
              name="chevron-right"
              color={theme.color.textFaint}
              size={16}
            />
          </View>
        ) : null}
      </View>

      {/* Row 2 (optional) — chip rack aligned under the body column */}
      {bottomContent ? (
        <View style={rowStyles.bottomWrap}>{bottomContent}</View>
      ) : null}
    </View>
  );

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={
        onPress
          ? () => {
              haptics.light();
              onPress();
            }
          : undefined
      }
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        {
          borderBottomColor: theme.color.border,
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
          backgroundColor:
            pressed && onPress ? theme.color.surfacePressed : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {inner}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  // Padding lives on the inner View (not Pressable) so RN press-style
  // updates never drop paddingVertical when merging style arrays.
  container: {
    flexDirection: 'column',
    paddingHorizontal: ROW_H_PADDING,
  },
  padSingle: {
    paddingVertical: spacing[4], // 16
  },
  padWithSubtitle: {
    paddingVertical: ROW_V_PADDING, // 20
  },
  hstack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconSlot: {
    width: ICON_COLUMN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: ICON_TO_BODY,
  },
  body: {
    flex: 1,
    minWidth: 0,
    marginRight: BODY_TO_ACCESSORY,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 160,
    marginRight: 6,
  },
  accessory: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronSlot: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomWrap: {
    // Align chip rack with body column (past the icon)
    marginTop: spacing[4],
    marginBottom: spacing[1],
    marginLeft: ICON_COLUMN + ICON_TO_BODY,
    paddingRight: spacing[1],
  },
});
