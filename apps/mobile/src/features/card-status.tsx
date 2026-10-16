import type { CardStatus } from '@pats/shared';
import { Badge, type BadgeTone } from '@/components/badge';
import { useI18n } from '@/i18n';

/** Same colours as the dashboard (DESIGN.md §2, card status badges). */
export const CARD_TONE: Record<CardStatus, BadgeTone> = {
  NOT_PRINTED: 'neutral',
  IN_BATCH: 'accent',
  SENT_TO_VENDOR: 'accent',
  RECEIVED_HQ: 'accent',
  ENCODED: 'warning',
  DELIVERED: 'success',
  REVOKED: 'danger',
};

/** Crew wording ("Encoded", "Delivered"); members see `cardStatusMember` instead. */
export function CardStatusBadge({ status }: { status: CardStatus }) {
  const { t } = useI18n();
  return <Badge dot tone={CARD_TONE[status]} label={t(`cardStatus.${status}`)} />;
}
