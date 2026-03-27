import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// GET /api/v1/companies — list all (creator only)
export const listCompanies = async (_req: Request, res: Response): Promise<void> => {
  const companies = await prisma.company.findMany({
    include: { plan: true, settings: true, _count: { select: { users: true, stores: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(companies);
};

// POST /api/v1/companies — create new client
export const createCompany = async (req: Request, res: Response): Promise<void> => {
  const { name, email, phone, planId, ownerName, ownerEmail, ownerPassword } = req.body;

  const existing = await prisma.company.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ message: 'Company email already exists' });
    return;
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    res.status(400).json({ message: 'Invalid plan' });
    return;
  }

  const company = await prisma.company.create({
    data: {
      name,
      email,
      phone,
      planId,
      settings: {
        create: {
          offlineAllowedDays: 0,
          offlineMode: plan.hasOfflineMode,
        },
      },
      stores: { create: { name: 'Main Store' } },
    },
    include: { settings: true, stores: true },
  });

  // Create owner user
  const passwordHash = await bcrypt.hash(ownerPassword, 10);
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: ownerName,
      email: ownerEmail,
      passwordHash,
      role: 'OWNER',
      storeId: company.stores[0].id,
    },
  });

  res.status(201).json(company);
};

// PATCH /api/v1/companies/:id/status — suspend / activate
export const updateCompanyStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;

  const company = await prisma.company.update({
    where: { id: Number(id) },
    data: { status },
  });
  res.json(company);
};

// PATCH /api/v1/companies/:id/modules — toggle modules per client
export const updateModules = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const modules = req.body;

  const settings = await prisma.companySettings.update({
    where: { companyId: Number(id) },
    data: modules,
  });
  res.json(settings);
};

// PATCH /api/v1/companies/:id/offline-days
export const updateOfflineDays = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { offlineAllowedDays } = req.body;

  const settings = await prisma.companySettings.update({
    where: { companyId: Number(id) },
    data: { offlineAllowedDays: Number(offlineAllowedDays) },
  });
  res.json(settings);
};

// POST /api/v1/companies/:id/impersonate — get temp token for debugging
export const impersonateCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const company = await prisma.company.findUnique({
    where: { id: Number(id) },
    include: { users: { where: { role: 'OWNER' }, take: 1 } },
  });
  if (!company || !company.users[0]) {
    res.status(404).json({ message: 'Company or owner not found' });
    return;
  }

  const { signAccessToken } = await import('../lib/jwt');
  const token = signAccessToken({
    userId: company.users[0].id,
    companyId: company.id,
    role: company.users[0].role,
    platform: 'web',
  });

  res.json({ accessToken: token, note: 'Impersonation token — 15min only' });
};

// POST /api/v1/companies/:id/force-logout — revoke all sessions for a company
export const forceLogoutCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const result = await prisma.refreshToken.updateMany({
    where: {
      user: { companyId: Number(id) },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  res.json({ message: `Revoked ${result.count} sessions` });
};

// DELETE /api/v1/companies/:id — delete a client and all related data
export const deleteCompany = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = Number(id);

  // Soft approach: check for sales first
  const salesCount = await prisma.sale.count({ where: { companyId } });
  if (salesCount > 0) {
    // Has sales history — mark as EXPIRED instead of hard delete
    await prisma.company.update({ where: { id: companyId }, data: { status: 'EXPIRED' } });
    // Revoke all sessions
    await prisma.refreshToken.updateMany({
      where: { user: { companyId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.json({ message: 'Company expired (has sales history — cannot hard delete)' });
    return;
  }

  // No sales — safe to hard delete cascade
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { user: { companyId } } }),
    prisma.stock.deleteMany({ where: { companyId } }),
    prisma.stockMovement.deleteMany({ where: { companyId } }),
    prisma.user.deleteMany({ where: { companyId } }),
    prisma.store.deleteMany({ where: { companyId } }),
    prisma.product.deleteMany({ where: { companyId } }),
    prisma.companySettings.deleteMany({ where: { companyId } }),
    prisma.subscription.deleteMany({ where: { companyId } }),
    prisma.company.delete({ where: { id: companyId } }),
  ]);
  res.json({ message: 'Company deleted' });
};

// PATCH /api/v1/companies/:id/branding — update logo + colors
export const updateBranding = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { logoUrl, primaryColor } = req.body;

  const settings = await prisma.companySettings.update({
    where: { companyId: Number(id) },
    data: { logoUrl, primaryColor },
  });
  res.json(settings);
};
