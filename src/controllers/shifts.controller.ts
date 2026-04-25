import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Open a new shift (only one open shift per cashier per store at a time)
export const openShift = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;
  const { storeId, openingFloat = 0 } = req.body;

  const existing = await prisma.shift.findFirst({
    where: { companyId, cashierId, storeId: Number(storeId), status: 'OPEN' },
  });
  if (existing) {
    res.status(409).json({ message: 'You already have an open shift. Close it before opening a new one.' });
    return;
  }

  const shift = await prisma.shift.create({
    data: {
      companyId,
      storeId: Number(storeId),
      cashierId,
      openingFloat: Number(openingFloat),
      status: 'OPEN',
    },
    include: { cashier: { select: { name: true } }, store: { select: { name: true } } },
  });

  res.status(201).json(shift);
};

// Close the current open shift — calculates expected cash vs actual
export const closeShift = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;
  const { id } = req.params;
  const { closingCash, notes } = req.body;

  const shift = await prisma.shift.findFirst({
    where: { id: Number(id), companyId, cashierId, status: 'OPEN' },
  });
  if (!shift) {
    res.status(404).json({ message: 'Open shift not found' });
    return;
  }

  // Sum all CASH sales during this shift window
  const cashSales = await prisma.payment.aggregate({
    where: {
      method: 'CASH',
      sale: {
        companyId,
        storeId: shift.storeId,
        cashierId,
        status: 'COMPLETED',
        createdAt: { gte: shift.openedAt },
      },
    },
    _sum: { amount: true },
  });

  const cashTakings = Number(cashSales._sum.amount ?? 0);
  const expectedCash = Number(shift.openingFloat) + cashTakings;
  const closing = Number(closingCash);
  const cashDifference = closing - expectedCash;

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closingCash: closing,
      expectedCash,
      cashDifference,
      notes: notes || null,
    },
    include: { cashier: { select: { name: true } }, store: { select: { name: true } } },
  });

  res.json(updated);
};

// Get the caller's current open shift
export const getCurrentShift = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;

  const shift = await prisma.shift.findFirst({
    where: { companyId, cashierId, status: 'OPEN' },
    include: { store: { select: { name: true } } },
    orderBy: { openedAt: 'desc' },
  });

  res.json(shift ?? null);
};

// List shifts (manager — all; cashier — own only)
export const listShifts = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { storeId, cashierId, status, page = '1', limit = '50' } = req.query;
  const role = req.user!.role;

  const where: Record<string, unknown> = { companyId };
  if (storeId) where.storeId = Number(storeId);
  if (status) where.status = String(status).toUpperCase();

  // Cashiers can only see their own shifts
  if (role === 'CASHIER') {
    where.cashierId = req.user!.userId;
  } else if (cashierId) {
    where.cashierId = Number(cashierId);
  }

  const [shifts, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      include: {
        cashier: { select: { name: true, role: true } },
        store: { select: { name: true } },
      },
      orderBy: { openedAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.shift.count({ where }),
  ]);

  res.json({ shifts, total });
};

// Get a single shift summary with sales breakdown
export const getShiftSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const shift = await prisma.shift.findFirst({
    where: { id: Number(id), companyId },
    include: {
      cashier: { select: { name: true, role: true } },
      store: { select: { name: true } },
    },
  });
  if (!shift) { res.status(404).json({ message: 'Shift not found' }); return; }

  const salesWhere = {
    companyId,
    storeId: shift.storeId,
    cashierId: shift.cashierId,
    status: 'COMPLETED' as const,
    createdAt: {
      gte: shift.openedAt,
      ...(shift.closedAt ? { lte: shift.closedAt } : {}),
    },
  };

  const [salesAgg, paymentBreakdown, totalSales] = await Promise.all([
    prisma.sale.aggregate({
      where: salesWhere,
      _sum: { total: true, taxAmount: true, discountAmount: true },
      _count: { id: true },
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where: { sale: salesWhere },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.sale.count({ where: salesWhere }),
  ]);

  res.json({
    shift,
    summary: {
      totalTransactions: totalSales,
      totalRevenue: Number(salesAgg._sum.total ?? 0),
      totalTax: Number(salesAgg._sum.taxAmount ?? 0),
      totalDiscount: Number(salesAgg._sum.discountAmount ?? 0),
      paymentBreakdown: paymentBreakdown.map((p) => ({
        method: p.method,
        count: p._count.id,
        total: Number(p._sum.amount ?? 0),
      })),
      openingFloat: Number(shift.openingFloat),
      expectedCash: Number(shift.expectedCash ?? 0),
      closingCash: Number(shift.closingCash ?? 0),
      cashDifference: Number(shift.cashDifference ?? 0),
    },
  });
};
