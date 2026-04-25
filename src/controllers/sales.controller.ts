import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitStockUpdate, emitLowStockAlert, LowStockAlert } from '../lib/socket';
import logger from '../lib/logger';

interface SaleItemInput {
  productId: number;
  variantId?: number;
  qty: number;
  discount?: number;
}

interface PaymentSplit {
  method: 'CASH' | 'CARD' | 'UPI';
  amount: number;
}

interface SalePayload {
  storeId: number;
  customerId?: number;
  items: SaleItemInput[];
  payments: PaymentSplit[];
  discountAmount?: number;
  loyaltyPointsUsed?: number;
  receiptNo?: string;   // only used by offline sync
  createdAt?: string;   // only used by offline sync
}

// ─── Shared core: server-side price calc + DB write ──────────────────────────

interface StockSnapshot {
  productId: number;
  storeId: number;
  newQty: number;
  delta: number;
  lowStockAt: number | null;
  productName: string;
}

interface SaleCoreResult {
  sale: { id: number; receiptNo: string; total: Prisma.Decimal };
  stockSnapshots: StockSnapshot[];
}

async function processSaleCore(
  tx: Prisma.TransactionClient,
  companyId: number,
  cashierId: number,
  payload: SalePayload,
): Promise<SaleCoreResult> {
  const { storeId, customerId, items, payments, discountAmount = 0, loyaltyPointsUsed = 0 } = payload;

  // 1. Fetch canonical prices from DB — never trust client-sent prices
  const productIds = [...new Set(items.map((i) => Number(i.productId)))];
  const dbProducts = await tx.product.findMany({
    where: { id: { in: productIds }, companyId },
    include: { taxRate: true },
  });
  if (dbProducts.length !== productIds.length) {
    throw new Error('One or more products not found or do not belong to this company');
  }
  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  // 2. Recalculate all line totals server-side
  let calcSubtotal = 0;
  let calcTaxTotal = 0;
  const calculatedItems = items.map((item) => {
    const product = productMap.get(Number(item.productId))!;
    const unitPrice = Number(product.basePrice);
    const qty = Number(item.qty);
    const lineDiscount = Number(item.discount ?? 0);
    const preTax = unitPrice * qty - lineDiscount;
    const taxRate = product.taxRate ? Number(product.taxRate.rate) / 100 : 0;
    const lineTax = Math.round(preTax * taxRate * 100) / 100;
    const lineTotal = preTax + lineTax;

    calcSubtotal += preTax;
    calcTaxTotal += lineTax;

    return {
      productId: Number(item.productId),
      variantId: item.variantId ? Number(item.variantId) : null,
      qty,
      unitPrice,
      discount: lineDiscount,
      taxAmount: lineTax,
      lineTotal,
    };
  });

  const saleDiscount = Number(discountAmount);
  // 1 loyalty point = 1 currency unit off the total
  const pointsValue = Number(loyaltyPointsUsed);
  const calcTotal = Math.max(0, calcSubtotal + calcTaxTotal - saleDiscount - pointsValue);

  // 3. Validate loyalty balance before spending
  if (loyaltyPointsUsed > 0 && customerId) {
    const loyalty = await tx.loyaltyPoints.findUnique({ where: { customerId } });
    if (!loyalty || loyalty.points < loyaltyPointsUsed) {
      throw new Error('Insufficient loyalty points');
    }
  }

  const receiptNo = payload.receiptNo ?? `RCP-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  // Link to the cashier's open shift if one exists (soft requirement — sale is allowed without one)
  const openShift = await tx.shift.findFirst({
    where: { companyId, cashierId, storeId: Number(storeId), status: 'OPEN' },
    select: { id: true },
  });

  const newSale = await tx.sale.create({
    data: {
      companyId,
      storeId,
      cashierId,
      customerId: customerId ?? null,
      subtotal: calcSubtotal,
      discountAmount: saleDiscount,
      taxAmount: calcTaxTotal,
      total: calcTotal,
      loyaltyPointsUsed,
      shiftId: openShift?.id ?? null,
      receiptNo,
      ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      items: { create: calculatedItems },
      payments: {
        create: payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
      },
    },
  });

  // 4. Deduct stock for each item, collect post-sale qty for alerts
  const stockSnapshots: { productId: number; storeId: number; newQty: number; delta: number; lowStockAt: number | null; productName: string }[] = [];

  for (const item of calculatedItems) {
    await tx.stock.updateMany({
      where: { storeId, productId: item.productId, variantId: item.variantId },
      data: { qty: { decrement: item.qty } },
    });
    await tx.stockMovement.create({
      data: {
        companyId,
        productId: item.productId,
        variantId: item.variantId,
        storeId,
        type: 'SALE',
        qty: item.qty,
        referenceId: newSale.id,
      },
    });

    // Fetch post-decrement qty to check low-stock threshold
    const stockRow = await tx.stock.findFirst({
      where: { storeId, productId: item.productId, variantId: item.variantId ?? null },
      select: { qty: true, lowStockAt: true },
    });
    const product = productMap.get(item.productId);
    stockSnapshots.push({
      productId: item.productId,
      storeId: Number(storeId),
      newQty: Number(stockRow?.qty ?? 0),
      delta: -item.qty,
      lowStockAt: stockRow?.lowStockAt ?? null,
      productName: product?.name ?? String(item.productId),
    });
  }

  // 5. Update loyalty points: deduct used, award earned (1 pt per currency unit)
  if (customerId) {
    const pointsEarned = Math.floor(calcTotal);
    const netDelta = pointsEarned - loyaltyPointsUsed;
    await tx.loyaltyPoints.upsert({
      where: { customerId },
      create: { customerId, points: Math.max(0, netDelta) },
      update: { points: { increment: netDelta } },
    });
  }

  return { sale: newSale, stockSnapshots };
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const createSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;

  try {
    const { sale, stockSnapshots } = await prisma.$transaction((tx) =>
      processSaleCore(tx, companyId, cashierId, req.body),
    );

    logger.info({ companyId, cashierId, saleId: sale.id, total: sale.total }, 'sale created');

    // Emit real-time stock updates to all connected clients in this company
    const lowStockAlerts: LowStockAlert[] = [];
    for (const snap of stockSnapshots) {
      emitStockUpdate(companyId, {
        productId: snap.productId,
        storeId: snap.storeId,
        newQty: snap.newQty,
        delta: snap.delta,
        trigger: 'sale',
      });
      if (snap.lowStockAt !== null && snap.newQty <= snap.lowStockAt) {
        lowStockAlerts.push({
          productId: snap.productId,
          productName: snap.productName,
          storeId: snap.storeId,
          currentQty: snap.newQty,
          lowStockAt: snap.lowStockAt,
        });
      }
    }
    if (lowStockAlerts.length > 0) {
      emitLowStockAlert(companyId, lowStockAlerts);
      logger.warn({ companyId, saleId: sale.id, lowStockAlerts }, 'low stock after sale');
    }

    const full = await prisma.sale.findUnique({
      where: { id: sale.id },
      include: { items: true, payments: true },
    });
    res.status(201).json({ ...full, lowStockAlerts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create sale';
    logger.error({ companyId, cashierId, err }, 'sale failed');
    res.status(400).json({ message: msg });
  }
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

  if (!sale) { res.status(404).json({ message: 'Sale not found' }); return; }
  res.json(sale);
};

export const refundSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const sale = await prisma.sale.findFirst({ where: { id: Number(id), companyId }, include: { items: true } });
  if (!sale) { res.status(404).json({ message: 'Sale not found' }); return; }
  if (sale.status !== 'COMPLETED') { res.status(400).json({ message: 'Only completed sales can be refunded' }); return; }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'REFUNDED' },
      include: { items: true, payments: true },
    });

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

    // Reverse loyalty points awarded on this sale
    if (sale.customerId) {
      const pointsToReverse = Math.floor(Number(sale.total));
      await tx.loyaltyPoints.updateMany({
        where: { customerId: sale.customerId },
        data: { points: { decrement: pointsToReverse } },
      });
    }

    return updatedSale;
  });

  res.json(updated);
};

export const voidSale = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  const sale = await prisma.sale.findFirst({ where: { id: Number(id), companyId }, include: { items: true } });
  if (!sale) { res.status(404).json({ message: 'Sale not found' }); return; }
  if (sale.status !== 'COMPLETED') { res.status(400).json({ message: 'Only completed sales can be voided' }); return; }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (sale.createdAt < todayStart) { res.status(400).json({ message: 'Only sales created today can be voided' }); return; }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { status: 'VOID' },
      include: { items: true, payments: true },
    });

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

// Sync offline sales — actually persists each sale using the same validated logic
export const syncOfflineSales = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const cashierId = req.user!.userId;
  const { sales } = req.body as { sales: SalePayload[] };

  if (!Array.isArray(sales) || sales.length === 0) {
    res.status(400).json({ message: 'sales array is required' });
    return;
  }

  const results: { receiptNo: string | undefined; status: string; message?: string }[] = [];

  for (const saleData of sales) {
    // Skip if already synced (idempotency)
    if (saleData.receiptNo) {
      const exists = await prisma.sale.findUnique({ where: { receiptNo: saleData.receiptNo } });
      if (exists) {
        results.push({ receiptNo: saleData.receiptNo, status: 'skipped' });
        continue;
      }
    }

    try {
      const { sale, stockSnapshots } = await prisma.$transaction((tx) =>
        processSaleCore(tx, companyId, cashierId, saleData),
      );
      for (const snap of stockSnapshots) {
        emitStockUpdate(companyId, { productId: snap.productId, storeId: snap.storeId, newQty: snap.newQty, delta: snap.delta, trigger: 'sale' });
      }
      logger.info({ companyId, cashierId, saleId: sale.id }, 'offline sale synced');
      results.push({ receiptNo: sale.receiptNo, status: 'synced' });
    } catch (err: unknown) {
      results.push({
        receiptNo: saleData.receiptNo,
        status: 'failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  res.json({ synced, failed, results });
};
