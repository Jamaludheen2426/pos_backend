import prisma from './prisma';

type Resource = 'stores' | 'users' | 'products';

/**
 * Throws a 402-style error if the company has reached its plan limit for the
 * given resource. -1 in the plan means unlimited.
 */
export async function enforcePlanLimit(companyId: number, resource: Resource): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { plan: true },
  });
  if (!company) throw new PlanLimitError('Company not found', 404);

  const limitMap: Record<Resource, number> = {
    stores:   company.plan.maxStores,
    users:    company.plan.maxUsers,
    products: company.plan.maxProducts,
  };
  const limit = limitMap[resource];
  if (limit === -1) return; // unlimited plan

  const countMap: Record<Resource, () => Promise<number>> = {
    stores:   () => prisma.store.count({ where: { companyId, isActive: true } }),
    users:    () => prisma.user.count({ where: { companyId, isActive: true } }),
    products: () => prisma.product.count({ where: { companyId, isActive: true } }),
  };
  const current = await countMap[resource]();

  if (current >= limit) {
    throw new PlanLimitError(
      `Plan limit reached: your "${company.plan.name}" plan allows ${limit} ${resource}. ` +
      `Upgrade your plan to add more.`,
      402,
    );
  }
}

export class PlanLimitError extends Error {
  constructor(message: string, public statusCode: number = 402) {
    super(message);
    this.name = 'PlanLimitError';
  }
}
