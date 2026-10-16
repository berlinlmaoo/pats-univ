import { Redirect } from 'expo-router';
import { useAuth } from '@/auth';

export default function Index() {
  const { status, me } = useAuth();
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return <Redirect href={me?.user.role === 'MEMBER' ? '/card' : '/tools'} />;
}
