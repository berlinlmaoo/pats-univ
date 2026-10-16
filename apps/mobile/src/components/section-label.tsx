import { space } from '@/theme';
import { Text } from './text';

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" tone="textMuted" uppercase style={{ marginTop: space[2], marginLeft: space[1] }}>
      {children}
    </Text>
  );
}
