import 'server-only';
import { can } from '@pats/shared';
import { requireCityAccess, type AuthUser } from '../auth/current-user';
import { AppError } from '../http/errors';
import { atomic } from './transaction';

export async function setPromoter(admin: AuthUser, memberId: string, enabled: boolean) {
  if (!can(admin.role, 'promoter.manage')) throw new AppError('FORBIDDEN', 403);
  return atomic(async tx => {
    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) throw new AppError('NOT_FOUND', 404);
    requireCityAccess(admin, member.cityId);
    await tx.member.update({ where: { id: memberId }, data: { isPromoter: enabled, promoterSince: enabled ? new Date() : null } });
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'promoter.flag', targetType: 'Member', targetId: memberId, meta: { enabled } } });
  });
}
