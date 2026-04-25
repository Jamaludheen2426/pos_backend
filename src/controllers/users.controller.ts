import { Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { enforcePlanLimit, PlanLimitError } from '../lib/planLimits';

export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.query.companyId
    ? Number(req.query.companyId)
    : req.user!.companyId;

  if (!companyId) { res.status(400).json({ message: 'companyId required' }); return; }

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true, name: true, email: true, role: true,
      storeId: true, store: { select: { id: true, name: true } },
      isActive: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { name, email, password, role, storeId } = req.body;

  try {
    await enforcePlanLimit(companyId, 'users');
  } catch (err) {
    if (err instanceof PlanLimitError) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    throw err;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { res.status(409).json({ message: 'Email already exists' }); return; }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { companyId, name, email, passwordHash, role, storeId },
    select: { id: true, name: true, email: true, role: true, storeId: true, isActive: true, createdAt: true },
  });
  res.status(201).json(user);
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { password, ...data } = req.body;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data,
    select: { id: true, name: true, email: true, role: true, storeId: true, isActive: true, updatedAt: true },
  });
  res.json(user);
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = await prisma.user.update({
    where: { id: Number(id), companyId: req.user!.companyId! },
    data: { isActive: false },
    select: { id: true, name: true, email: true, isActive: true },
  });
  res.json(user);
};
