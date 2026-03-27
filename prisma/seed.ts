import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash('admin123', 10);
  const staffPw = await bcrypt.hash('staff123', 10);

  // ── Plans ──
  const basic = await prisma.plan.upsert({
    where: { name: 'basic' },
    update: {},
    create: { name: 'basic', maxStores: 1, maxUsers: 3, maxProducts: 500, hasMobileApp: false, hasOfflineMode: false, hasAdvancedReports: false },
  });
  const pro = await prisma.plan.upsert({
    where: { name: 'pro' },
    update: {},
    create: { name: 'pro', maxStores: 5, maxUsers: 15, maxProducts: 5000, hasMobileApp: true, hasOfflineMode: true, hasAdvancedReports: true },
  });
  const enterprise = await prisma.plan.upsert({
    where: { name: 'enterprise' },
    update: {},
    create: { name: 'enterprise', maxStores: -1, maxUsers: -1, maxProducts: -1, hasMobileApp: true, hasOfflineMode: true, hasAdvancedReports: true },
  });

  // ── Creator Admin ──
  await prisma.user.upsert({
    where: { email: 'admin@pos.dev' },
    update: {},
    create: { name: 'Creator Admin', email: 'admin@pos.dev', passwordHash: pw, role: 'CREATOR' },
  });

  // ── Demo Company ──
  const company = await prisma.company.upsert({
    where: { email: 'demo@shopmart.com' },
    update: {},
    create: { name: 'ShopMart Retail', email: 'demo@shopmart.com', phone: '+1-555-0100', planId: pro.id },
  });

  // ── Company Settings (all modules ON) ──
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      multiStore: true,
      productVariants: true,
      weightBasedProducts: false,
      expiryTracking: true,
      loyaltyPoints: true,
      suppliers: true,
      stockTransfer: true,
      discountRules: true,
      gstBilling: true,
      customerProfiles: true,
      reports: true,
      offlineMode: true,
      offlineAllowedDays: 7,
      primaryColor: '#3b82f6',
    },
  });

  // ── Subscription ──
  const now = new Date();
  const oneYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  await prisma.subscription.create({
    data: {
      companyId: company.id,
      planId: pro.id,
      status: 'ACTIVE',
      startDate: now,
      endDate: oneYear,
      nextBillingAt: oneYear,
    },
  });

  // ── Stores ──
  const mainStore = await prisma.store.create({
    data: { companyId: company.id, name: 'Main Branch', address: '123 Market Street, Downtown', phone: '+1-555-0101' },
  });
  const westStore = await prisma.store.create({
    data: { companyId: company.id, name: 'West Side Store', address: '456 West Avenue', phone: '+1-555-0102' },
  });

  // ── Users ──
  const owner = await prisma.user.create({
    data: { companyId: company.id, storeId: mainStore.id, name: 'John Owner', email: 'owner@shopmart.com', passwordHash: pw, role: 'OWNER' },
  });
  const manager = await prisma.user.create({
    data: { companyId: company.id, storeId: mainStore.id, name: 'Sarah Manager', email: 'manager@shopmart.com', passwordHash: staffPw, role: 'MANAGER' },
  });
  const cashier1 = await prisma.user.create({
    data: { companyId: company.id, storeId: mainStore.id, name: 'Mike Cashier', email: 'mike@shopmart.com', passwordHash: staffPw, role: 'CASHIER' },
  });
  const cashier2 = await prisma.user.create({
    data: { companyId: company.id, storeId: westStore.id, name: 'Emily Cashier', email: 'emily@shopmart.com', passwordHash: staffPw, role: 'CASHIER' },
  });

  // ── Products ──
  const products = await Promise.all([
    prisma.product.create({ data: { companyId: company.id, name: 'Organic Whole Milk (1L)', sku: 'MLK-001', barcode: '8901234560001', category: 'Dairy', basePrice: 4.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'White Bread Loaf', sku: 'BRD-001', barcode: '8901234560002', category: 'Bakery', basePrice: 3.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Free Range Eggs (12pk)', sku: 'EGG-001', barcode: '8901234560003', category: 'Dairy', basePrice: 5.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Basmati Rice (5kg)', sku: 'RIC-001', barcode: '8901234560004', category: 'Grains', basePrice: 12.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Extra Virgin Olive Oil (500ml)', sku: 'OIL-001', barcode: '8901234560005', category: 'Cooking', basePrice: 8.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Chicken Breast (1kg)', sku: 'CHK-001', barcode: '8901234560006', category: 'Meat', basePrice: 9.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Atlantic Salmon Fillet', sku: 'FSH-001', barcode: '8901234560007', category: 'Seafood', basePrice: 14.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Coca-Cola (330ml x 6)', sku: 'BEV-001', barcode: '8901234560008', category: 'Beverages', basePrice: 5.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Greek Yogurt (500g)', sku: 'YOG-001', barcode: '8901234560009', category: 'Dairy', basePrice: 4.29 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Cheddar Cheese Block (250g)', sku: 'CHS-001', barcode: '8901234560010', category: 'Dairy', basePrice: 6.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Spaghetti Pasta (500g)', sku: 'PST-001', barcode: '8901234560011', category: 'Grains', basePrice: 2.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Tomato Sauce (680g)', sku: 'SAU-001', barcode: '8901234560012', category: 'Cooking', basePrice: 3.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Green Tea (100 bags)', sku: 'TEA-001', barcode: '8901234560013', category: 'Beverages', basePrice: 7.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Peanut Butter (340g)', sku: 'PNB-001', barcode: '8901234560014', category: 'Spreads', basePrice: 4.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Organic Honey (500g)', sku: 'HNY-001', barcode: '8901234560015', category: 'Spreads', basePrice: 9.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Almond Milk (1L)', sku: 'AML-001', barcode: '8901234560016', category: 'Dairy', basePrice: 3.79 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Frozen Mixed Vegetables (1kg)', sku: 'FRZ-001', barcode: '8901234560017', category: 'Frozen', basePrice: 4.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Dark Chocolate Bar (100g)', sku: 'CHO-001', barcode: '8901234560018', category: 'Snacks', basePrice: 3.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Laundry Detergent (2L)', sku: 'DET-001', barcode: '8901234560019', category: 'Household', basePrice: 11.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Paper Towels (6 rolls)', sku: 'PPT-001', barcode: '8901234560020', category: 'Household', basePrice: 8.49 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Orange Juice Fresh (1L)', sku: 'OJC-001', barcode: '8901234560021', category: 'Beverages', basePrice: 4.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Avocado (each)', sku: 'AVO-001', barcode: '8901234560022', category: 'Fruits', basePrice: 1.99 } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Banana (per kg)', sku: 'BAN-001', barcode: '8901234560023', category: 'Fruits', basePrice: 1.49, isWeightBased: true, unit: 'kg' } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Apple Red Delicious (per kg)', sku: 'APL-001', barcode: '8901234560024', category: 'Fruits', basePrice: 3.29, isWeightBased: true, unit: 'kg' } }),
    prisma.product.create({ data: { companyId: company.id, name: 'Mineral Water (1.5L x 6)', sku: 'WAT-001', barcode: '8901234560025', category: 'Beverages', basePrice: 4.49 } }),
  ]);

  // ── Stock for Main Store ──
  const stockData = products.map((p, i) => ({
    companyId: company.id,
    storeId: mainStore.id,
    productId: p.id,
    qty: [50, 80, 60, 35, 25, 40, 20, 100, 45, 30, 70, 55, 40, 35, 20, 60, 25, 90, 15, 30, 40, 75, 100, 80, 120][i] ?? 50,
    lowStockAt: 10,
  }));
  await prisma.stock.createMany({ data: stockData });

  // ── Stock for West Store (fewer items, some low) ──
  const westStockData = products.slice(0, 15).map((p, i) => ({
    companyId: company.id,
    storeId: westStore.id,
    productId: p.id,
    qty: [20, 15, 10, 8, 5, 12, 3, 40, 7, 6, 25, 18, 9, 4, 2][i] ?? 10,
    lowStockAt: 10,
  }));
  await prisma.stock.createMany({ data: westStockData });

  // ── Customers ──
  const customers = await Promise.all([
    prisma.customer.create({ data: { companyId: company.id, name: 'Alice Johnson', phone: '+1-555-2001', email: 'alice@email.com' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Bob Williams', phone: '+1-555-2002', email: 'bob@email.com' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Carol Davis', phone: '+1-555-2003' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'David Brown', phone: '+1-555-2004', email: 'david@email.com' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Eva Martinez', phone: '+1-555-2005' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Frank Wilson', phone: '+1-555-2006', email: 'frank@email.com' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Grace Lee', phone: '+1-555-2007' } }),
    prisma.customer.create({ data: { companyId: company.id, name: 'Henry Taylor', phone: '+1-555-2008', email: 'henry@email.com' } }),
  ]);

  // ── Suppliers ──
  await Promise.all([
    prisma.supplier.create({ data: { companyId: company.id, name: 'FreshFarms Wholesale', email: 'orders@freshfarms.com', phone: '+1-555-3001', address: '789 Farm Road' } }),
    prisma.supplier.create({ data: { companyId: company.id, name: 'Metro Distributors', email: 'supply@metro.com', phone: '+1-555-3002', address: '321 Industrial Blvd' } }),
    prisma.supplier.create({ data: { companyId: company.id, name: 'Pacific Seafood Co.', email: 'sales@pacificseafood.com', phone: '+1-555-3003', address: '100 Harbor Way' } }),
    prisma.supplier.create({ data: { companyId: company.id, name: 'Sunrise Bakery Supply', email: 'info@sunrisebakery.com', phone: '+1-555-3004' } }),
    prisma.supplier.create({ data: { companyId: company.id, name: 'CleanHome Products', email: 'bulk@cleanhome.com', phone: '+1-555-3005', address: '55 Commerce Park' } }),
  ]);

  // ── Sales (past 30 days) ──
  const paymentMethods: ('CASH' | 'CARD' | 'UPI')[] = ['CASH', 'CARD', 'UPI'];
  const cashiers = [cashier1.id, cashier2.id, manager.id];

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const salesPerDay = dayOffset === 0 ? 5 : Math.floor(Math.random() * 6) + 2; // 2-7 sales per day, 5 today

    for (let s = 0; s < salesPerDay; s++) {
      const saleDate = new Date();
      saleDate.setDate(saleDate.getDate() - dayOffset);
      saleDate.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);

      const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 items
      const saleItems: { productId: number; qty: number; unitPrice: number; lineTotal: number }[] = [];
      const usedProducts = new Set<number>();

      for (let i = 0; i < numItems; i++) {
        let prod;
        do {
          prod = products[Math.floor(Math.random() * products.length)];
        } while (usedProducts.has(prod.id));
        usedProducts.add(prod.id);

        const qty = Math.floor(Math.random() * 3) + 1;
        const unitPrice = Number(prod.basePrice);
        saleItems.push({ productId: prod.id, qty, unitPrice, lineTotal: qty * unitPrice });
      }

      const subtotal = saleItems.reduce((sum, i) => sum + i.lineTotal, 0);
      const total = subtotal;
      const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      const cashierId = dayOffset === 0
        ? cashiers[s % cashiers.length]
        : cashiers[Math.floor(Math.random() * cashiers.length)];
      const customerId = Math.random() > 0.4 ? customers[Math.floor(Math.random() * customers.length)].id : null;
      const storeId = Math.random() > 0.3 ? mainStore.id : westStore.id;

      const receiptNo = `RCP-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

      await prisma.sale.create({
        data: {
          companyId: company.id,
          storeId,
          cashierId,
          customerId,
          subtotal: Math.round(subtotal * 100) / 100,
          total: Math.round(total * 100) / 100,
          discountAmount: 0,
          taxAmount: 0,
          receiptNo,
          status: 'COMPLETED',
          createdAt: saleDate,
          items: {
            create: saleItems.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: Math.round(item.lineTotal * 100) / 100,
              discount: 0,
              taxAmount: 0,
            })),
          },
          payments: {
            create: [{ method, amount: Math.round(total * 100) / 100 }],
          },
        },
      });
    }
  }

  console.log('');
  console.log('✅ Seed complete!');
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  CREATOR PANEL (http://localhost:3000)');
  console.log('  Email:    admin@pos.dev');
  console.log('  Password: admin123');
  console.log('═══════════════════════════════════════════');
  console.log('  CLIENT APP  (http://localhost:3002)');
  console.log('  ─── Owner ───');
  console.log('  Email:    owner@shopmart.com');
  console.log('  Password: admin123');
  console.log('  ─── Manager ───');
  console.log('  Email:    manager@shopmart.com');
  console.log('  Password: staff123');
  console.log('  ─── Cashier ───');
  console.log('  Email:    mike@shopmart.com');
  console.log('  Password: staff123');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  Company: ShopMart Retail');
  console.log('  Stores:  Main Branch, West Side Store');
  console.log(`  Products: ${products.length}`);
  console.log(`  Customers: ${customers.length}`);
  console.log('  Suppliers: 5');
  console.log('  Sales: ~100+ (past 30 days)');
  console.log('═══════════════════════════════════════════');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
