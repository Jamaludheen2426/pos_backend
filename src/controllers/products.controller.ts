import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { enforcePlanLimit, PlanLimitError } from '../lib/planLimits';

// Initialise a qty=0 Stock row for every active store so inventory reports are accurate
async function initStockForProduct(companyId: number, productId: number): Promise<void> {
  const stores = await prisma.store.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  });
  if (stores.length === 0) return;

  await prisma.stock.createMany({
    data: stores.map((s) => ({
      companyId,
      storeId: s.id,
      productId,
      qty: 0,
    })),
    skipDuplicates: true,
  });
}

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
    const variant = await prisma.productVariant.findFirst({
      where: { barcode, product: { companyId } },
      include: { product: { include: { taxRate: true } } },
    });
    if (!variant) { res.status(404).json({ message: 'Product not found' }); return; }
    res.json({ ...variant.product, matchedVariant: variant });
    return;
  }

  res.json(product);
};

export const createProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { variants, barcode, sku, ...productData } = req.body;

  try {
    await enforcePlanLimit(companyId, 'products');
  } catch (err) {
    if (err instanceof PlanLimitError) { res.status(err.statusCode).json({ message: err.message }); return; }
    throw err;
  }

  // Barcode uniqueness check
  if (barcode) {
    const collision = await prisma.product.findFirst({ where: { companyId, barcode } });
    if (collision) {
      res.status(409).json({ message: `Barcode "${barcode}" is already assigned to "${collision.name}"` });
      return;
    }
  }

  // SKU uniqueness check
  if (sku) {
    const collision = await prisma.product.findFirst({ where: { companyId, sku } });
    if (collision) {
      res.status(409).json({ message: `SKU "${sku}" is already assigned to "${collision.name}"` });
      return;
    }
  }

  const product = await prisma.product.create({
    data: {
      ...productData,
      barcode: barcode || null,
      sku: sku || null,
      companyId,
      variants: variants ? { create: variants } : undefined,
    },
    include: { variants: true },
  });

  // Seed qty=0 stock rows for every active store
  await initStockForProduct(companyId, product.id);

  res.status(201).json(product);
};

export const updateProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { id } = req.params;
  const { variants, barcode, sku, ...productData } = req.body;

  // Barcode uniqueness — exclude self
  if (barcode) {
    const collision = await prisma.product.findFirst({
      where: { companyId, barcode, NOT: { id: Number(id) } },
    });
    if (collision) {
      res.status(409).json({ message: `Barcode "${barcode}" is already assigned to "${collision.name}"` });
      return;
    }
  }

  const product = await prisma.product.update({
    where: { id: Number(id), companyId },
    data: { ...productData, barcode: barcode || null, sku: sku || null },
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

  // Enforce plan limit — check how much headroom is left
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { plan: true },
  });
  if (company && company.plan.maxProducts !== -1) {
    const current = await prisma.product.count({ where: { companyId, isActive: true } });
    const headroom = company.plan.maxProducts - current;
    if (headroom <= 0) {
      res.status(402).json({ message: `Plan limit reached: your plan allows ${company.plan.maxProducts} products.` });
      return;
    }
    if (products.length > headroom) {
      res.status(402).json({
        message: `Import would exceed plan limit. You can add ${headroom} more product(s) on your current plan.`,
      });
      return;
    }
  }

  // Collect barcodes and SKUs to check for collisions in one query
  const incomingBarcodes = products.map((p) => p.barcode).filter(Boolean) as string[];
  const incomingSkus = products.map((p) => p.sku).filter(Boolean) as string[];

  const [existingBarcodes, existingSkus] = await Promise.all([
    incomingBarcodes.length > 0
      ? prisma.product.findMany({ where: { companyId, barcode: { in: incomingBarcodes } }, select: { barcode: true, name: true } })
      : [],
    incomingSkus.length > 0
      ? prisma.product.findMany({ where: { companyId, sku: { in: incomingSkus } }, select: { sku: true, name: true } })
      : [],
  ]);

  const takenBarcodes = new Map(existingBarcodes.map((p) => [p.barcode!, p.name]));
  const takenSkus = new Map(existingSkus.map((p) => [p.sku!, p.name]));

  const errors: { row: number; message: string }[] = [];
  const validProducts: typeof products = [];

  products.forEach((p, i) => {
    const row = i + 2; // 1-indexed + header row
    if (p.barcode && takenBarcodes.has(p.barcode)) {
      errors.push({ row, message: `Barcode "${p.barcode}" already used by "${takenBarcodes.get(p.barcode)}"` });
      return;
    }
    if (p.sku && takenSkus.has(p.sku)) {
      errors.push({ row, message: `SKU "${p.sku}" already used by "${takenSkus.get(p.sku)}"` });
      return;
    }
    validProducts.push(p);
  });

  let successCount = 0;
  if (validProducts.length > 0) {
    // createMany doesn't return IDs, so we create individually to init stock
    const created = await Promise.all(
      validProducts.map((p) =>
        prisma.product.create({
          data: {
            companyId,
            name: p.name,
            sku: p.sku || null,
            barcode: p.barcode || null,
            category: p.category || null,
            basePrice: p.basePrice,
          },
          select: { id: true },
        }),
      ),
    );
    successCount = created.length;
    // Seed stock rows for all newly created products across all stores
    await Promise.all(created.map((p) => initStockForProduct(companyId, p.id)));
  }

  res.status(errors.length > 0 && successCount === 0 ? 422 : 201).json({
    successCount,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
};

export const getStockLevels = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { storeId } = req.query;

  const stock = await prisma.stock.findMany({
    where: { companyId, ...(storeId ? { storeId: Number(storeId) } : {}) },
    include: { product: true, variant: true, store: true },
  });

  res.json(stock);
};
