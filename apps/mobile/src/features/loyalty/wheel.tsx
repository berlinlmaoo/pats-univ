import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';
import { wheelAngle } from '@pats/shared';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { motion, radius, size, space, useColors } from '@/theme';

/** The animation lands on the result returned by the server; it never picks a prize. */
export function PrizeWheel({
  rewards,
  winner,
  running,
}: {
  rewards: { id: string; name: string }[];
  winner: { id: string; name: string } | null;
  running: boolean;
}) {
  const c = useColors();
  const t = useT();
  const [spin] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!winner) return;
    const angle = wheelAngle(rewards.map(r => r.id), winner.id);
    spin.setValue(0);
    const animation = Animated.timing(spin, {
      toValue: angle,
      duration: reduced ? 0 : motion.wheel,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [winner, rewards, spin, reduced]);
  const side = size.qr,
    center = side / 2,
    r = center - space[2];
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={winner?.name ?? rewards.map((p) => p.name).join(', ')}
    >
      <View style={[styles.pointer, { backgroundColor: c.accent }]} />
      <Animated.View
        style={{
          transform: [
            {
              rotate: spin.interpolate({
                inputRange: [0, 360],
                outputRange: ['0deg', '360deg'],
              }),
            },
          ],
        }}
      >
        <Svg width={side} height={side} viewBox={`0 0 ${side} ${side}`}>
          {rewards.map((p, i) => {
            const start = (i / rewards.length) * Math.PI * 2 - Math.PI / 2;
            const end = ((i + 1) / rewards.length) * Math.PI * 2 - Math.PI / 2;
            const path =
              rewards.length === 1
                ? undefined
                : `M${center} ${center}L${center + r * Math.cos(start)} ${center + r * Math.sin(start)}A${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${center + r * Math.cos(end)} ${center + r * Math.sin(end)}Z`;
            return path ? (
              <Path
                key={p.id}
                d={path}
                fill={i % 2 ? c.accentSubtle : c.surfaceMuted}
                stroke={c.borderStrong}
              />
            ) : (
              <Circle
                key={p.id}
                cx={center}
                cy={center}
                r={r}
                fill={c.accentSubtle}
              />
            );
          })}
          {rewards.map((p, i) => {
            const angle = ((i + 0.5) / rewards.length) * Math.PI * 2 - Math.PI / 2;
            return <SvgText key={`label-${p.id}`} x={center + r * 0.6 * Math.cos(angle)} y={center + r * 0.6 * Math.sin(angle)} fill={c.text} textAnchor="middle">{i + 1}</SvgText>;
          })}
          <Circle cx={center} cy={center} r={space[5]} fill={c.primary} />
        </Svg>
      </Animated.View>
      {running && (
        <Text variant="caption" tone="textMuted">
          {t('common.loading')}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[2] },
  pointer: { width: space[2], height: space[4], borderRadius: radius.sm },
});
