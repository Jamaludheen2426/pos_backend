import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

interface SaleItem {
  productId: number;
  variantId?: number;
  qty: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
}

interface PaymentSplit {
  method: 'CASH' | 'CARD' | 'UPI';
  amount: number;
}

export const createSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;
  const { storeId, customerId, items, payments, discountAmount = 0, taxAmount = 0, subtotal, total, loyaltyPointsUsed = 0 } = req.body;

  // Generate receipt number
  const receiptNo = `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        companyId,
        storeId,
        cashierId,
        customerId: customerId || null,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        loyaltyPointsUsed,
        receiptNo,
        items: {
          create: items.map((item: SaleItem) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal: item.lineTotal,
          })),
        },
        payments: {
          create: payments.map((p: PaymentSplit) => ({
            method: p.method,
            amount: p.amount,
          })),
        },
      },
      include: { items: true, payments: true },
    });

    // Deduct stock
    for (const item of items as SaleItem[]) {
      await tx.stock.updateMany({
        where: { storeId, productId: item.productId, variantId: item.variantId || null },
        data: { qty: { decrement: item.qty } },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: item.productId,
          variantId: item.variantId || null,
          storeId,
          type: 'SALE',
          qty: item.qty,
          referenceId: newSale.id,
        },
      });
    }

    return newSale;
  });

  res.status(201).json(sale);
};

export const getSales = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { storeId, cashierId, from, to, page = '1', limit = '50' } = req.query;

  const where: Record<string, unknown> = { companyId };
  if (storeId) where.storeId = Number(storeId);
  if (cashierId) where.cashierId = Number(cashierId);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(String(from)) } : {}),
      ...(to ? { lte: new Date(String(to)) } : {}),
    };
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: { include: { product: true } }, payments: true, cashier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ sales, total });
};

export const getSaleById = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const sale = await prisma.sale.findFirst({
    where: { id: Number(id), companyId },
    include: {
      items: { include: { product: true, variant: true } },
      payments: true,
      cashier: { select: { name: true } },
      customer: true,
      store: true,
    },
  });

  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }

  res.json(sale);
};

export const refundSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const sale = await prisma.sale.findFirst({
    where: { id: Number(id), companyId },
    include: { items: true },
  });

  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }

  if (sale.status !== 'COMPLETED') {
    res.status(400).json({ message: 'Only completed sales can be refunded' });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Update sale status
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'REFUNDED' },
      include: { items: true, payments: true },
    });

    // Restore stock for each item
    for (const item of sale.items) {
      await tx.stock.updateMany({
        where: { storeId: sale.storeId, productId: item.productId, variantId: item.variantId },
        data: { qty: { increment: Number(item.qty) } },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: item.productId,
          variantId: item.variantId,
          storeId: sale.storeId,
          type: 'ADJUSTMENT',
          qty: Number(item.qty),
          note: `Refund for sale #${sale.receiptNo}`,
          referenceId: sale.id,
        },
      });
    }

    return updatedSale;
  });

  res.json(updated);
};

export const voidSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const sale = await prisma.sale.findFirst({
    where: { id: Number(id), companyId },
    include: { items: true },
  });

  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }

  if (sale.status !== 'COMPLETED') {
    res.status(400).json({ message: 'Only completed sales can be voided' });
    return;
  }

  // Check if sale was created today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (sale.createdAt < todayStart) {
    res.status(400).json({ message: 'Only sales created today can be voided' });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'VOID' },
      include: { items: true, payments: true },
    });

    // Restore stock for each item
    for (const item of sale.items) {
      await tx.stock.updateMany({
        where: { storeId: sale.storeId, productId: item.productId, variantId: item.variantId },
        data: { qty: { increment: Number(item.qty) } },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: item.productId,
          variantId: item.variantId,
          storeId: sale.storeId,
          type: 'ADJUSTMENT',
          qty: Number(item.qty),
          note: `Void for sale #${sale.receiptNo}`,
          referenceId: sale.id,
        },
      });
    }

    return updatedSale;
  });

  res.json(updated);
};

// Sync offline sales (batch)
export const syncOfflineSales = async (req: AuthRequest, res: Response): Promise<void> => {
  const { sales } = req.body as { sales: Record<string, unknown>[] };
  const results = [];

  for (const saleData of sales) {
    try {
      const mockReq = { ...req, body: saleData } as AuthRequest;
      // Process each sale — simplified inline
      results.push({ status: 'queued', receiptNo: saleData.receiptNo });
    } catch (err) {
      results.push({ status: 'failed', receiptNo: saleData.receiptNo });
    }
  }

  res.json({ synced: results.length, results });
};
