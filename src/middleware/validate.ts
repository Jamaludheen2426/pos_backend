import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny } from 'zod';

export const validate = (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: 'Validation error',
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const createSaleSchema = z.object({
  storeId: z.number({ coerce: true }).int().positive(),
  customerId: z.number({ coerce: true }).int().positive().optional(),
  items: z.array(z.object({
    productId: z.number({ coerce: true }).int().positive(),
    variantId: z.number({ coerce: true }).int().positive().optional(),
    qty: z.number({ coerce: true }).positive(),
    discount: z.number({ coerce: true }).min(0).optional().default(0),
  })).min(1, 'At least one item is required'),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'CARD', 'UPI']),
    amount: z.number({ coerce: true }).positive(),
  })).min(1, 'At least one payment is required'),
  discountAmount: z.number({ coerce: true }).min(0).optional().default(0),
  loyaltyPointsUsed: z.number({ coerce: true }).int().min(0).optional().default(0),
});

export const transferStockSchema = z.object({
  productId: z.number({ coerce: true }).int().positive(),
  fromStoreId: z.number({ coerce: true }).int().positive(),
  toStoreId: z.number({ coerce: true }).int().positive(),
  qty: z.number({ coerce: true }).positive(),
  variantId: z.number({ coerce: true }).int().positive().optional(),
  note: z.string().max(500).optional(),
}).refine((d) => d.fromStoreId !== d.toStoreId, {
  message: 'Source and destination stores must be different',
  path: ['toStoreId'],
});

export const adjustStockSchema = z.object({
  productId: z.number({ coerce: true }).int().positive(),
  storeId: z.number({ coerce: true }).int().positive(),
  qty: z.number({ coerce: true }).refine((n) => n !== 0, { message: 'qty must be non-zero' }),
  variantId: z.number({ coerce: true }).int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  basePrice: z.number({ coerce: true }).positive(),
  taxRateId: z.number({ coerce: true }).int().positive().optional(),
  unit: z.string().max(20).optional(),
  isWeightBased: z.boolean().optional().default(false),
  expiryTracking: z.boolean().optional().default(false),
});

export const openShiftSchema = z.object({
  storeId: z.number({ coerce: true }).int().positive(),
  openingFloat: z.number({ coerce: true }).min(0).default(0),
});

export const closeShiftSchema = z.object({
  closingCash: z.number({ coerce: true }).min(0),
  notes: z.string().max(1000).optional(),
});
