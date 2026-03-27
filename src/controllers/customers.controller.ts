import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listCustomers = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const customers = await prisma.customer.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(customers);
};

export const createCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { name, email, phone } = req.body;
  const customer = await prisma.customer.create({
    data: { companyId, name, email, phone },
  });
  res.status(201).json(customer);
};

export const updateCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  const customer = await prisma.customer.update({
    where: { id: Number(id), companyId },
    data: req.body,
  });
  res.json(customer);
};

export const deleteCustomer = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;
  await prisma.customer.update({
    where: { id: Number(id), companyId },
    data: { isActive: false },
  });
  res.json({ message: 'Customer deactivated' });
};
