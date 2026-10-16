import { Image, StyleSheet, View } from 'react-native';
import { radius, size as sizes, useColors } from '@/theme';
import { Text } from './text';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Member photo, or their initials on the accent tint when there is none yet. */
export function Avatar({ name, photoUrl, large }: { name: string; photoUrl?: string | null; large?: boolean }) {
  const c = useColors();
  const dim = large ? sizes.avatarLg : sizes.avatar;
  const box = { width: dim, height: dim, borderRadius: radius.pill };
  if (photoUrl) return <Image source={{ uri: photoUrl }} style={box} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.center, box, { backgroundColor: c.accentSubtle }]}>
      <Text variant={large ? 'title2' : 'body'} weight={600} style={{ color: c.accentSubtleText }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
