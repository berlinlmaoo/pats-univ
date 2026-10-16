import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, UserRound } from 'lucide-react-native';
import { tabOptions } from '@/features/tab-options';
import { useT } from '@/i18n';
import { size, useColors } from '@/theme';

export default function AdminTabs() {
  const t = useT();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={tabOptions(c, insets.bottom)}>
      <Tabs.Screen
        name="tools"
        options={{
          title: t('app.tabAdmin'),
          tabBarIcon: ({ color }) => <ShieldCheck size={size.icon + 2} color={String(color)} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('app.tabProfile'),
          tabBarIcon: ({ color }) => <UserRound size={size.icon + 2} color={String(color)} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
