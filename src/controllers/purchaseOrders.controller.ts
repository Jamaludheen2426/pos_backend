import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listPurchaseOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
};

export const createPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { supplierId, storeId, items, note } = req.body;

  const totalAmount = items.reduce(
    (sum: number, item: { qty: number; costPrice: number }) => sum + item.qty * item.costPrice,
    0,
  );

  const order = await prisma.purchaseOrder.create({
    data: {
      companyId,
      storeId: Number(storeId),
      supplierId: Number(supplierId),
      totalAmount,
      note,
      items: {
        create: items.map((item: { productId: number; qty: number; costPrice: number; variantId?: number }) => ({
          productId: item.productId,
          variantId: item.variantId || null,
          qty: item.qty,
          costPrice: item.costPrice,
        })),
      },
    },
    include: { supplier: true, items: true },
  });
  res.status(201).json(order);
};

export const receivePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const companyId = req.user!.companyId!;

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: Number(id), companyId },
    include: { items: true },
  });

  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return;
  }

  // Update stock for each item
  for (const item of order.items) {
    await prisma.stock.upsert({
      where: {
        storeId_productId_variantId: {
          storeId: order.storeId,
          productId: item.productId,
          variantId: item.variantId ?? 0,
        },
      },
      update: { qty: { increment: Number(item.qty) } },
      create: {
        companyId,
        productId: item.productId,
        storeId: order.storeId,
        variantId: item.variantId,
        qty: Number(item.qty),
      },
    });

    await prisma.stockMovement.create({
      data: {
        companyId,
        productId: item.productId,
        storeId: order.storeId,
        type: 'PURCHASE',
        qty: Number(item.qty),
        note: `PO received: ${order.id}`,
        referenceId: order.id,
      },
    });
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: Number(id) },
    data: { status: 'RECEIVED' },
    include: { supplier: true, items: true },
  });

  res.json(updated);
};
