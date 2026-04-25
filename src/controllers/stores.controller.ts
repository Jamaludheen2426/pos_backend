import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { enforcePlanLimit, PlanLimitError } from '../lib/planLimits';

export const listStores = async (req: AuthRequest, res: Response): Promise<void> => {
  const stores = await prisma.store.findMany({
    where: { companyId: req.user!.companyId! },
    include: { _count: { select: { users: true, sales: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(stores);
};

export const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { name, address, phone } = req.body;

  try {
    await enforcePlanLimit(companyId, 'stores');
  } catch (err) {
    if (err instanceof PlanLimitError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    throw err;
  }

  const store = await prisma.store.create({
    data: { companyId, name, address, phone },
  });
  res.status(201).json(store);
};

export const updateStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const store = await prisma.store.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data: req.body,
  });
  res.json(store);
};

export const deleteStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const store = await prisma.store.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data: { isActive: false },
  });
  res.json(store);
};
