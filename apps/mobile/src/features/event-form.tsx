import { formatDate, parseIsoDate, zoneLabel, type EventFormMetaResponse } from '@pats/shared';
import { Check } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { DateTimeField } from '@/components/date-time-field';
import { Field, Input } from '@/components/field';
import { Notice } from '@/components/notice';
import { Text } from '@/components/text';
import { useI18n } from '@/i18n';
import { ApiFailure, errorKey } from '@/lib/api';
import { radius, size, space, useColors } from '@/theme';

export interface EventFormValues {
  title: string;
  description: string;
  venueId: string;
  date: string;
  startTime: string;
  endTime: string;
  opensBeforeMinutes: string;
  capacity: string;
  publish: boolean;
}

const RANGE: Record<string, { min: number; max: number }> = {
  opensBeforeMinutes: { min: 0, max: 720 },
  capacity: { min: 1, max: 100_000 },
};

/** Create/edit form for the crew app. Same fields and validation as the dashboard. */
export function EventForm({
  initial,
  meta,
  submitLabel,
  onSubmit,
}: {
  initial: EventFormValues;
  meta: EventFormMetaResponse;
  submitLabel: string;
  /** Resolves null on success, or the API failure to show. */
  onSubmit: (values: EventFormValues) => Promise<ApiFailure | null>;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const [values, setValues] = useState(initial);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const err = (field: string) => {
    const k = failure?.fields[field];
    return k ? t.loose(k, RANGE[field]) : undefined;
  };
  const zone = zoneLabel(new Date(), meta.city.timezone);
  const d = parseIsoDate(values.date);
  const dateLabel = d ? formatDate(new Date(Date.UTC(d.year, d.month - 1, d.day, 12)), locale, { timeZone: 'UTC' }) : values.date;

  const submit = async () => {
    setBusy(true);
    const res = await onSubmit(values);
    setBusy(false);
    setFailure(res);
    if (res?.fields.title) titleRef.current?.focus();
  };

  return (
    <View style={styles.form}>
      <Field label={t('events.eventTitle')} error={err('title')}>
        <Input
          ref={titleRef}
          value={values.title}
          onChangeText={(v) => set('title', v)}
          placeholder={t('events.eventTitlePlaceholder')}
          invalid={Boolean(err('title'))}
          returnKeyType="next"
          autoFocus={!initial.title}
        />
      </Field>

      <Field label={t('events.date')} error={err('date')}>
        <DateTimeField mode="date" value={values.date} display={dateLabel} label={t('events.date')} onChange={(v) => set('date', v)} invalid={Boolean(err('date'))} />
      </Field>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label={`${t('events.startTime')} (${zone})`} error={err('startTime')}>
            <DateTimeField mode="time" value={values.startTime} display={values.startTime.replace(':', '.')} label={t('events.startTime')} onChange={(v) => set('startTime', v)} />
          </Field>
        </View>
        <View style={styles.flex}>
          <Field label={t('events.endTime')} error={err('endTime')}>
            <DateTimeField mode="time" value={values.endTime} display={values.endTime.replace(':', '.')} label={t('events.endTime')} onChange={(v) => set('endTime', v)} />
          </Field>
        </View>
      </View>
      <Text variant="caption" tone="textMuted" style={styles.hintUp}>
        {t('events.endHint')}
      </Text>

      <Field label={t('events.venue')} error={err('venueId')}>
        <Card style={styles.clip} accessibilityRole="radiogroup">
          {[{ id: '', name: t('app.eventFormVenueNone') }, ...meta.venues].map((v, i) => {
            const selected = values.venueId === v.id;
            return (
              <Pressable
                key={v.id || 'none'}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => set('venueId', v.id)}
                style={({ pressed }) => [
                  styles.option,
                  i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth * 2 },
                  pressed && { backgroundColor: c.surfaceHover },
                ]}
              >
                <Text variant="body" style={styles.flex} tone={v.id ? 'text' : 'textMuted'}>
                  {v.name}
                </Text>
                {selected ? <Check size={size.icon} color={c.accentText} strokeWidth={2} /> : null}
              </Pressable>
            );
          })}
        </Card>
      </Field>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label={`${t('events.opensBefore')} (${t('settings.unitMinutes')})`} error={err('opensBeforeMinutes')}>
            <Input
              value={values.opensBeforeMinutes}
              onChangeText={(v) => set('opensBeforeMinutes', v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              invalid={Boolean(err('opensBeforeMinutes'))}
              accessibilityHint={t('events.opensBeforeHint')}
            />
          </Field>
        </View>
        <View style={styles.flex}>
          <Field label={`${t('events.capacity')} (${t('common.optional').toLowerCase()})`} error={err('capacity')}>
            <Input
              value={values.capacity}
              onChangeText={(v) => set('capacity', v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              invalid={Boolean(err('capacity'))}
            />
          </Field>
        </View>
      </View>
      {!err('opensBeforeMinutes') && !err('capacity') && (
        <Text variant="caption" tone="textMuted" style={styles.hintUp}>
          {t('events.opensBeforeHint')}
        </Text>
      )}

      <Field label={t('events.description')} error={err('description')}>
        <Input
          value={values.description}
          onChangeText={(v) => set('description', v)}
          placeholder={t('events.descriptionPlaceholder')}
          multiline
          style={styles.multiline}
          textAlignVertical="top"
        />
      </Field>

      <Card style={styles.switchRow}>
        <View style={styles.flex}>
          <Text variant="body" weight={500}>
            {t('events.publish')}
          </Text>
          <Text variant="caption" tone="textMuted">
            {t('events.publishHint')}
          </Text>
        </View>
        <Switch
          value={values.publish}
          onValueChange={(v) => set('publish', v)}
          trackColor={{ true: c.accent, false: c.borderStrong }}
          accessibilityLabel={t('events.publish')}
        />
      </Card>

      {failure && Object.keys(failure.fields).length === 0 && <Notice tone="danger" text={t.loose(errorKey(failure.code))} />}
      <Button label={submitLabel} loading={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  hintUp: { marginTop: -space[2] },
  clip: { overflow: 'hidden', borderRadius: radius.control },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], minHeight: size.controlLg },
  multiline: { height: size.controlLg * 2.5, paddingTop: space[3] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
});

/** Request body: numbers as numbers, empty capacity left out. */
export function toEventBody(v: EventFormValues) {
  return {
    title: v.title,
    description: v.description,
    venueId: v.venueId,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    opensBeforeMinutes: v.opensBeforeMinutes,
    capacity: v.capacity,
    publish: v.publish,
  };
}
