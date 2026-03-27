import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// GET /api/v1/subscriptions — list all subscriptions with company info (creator only)
export const listSubscriptions = async (_req: Request, res: Response): Promise<void> => {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      company: { select: { id: true, name: true, email: true, status: true } },
      plan: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(subscriptions);
};

// POST /api/v1/subscriptions — assign plan to company (creator only)
export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  const { companyId, planId, startDate, endDate, nextBillingAt, razorpaySubId } = req.body;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    res.status(404).json({ message: 'Company not found' });
    return;
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    res.status(404).json({ message: 'Plan not found' });
    return;
  }

  const subscription = await prisma.subscription.create({
    data: {
      companyId,
      planId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      nextBillingAt: nextBillingAt ? new Date(nextBillingAt) : undefined,
      razorpaySubId,
    },
    include: {
      company: { select: { id: true, name: true } },
      plan: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(subscription);
};

// PATCH /api/v1/subscriptions/:id — update status/dates (creator only)
export const updateSubscription = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status, startDate, endDate, nextBillingAt, razorpaySubId } = req.body;

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (startDate !== undefined) data.startDate = new Date(startDate);
  if (endDate !== undefined) data.endDate = new Date(endDate);
  if (nextBillingAt !== undefined) data.nextBillingAt = new Date(nextBillingAt);
  if (razorpaySubId !== undefined) data.razorpaySubId = razorpaySubId;

  const subscription = await prisma.subscription.update({
    where: { id: Number(id) },
    data,
    include: {
      company: { select: { id: true, name: true } },
      plan: { select: { id: true, name: true } },
    },
  });
  res.json(subscription);
};
