/** Encoded / total, as a thin bar with its label (the label is what screen readers get). */
export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <p className="text-caption tabular-nums text-muted">{label}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
