import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// GET /api/v1/plans — list all plans (creator only)
export const listPlans = async (_req: Request, res: Response): Promise<void> => {
  const plans = await prisma.plan.findMany({
    include: { _count: { select: { companies: true, subscriptions: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(plans);
};

// POST /api/v1/plans — create new plan (creator only)
export const createPlan = async (req: Request, res: Response): Promise<void> => {
  const { name, maxStores, maxUsers, maxProducts, hasMobileApp, hasOfflineMode, hasAdvancedReports } = req.body;

  const existing = await prisma.plan.findUnique({ where: { name } });
  if (existing) {
    res.status(409).json({ message: 'Plan name already exists' });
    return;
  }

  const plan = await prisma.plan.create({
    data: { name, maxStores, maxUsers, maxProducts, hasMobileApp, hasOfflineMode, hasAdvancedReports },
  });
  res.status(201).json(plan);
};

// PATCH /api/v1/plans/:id — update plan (creator only)
export const updatePlan = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const data = req.body;

  const plan = await prisma.plan.update({
    where: { id: Number(id) },
    data,
  });
  res.json(plan);
};

// DELETE /api/v1/plans/:id — delete plan (creator only)
export const deletePlan = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const plan = await prisma.plan.findUnique({
    where: { id: Number(id) },
    include: { _count: { select: { companies: true } } },
  });

  if (!plan) {
    res.status(404).json({ message: 'Plan not found' });
    return;
  }

  if (plan._count.companies > 0) {
    res.status(400).json({ message: 'Cannot delete plan with active companies' });
    return;
  }

  await prisma.plan.delete({ where: { id: Number(id) } });
  res.json({ message: 'Plan deleted' });
};
