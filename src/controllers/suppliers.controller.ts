import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listSuppliers = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const suppliers = await prisma.supplier.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(suppliers);
};

export const createSupplier = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { name, email, phone, address } = req.body;
  const supplier = await prisma.supplier.create({
    data: { companyId, name, email, phone, address },
  });
  res.status(201).json(supplier);
};

export const updateSupplier = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  const supplier = await prisma.supplier.update({
    where: { id: Number(id), companyId },
    data: req.body,
  });
  res.json(supplier);
};

export const deleteSupplier = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  await prisma.supplier.update({
    where: { id: Number(id), companyId },
    data: { isActive: false },
  });
  res.json({ message: 'Supplier deactivated' });
};
