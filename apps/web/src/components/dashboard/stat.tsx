import { formatCount } from '@pats/shared';
import { Card } from '@/components/ui/card';

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-5 py-4">
      <p className="truncate text-body-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-title1 tabular-nums text-fg">{formatCount(value)}</p>
    </Card>
  );
}
