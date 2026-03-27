import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listTaxRates = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const taxRates = await prisma.taxRate.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  });
  res.json(taxRates);
};

export const createTaxRate = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { name, rate, isDefault } = req.body;

  // If this is being set as default, unset any existing default
  if (isDefault) {
    await prisma.taxRate.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const taxRate = await prisma.taxRate.create({
    data: { companyId, name, rate, isDefault: isDefault || false },
  });
  res.status(201).json(taxRate);
};

export const updateTaxRate = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  const { isDefault, ...rest } = req.body;

  // If setting as default, unset existing default first
  if (isDefault) {
    await prisma.taxRate.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const taxRate = await prisma.taxRate.update({
    where: { id: Number(id), companyId },
    data: { ...rest, ...(isDefault !== undefined ? { isDefault } : {}) },
  });
  res.json(taxRate);
};

export const deleteTaxRate = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  await prisma.taxRate.delete({
    where: { id: Number(id), companyId },
  });
  res.json({ message: 'Tax rate deleted' });
};
