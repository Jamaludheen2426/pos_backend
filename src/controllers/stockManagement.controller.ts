import { Response } from 'express';
import { MovementType } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { emitStockUpdate, emitLowStockAlert } from '../lib/socket';
import logger from '../lib/logger';

export const adjustStock = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { productId, storeId, variantId, qty, reason } = req.body;

  if (!productId || !storeId || qty === undefined || qty === null) {
    res.status(400).json({ message: 'productId, storeId and qty are required' });
    return;
  }
  if (Number(qty) === 0) {
    res.status(400).json({ message: 'qty must be non-zero' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.stock.updateMany({
      where: { storeId: Number(storeId), productId: Number(productId), variantId: variantId ? Number(variantId) : null },
      data: { qty: { increment: Number(qty) } },
    });

    const movement = await tx.stockMovement.create({
      data: {
        companyId,
        productId: Number(productId),
        variantId: variantId ? Number(variantId) : null,
        storeId: Number(storeId),
        type: 'ADJUSTMENT',
        qty: Number(qty),
        note: reason || null,
      },
    });

    // Return updated qty for socket emission
    const stockRow = await tx.stock.findFirst({
      where: { storeId: Number(storeId), productId: Number(productId), variantId: variantId ? Number(variantId) : null },
      select: { qty: true, lowStockAt: true },
    });
    return { movement, newQty: Number(stockRow?.qty ?? 0), lowStockAt: stockRow?.lowStockAt ?? null };
  });

  emitStockUpdate(companyId, {
    productId: Number(productId),
    storeId: Number(storeId),
    newQty: result.newQty,
    delta: Number(qty),
    trigger: 'adjustment',
  });

  if (result.lowStockAt !== null && result.newQty <= result.lowStockAt) {
    const product = await prisma.product.findUnique({ where: { id: Number(productId) }, select: { name: true } });
    emitLowStockAlert(companyId, [{
      productId: Number(productId),
      productName: product?.name ?? String(productId),
      storeId: Number(storeId),
      currentQty: result.newQty,
      lowStockAt: result.lowStockAt,
    }]);
    logger.warn({ companyId, productId, storeId, newQty: result.newQty }, 'low stock after adjustment');
  }

  logger.info({ companyId, productId, storeId, qty }, 'stock adjusted');
  res.status(201).json(result.movement);
};

export const transferStock = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { productId, fromStoreId, toStoreId, variantId, qty, note } = req.body;

  if (!productId || !fromStoreId || !toStoreId || !qty) {
    res.status(400).json({ message: 'productId, fromStoreId, toStoreId and qty are required' });
    return;
  }
  if (Number(qty) <= 0) {
    res.status(400).json({ message: 'Transfer quantity must be positive' });
    return;
  }
  if (Number(fromStoreId) === Number(toStoreId)) {
    res.status(400).json({ message: 'Source and destination stores must be different' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic decrement only if sufficient stock — count === 0 means not enough
      const decremented = await tx.stock.updateMany({
        where: {
          storeId: Number(fromStoreId),
          productId: Number(productId),
          variantId: variantId ? Number(variantId) : null,
          qty: { gte: Number(qty) },           // guard: only update if stock is sufficient
        },
        data: { qty: { decrement: Number(qty) } },
      });

      if (decremented.count === 0) {
        throw new Error('Insufficient stock in source store');
      }

      // Upsert destination: update if record exists, create otherwise
      const existing = await tx.stock.findFirst({
        where: {
          storeId: Number(toStoreId),
          productId: Number(productId),
          variantId: variantId ? Number(variantId) : null,
        },
      });

      if (existing) {
        await tx.stock.update({
          where: { id: existing.id },
          data: { qty: { increment: Number(qty) } },
        });
      } else {
        await tx.stock.create({
          data: {
            companyId,
            storeId: Number(toStoreId),
            productId: Number(productId),
            variantId: variantId ? Number(variantId) : null,
            qty: Number(qty),
          },
        });
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          fromStoreId: Number(fromStoreId),
          toStoreId: Number(toStoreId),
          productId: Number(productId),
          variantId: variantId ? Number(variantId) : null,
          qty: Number(qty),
          note: note || null,
        },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: Number(productId),
          variantId: variantId ? Number(variantId) : null,
          storeId: Number(fromStoreId),
          type: MovementType.TRANSFER_OUT,
          qty: Number(qty),
          note: note || null,
          referenceId: transfer.id,
        },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: Number(productId),
          variantId: variantId ? Number(variantId) : null,
          storeId: Number(toStoreId),
          type: MovementType.TRANSFER_IN,
          qty: Number(qty),
          note: note || null,
          referenceId: transfer.id,
        },
      });

      // Fetch post-transfer qtys for socket emission
      const [fromStock, toStock] = await Promise.all([
        tx.stock.findFirst({
          where: { storeId: Number(fromStoreId), productId: Number(productId), variantId: variantId ? Number(variantId) : null },
          select: { qty: true, lowStockAt: true },
        }),
        tx.stock.findFirst({
          where: { storeId: Number(toStoreId), productId: Number(productId), variantId: variantId ? Number(variantId) : null },
          select: { qty: true, lowStockAt: true },
        }),
      ]);

      return { transfer, fromQty: Number(fromStock?.qty ?? 0), toQty: Number(toStock?.qty ?? 0), fromLowStockAt: fromStock?.lowStockAt ?? null };
    });

    // Emit real-time updates for both stores
    emitStockUpdate(companyId, { productId: Number(productId), storeId: Number(fromStoreId), newQty: result.fromQty, delta: -Number(qty), trigger: 'transfer' });
    emitStockUpdate(companyId, { productId: Number(productId), storeId: Number(toStoreId), newQty: result.toQty, delta: Number(qty), trigger: 'transfer' });

    if (result.fromLowStockAt !== null && result.fromQty <= result.fromLowStockAt) {
      const product = await prisma.product.findUnique({ where: { id: Number(productId) }, select: { name: true } });
      emitLowStockAlert(companyId, [{
        productId: Number(productId),
        productName: product?.name ?? String(productId),
        storeId: Number(fromStoreId),
        currentQty: result.fromQty,
        lowStockAt: result.fromLowStockAt,
      }]);
      logger.warn({ companyId, productId, fromStoreId, fromQty: result.fromQty }, 'low stock after transfer');
    }

    logger.info({ companyId, productId, fromStoreId, toStoreId, qty }, 'stock transferred');
    res.status(201).json(result.transfer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Transfer failed';
    res.status(400).json({ message: msg });
  }
};

export const listStockMovements = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { productId, storeId, type, page = '1', limit = '50' } = req.query;

  const where: Record<string, unknown> = { companyId };
  if (productId) where.productId = Number(productId);
  if (storeId) where.storeId = Number(storeId);
  if (type) {
    const t = String(type).toUpperCase();
    if (t === 'TRANSFER') {
      where.type = { in: [MovementType.TRANSFER_IN, MovementType.TRANSFER_OUT] };
    } else if (Object.values(MovementType).includes(t as MovementType)) {
      where.type = t as MovementType;
    }
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),
    prisma.stockMovement.count({ where }),
  ]);

  res.json({ movements, total, page: Number(page), limit: Number(limit) });
};
