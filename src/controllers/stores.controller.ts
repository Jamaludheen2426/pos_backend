import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// GET /api/v1/stores — list stores for authenticated user's company
export const listStores = async (req: AuthRequest, res: Response): Promise<void> => {
  const stores = await prisma.store.findMany({
    where: { companyId: req.user!.companyId! },
    include: { _count: { select: { users: true, sales: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(stores);
};

// POST /api/v1/stores — create new store
export const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, address, phone } = req.body;

  const store = await prisma.store.create({
    data: {
      companyId: req.user!.companyId!,
      name,
      address,
      phone,
    },
  });
  res.status(201).json(store);
};

// PATCH /api/v1/stores/:id — update store
export const updateStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const data = req.body;

  const store = await prisma.store.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data,
  });
  res.json(store);
};

// DELETE /api/v1/stores/:id — soft delete (isActive=false)
export const deleteStore = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const store = await prisma.store.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data: { isActive: false },
  });
  res.json(store);
};
