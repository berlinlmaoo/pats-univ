import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ColorValue } from 'react-native';
import { CalendarDays, CreditCard, Gift, MessagesSquare, UserRound } from 'lucide-react-native';
import { tabOptions } from '@/features/tab-options';
import { useT } from '@/i18n';
import { size, useColors } from '@/theme';

export default function MemberTabs() {
  const t = useT();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const icon = (Icon: typeof CreditCard) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Icon size={size.icon + 2} color={String(color)} strokeWidth={1.75} />;
    };
  return (
    <Tabs screenOptions={tabOptions(c, insets.bottom)}>
      <Tabs.Screen name="card" options={{ title: t('app.tabCard'), tabBarIcon: icon(CreditCard) }} />
      <Tabs.Screen name="events" options={{ title: t('app.tabEvents'), tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen name="rewards" options={{ title: t('app.tabRewards'), tabBarIcon: icon(Gift) }} />
      <Tabs.Screen name="hub" options={{ title: t('app.tabHub'), tabBarIcon: icon(MessagesSquare) }} />
      <Tabs.Screen name="profile" options={{ title: t('app.tabProfile'), tabBarIcon: icon(UserRound) }} />
    </Tabs>
  );
}
