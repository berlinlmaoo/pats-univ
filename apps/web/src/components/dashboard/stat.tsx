import { formatCount } from '@pats/shared';
import { Card } from '@/components/ui/card';

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col justify-between px-5 py-4">
      <p className="ktm-label line-clamp-2 text-muted">{label}</p>
      <p className="mt-1.5 text-title1 font-black tabular-nums text-fg">{formatCount(value)}</p>
    </Card>
  );
}
