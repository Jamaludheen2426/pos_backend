import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listDiscountRules = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const discountRules = await prisma.discountRule.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(discountRules);
};

export const createDiscountRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { code, type, value, minOrderAmt, maxUses, expiresAt } = req.body;

  const discountRule = await prisma.discountRule.create({
    data: {
      companyId,
      code,
      type,
      value,
      minOrderAmt: minOrderAmt || null,
      maxUses: maxUses || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
  res.status(201).json(discountRule);
};

export const updateDiscountRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  const data = { ...req.body };
  if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);

  const discountRule = await prisma.discountRule.update({
    where: { id: Number(id), companyId },
    data,
  });
  res.json(discountRule);
};

export const deleteDiscountRule = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  await prisma.discountRule.update({
    where: { id: Number(id), companyId },
    data: { isActive: false },
  });
  res.json({ message: 'Discount rule deactivated' });
};

export const validateDiscountCode = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ message: 'Discount code is required' });
    return;
  }

  const rule = await prisma.discountRule.findFirst({
    where: { companyId, code, isActive: true },
  });

  if (!rule) {
    res.status(404).json({ message: 'Discount code not found' });
    return;
  }

  if (rule.expiresAt && rule.expiresAt < new Date()) {
    res.status(400).json({ message: 'Discount code has expired' });
    return;
  }

  if (rule.maxUses && rule.usedCount >= rule.maxUses) {
    res.status(400).json({ message: 'Discount code has reached maximum uses' });
    return;
  }

  res.json(rule);
};
