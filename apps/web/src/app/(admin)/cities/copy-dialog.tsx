'use client';

import { CITY_COPY_KINDS, translateLoose, type CityCopyKind, type NotificationCopy } from '@pats/shared';
import { MessageSquareText } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n/provider';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { saveCityCopyAction } from '@/lib/hq/cards';
import { cn } from '@/lib/cn';

/**
 * Push copy per city (PRODUCT.md §8): HQ overrides the default text of each member message, in
 * both languages. An empty field keeps the default, which is shown as the placeholder.
 */
export function CityCopyButton({ city, copy }: { city: { id: string; name: string }; copy: NotificationCopy }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<'id' | 'en'>(t.locale);
  const [values, setValues] = useState<NotificationCopy>(copy);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const customised = Object.values(copy).some((v) => v?.id || v?.en);
  const set = (kind: CityCopyKind, text: string) => setValues((prev) => ({ ...prev, [kind]: { ...prev[kind], [lang]: text } }));

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn('w-control-sm px-0', customised && 'text-accent-fg')}
        aria-label={t('cities.copyTitle', { name: city.name })}
        onClick={() => {
          setValues(copy);
          setResult(null);
          setOpen(true);
        }}
      >
        <MessageSquareText aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('cities.copyTitle', { name: city.name })}
        description={t('cities.copyBody')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await saveCityCopyAction(city.id, values);
                  setResult({ ok: res.ok, text: t.loose(res.message ?? (res.ok ? 'common.saved' : 'validation.invalid')) });
                  if (res.ok) setOpen(false);
                })
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {result && !result.ok && <Alert tone="danger">{result.text}</Alert>}
          <div role="group" aria-label={t('common.language')} className="inline-flex self-start rounded-control bg-surface-muted p-1">
            {(['id', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  'h-8 rounded-sm px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  lang === l ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
                )}
              >
                {l === 'id' ? t('common.indonesian') : t('common.english')}
              </button>
            ))}
          </div>
          {CITY_COPY_KINDS.map((kind) => (
            <Field key={kind} label={t(`cities.copyKinds.${kind}`)} htmlFor={`copy-${kind}`} optionalLabel={t('common.optional')}>
              <Textarea
                id={`copy-${kind}`}
                value={values[kind]?.[lang] ?? ''}
                maxLength={240}
                placeholder={translateLoose(lang, `push.${kind}.body`)}
                onChange={(e) => set(kind, e.target.value)}
                className="min-h-16"
                lang={lang}
              />
            </Field>
          ))}
          <p className="text-caption text-muted">{t('cities.copyPlaceholders')}</p>
        </div>
      </Dialog>
    </>
  );
}
