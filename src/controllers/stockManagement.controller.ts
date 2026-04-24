import { Response } from 'express';
import { MovementType } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const adjustStock = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { productId, storeId, variantId, qty, reason } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    // Update stock level
    await tx.stock.updateMany({
      where: { storeId, productId, variantId: variantId || null },
      data: { qty: { increment: qty } },
    });

    // Create stock movement
    const movement = await tx.stockMovement.create({
      data: {
        companyId,
        productId,
        variantId: variantId || null,
        storeId,
        type: 'ADJUSTMENT',
        qty,
        note: reason || null,
      },
    });

    return movement;
  });

  res.status(201).json(result);
};

export const transferStock = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { productId, fromStoreId, toStoreId, variantId, qty, note } = req.body;

  if (qty <= 0) {
    res.status(400).json({ message: 'Transfer quantity must be positive' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Decrement from source store
    await tx.stock.updateMany({
      where: { storeId: fromStoreId, productId, variantId: variantId || null },
      data: { qty: { decrement: qty } },
    });

    // Increment at destination store — upsert in case stock record doesn't exist
    const existingStock = await tx.stock.findFirst({
      where: { storeId: toStoreId, productId, variantId: variantId || null },
    });

    if (existingStock) {
      await tx.stock.updateMany({
        where: { storeId: toStoreId, productId, variantId: variantId || null },
        data: { qty: { increment: qty } },
      });
    } else {
      await tx.stock.create({
        data: {
          companyId,
          storeId: toStoreId,
          productId,
          variantId: variantId || null,
          qty,
        },
      });
    }

    // Create StockTransfer record
    const transfer = await tx.stockTransfer.create({
      data: {
        fromStoreId,
        toStoreId,
        productId,
        variantId: variantId || null,
        qty,
        note: note || null,
      },
    });

    // Create TRANSFER_OUT movement
    await tx.stockMovement.create({
      data: {
        companyId,
        productId,
        variantId: variantId || null,
        storeId: fromStoreId,
        type: 'TRANSFER_OUT',
        qty,
        note: note || null,
        referenceId: transfer.id,
      },
    });

    // Create TRANSFER_IN movement
    await tx.stockMovement.create({
      data: {
        companyId,
        productId,
        variantId: variantId || null,
        storeId: toStoreId,
        type: 'TRANSFER_IN',
        qty,
        note: note || null,
        referenceId: transfer.id,
      },
    });

    return transfer;
  });

  res.status(201).json(result);
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
