import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const listProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { search, category, page = '1', limit = '50' } = req.query;

  const where: Record<string, unknown> = { companyId, isActive: true };
  if (search) where.name = { contains: String(search) };
  if (category) where.category = String(category);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, taxRate: true },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { name: 'asc' },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ products, total, page: Number(page), limit: Number(limit) });
};

export const getProductByBarcode = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { barcode } = req.params;

  const product = await prisma.product.findFirst({
    where: { companyId, barcode, isActive: true },
    include: { variants: true, taxRate: true },
  });

  if (!product) {
    // Try variant barcode
    const variant = await prisma.productVariant.findFirst({
      where: { barcode, product: { companyId } },
      include: { product: { include: { taxRate: true } } },
    });
    if (!variant) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }
    res.json({ ...variant.product, matchedVariant: variant });
    return;
  }

  res.json(product);
};

export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { variants, ...productData } = req.body;

  const product = await prisma.product.create({
    data: {
      ...productData,
      companyId,
      variants: variants ? { create: variants } : undefined,
    },
    include: { variants: true },
  });

  res.status(201).json(product);
};

export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;
  const { variants, ...productData } = req.body;

  const product = await prisma.product.update({
    where: { id: Number(id), companyId },
    data: productData,
    include: { variants: true },
  });

  res.json(product);
};

export const deleteProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;

  await prisma.product.update({
    where: { id: Number(id), companyId },
    data: { isActive: false },
  });

  res.json({ message: 'Product deactivated' });
};

export const bulkImportProducts = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { products } = req.body as {
    products: Array<{
      name: string;
      sku?: string;
      barcode?: string;
      category?: string;
      basePrice: number;
      reorderLevel?: number;
    }>;
  };

  if (!products || !Array.isArray(products) || products.length === 0) {
    res.status(400).json({ message: 'Products array is required and must not be empty' });
    return;
  }

  const created = await prisma.product.createMany({
    data: products.map((p) => ({
      companyId,
      name: p.name,
      sku: p.sku || null,
      barcode: p.barcode || null,
      category: p.category || null,
      basePrice: p.basePrice,
    })),
  });

  res.status(201).json({ count: created.count });
};

export const getStockLevels = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { storeId } = req.query;

  const stock = await prisma.stock.findMany({
    where: {
      companyId,
      ...(storeId ? { storeId: Number(storeId) } : {}),
    },
    include: { product: true, variant: true, store: true },
  });

  res.json(stock);
};
