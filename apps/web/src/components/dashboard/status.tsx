import type { CardBatchStatus, CardStatus, CheckInMethod, EventPhase, MemberStatus, Translator, UserStatus } from '@pats/shared';
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

const PHASE_TONE: Record<EventPhase, BadgeTone> = {
  draft: 'neutral',
  upcoming: 'accent',
  open: 'success',
  closed: 'warning',
  ended: 'neutral',
};

export function EventPhaseBadge({ phase, t }: { phase: EventPhase; t: Translator }) {
  return (
    <Badge tone={PHASE_TONE[phase]} dot>
      {t(`eventPhase.${phase}`)}
    </Badge>
  );
}

/** Manual check-ins stand out: HQ audits how often the fallback is used. */
const METHOD_TONE: Record<CheckInMethod, BadgeTone> = { NFC: 'accent', APP_QR: 'neutral', MANUAL: 'warning' };

export function MethodBadge({ method, t }: { method: CheckInMethod; t: Translator }) {
  return <Badge tone={METHOD_TONE[method]}>{t(`checkInMethod.${method}`)}</Badge>;
}

const BATCH_TONE: Record<CardBatchStatus, BadgeTone> = {
  EXPORTED: 'neutral',
  SENT_TO_VENDOR: 'accent',
  RECEIVED_HQ: 'accent',
  ENCODING: 'warning',
  SHIPPED_TO_CITY: 'accent',
  DONE: 'success',
};

export function BatchStatusBadge({ status, t }: { status: CardBatchStatus; t: Translator }) {
  return (
    <Badge tone={BATCH_TONE[status]} dot>
      {t(`batchStatus.${status}`)}
    </Badge>
  );
}
