'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '@/components/i18n/provider';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * Modal built on the platform <dialog>: focus trap, Esc to close and the top layer come from
 * the browser. Controlled with `open`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (outside the panel) closes.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-card border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-scrim',
        'open:animate-fade-up',
        size === 'sm' ? 'max-w-sm' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div className="min-w-0">
              <h2 className="text-title3 text-fg">{title}</h2>
              {description && <p className="mt-1 text-body-sm text-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="sm" className="-mr-2 -mt-1 w-control-sm px-0" onClick={onClose} aria-label={t('common.close')}>
              <X aria-hidden="true" />
            </Button>
          </div>
          {children && <div className="overflow-y-auto px-6 py-3">{children}</div>}
          {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={body}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
