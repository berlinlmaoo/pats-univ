import type { CardStatus, MemberStatus, Translator, UserStatus } from '@pats/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';

const CARD_TONE: Record<CardStatus, BadgeTone> = {
  NOT_PRINTED: 'neutral',
  IN_BATCH: 'accent',
  SENT_TO_VENDOR: 'accent',
  RECEIVED_HQ: 'accent',
  ENCODED: 'warning',
  DELIVERED: 'success',
  REVOKED: 'danger',
};

export function CardStatusBadge({ status, t }: { status: CardStatus; t: Translator }) {
  return (
    <Badge tone={CARD_TONE[status]} dot>
      {t(`cardStatus.${status}`)}
    </Badge>
  );
}

export function ActiveBadge({ status, t }: { status: MemberStatus | UserStatus; t: Translator }) {
  return status === 'ACTIVE' ? (
    <Badge tone="success" dot>
      {t('common.active')}
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      {t('common.inactive')}
    </Badge>
  );
}
