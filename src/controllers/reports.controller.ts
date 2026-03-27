import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import ExcelJS from 'exceljs';

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    todayAgg, yesterdayAgg, totalProducts, totalCustomers,
    recentSales, lowStockProducts, weekSales, todayPayments,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { companyId, status: 'COMPLETED', createdAt: { gte: todayStart } },
      _sum: { total: true, taxAmount: true, discountAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: { companyId, status: 'COMPLETED', createdAt: { gte: yesterdayStart, lt: todayStart } },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.product.count({ where: { companyId, isActive: true } }),
    prisma.customer.count({ where: { companyId } }),
    prisma.sale.findMany({
      where: { companyId, status: 'COMPLETED' },
      include: {
        customer: { select: { name: true } },
        payments: { select: { method: true, amount: true } },
        cashier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.stock.findMany({
      where: { companyId, qty: { lte: 10 } },
      include: { product: { select: { name: true, sku: true, category: true } } },
      orderBy: { qty: 'asc' },
      take: 8,
    }),
    // Sales for last 7 days (for chart)
    prisma.sale.findMany({
      where: { companyId, status: 'COMPLETED', createdAt: { gte: weekAgo } },
      select: { total: true, createdAt: true },
    }),
    // Today's payment methods
    prisma.payment.findMany({
      where: { sale: { companyId, status: 'COMPLETED', createdAt: { gte: todayStart } } },
      select: { method: true, amount: true },
    }),
  ]);

  // Build 7-day chart
  const dailyChart: { date: string; revenue: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyChart.push({ date: key, revenue: 0, count: 0 });
  }
  for (const s of weekSales) {
    const key = s.createdAt.toISOString().split('T')[0];
    const entry = dailyChart.find((d) => d.date === key);
    if (entry) { entry.revenue += Number(s.total); entry.count++; }
  }

  // Payment breakdown
  const paymentBreakdown: Record<string, number> = {};
  for (const p of todayPayments) {
    paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount);
  }

  // Comparison percentages
  const todayRev = Number(todayAgg._sum.total) || 0;
  const yesterdayRev = Number(yesterdayAgg._sum.total) || 0;
  const revenueChange = yesterdayRev > 0 ? ((todayRev - yesterdayRev) / yesterdayRev) * 100 : 0;
  const todayCount = todayAgg._count.id;
  const yesterdayCount = yesterdayAgg._count.id;
  const salesChange = yesterdayCount > 0 ? ((todayCount - yesterdayCount) / yesterdayCount) * 100 : 0;

  res.json({
    todaySales: todayCount,
    todayRevenue: todayRev,
    todayTax: Number(todayAgg._sum.taxAmount) || 0,
    todayDiscount: Number(todayAgg._sum.discountAmount) || 0,
    avgOrderValue: todayCount > 0 ? todayRev / todayCount : 0,
    revenueChange: Math.round(revenueChange),
    salesChange: Math.round(salesChange),
    totalProducts,
    totalCustomers,
    dailyChart,
    paymentBreakdown: Object.entries(paymentBreakdown).map(([method, total]) => ({ method, total })),
    recentSales: recentSales.map((s) => ({
      id: s.id,
      receiptNo: s.receiptNo,
      totalAmount: Number(s.total),
      createdAt: s.createdAt,
      customer: s.customer,
      cashier: s.cashier,
      paymentMethod: s.payments[0]?.method || 'CASH',
    })),
    lowStockProducts: lowStockProducts.map((s) => ({
      id: s.productId,
      name: s.product.name,
      sku: s.product.sku,
      category: s.product.category,
      totalStock: Number(s.qty),
    })),
  });
};

export const getReportSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { period = 'month' } = req.query;

  const now = new Date();
  let from: Date;
  if (period === 'today') from = new Date(now.setHours(0, 0, 0, 0));
  else if (period === 'week') { from = new Date(); from.setDate(from.getDate() - 7); }
  else if (period === 'year') { from = new Date(); from.setFullYear(from.getFullYear() - 1); }
  else { from = new Date(); from.setMonth(from.getMonth() - 1); }

  const where = { companyId, status: 'COMPLETED' as const, createdAt: { gte: from } };

  const [agg, sales, topProducts] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.sale.findMany({
      where,
      include: { payments: true },
    }),
    prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { ...where } },
      _sum: { qty: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 10,
    }),
  ]);

  const totalRevenue = Number(agg._sum.total) || 0;
  const totalSales = agg._count.id;
  const totalItemsSold = sales.reduce((sum, s) => sum + 1, 0);

  // Payment breakdown
  const paymentMap: Record<string, { count: number; total: number }> = {};
  for (const sale of sales) {
    for (const p of sale.payments) {
      if (!paymentMap[p.method]) paymentMap[p.method] = { count: 0, total: 0 };
      paymentMap[p.method].count++;
      paymentMap[p.method].total += Number(p.amount);
    }
  }

  // Fetch product names for top products
  const productIds = topProducts.map((tp) => tp.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));

  res.json({
    salesSummary: {
      totalSales,
      totalRevenue,
      avgOrderValue: totalSales > 0 ? totalRevenue / totalSales : 0,
      totalItemsSold,
    },
    topProducts: topProducts.map((tp) => ({
      id: tp.productId,
      name: productMap[tp.productId] || 'Unknown',
      totalSold: Number(tp._sum.qty) || 0,
      revenue: Number(tp._sum.lineTotal) || 0,
    })),
    salesByPayment: Object.entries(paymentMap).map(([method, data]) => ({
      method,
      count: data.count,
      total: data.total,
    })),
    dailySales: (() => {
      // Group sales by date
      const dailyMap: Record<string, { count: number; revenue: number }> = {};
      for (const sale of sales) {
        const dateKey = sale.createdAt.toISOString().split('T')[0];
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { count: 0, revenue: 0 };
        dailyMap[dateKey].count++;
        dailyMap[dateKey].revenue += Number(sale.total);
      }
      return Object.entries(dailyMap)
        .map(([date, data]) => ({ date, count: data.count, revenue: data.revenue }))
        .sort((a, b) => a.date.localeCompare(b.date));
    })(),
  });
};

export const getStaffPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { period = 'month' } = req.query;

  const now = new Date();
  let from: Date;
  if (period === 'today') from = new Date(new Date().setHours(0, 0, 0, 0));
  else if (period === 'week') { from = new Date(); from.setDate(from.getDate() - 7); }
  else if (period === 'year') { from = new Date(); from.setFullYear(from.getFullYear() - 1); }
  else { from = new Date(); from.setMonth(from.getMonth() - 1); }

  const where = { companyId, status: 'COMPLETED' as const, createdAt: { gte: from } };

  const sales = await prisma.sale.findMany({
    where,
    include: { cashier: { select: { id: true, name: true, role: true } } },
  });

  // Group by cashier
  const staffMap: Record<number, { name: string; role: string; salesCount: number; totalRevenue: number }> = {};
  for (const sale of sales) {
    const cId = sale.cashierId;
    if (!staffMap[cId]) {
      staffMap[cId] = { name: sale.cashier.name, role: sale.cashier.role, salesCount: 0, totalRevenue: 0 };
    }
    staffMap[cId].salesCount++;
    staffMap[cId].totalRevenue += Number(sale.total);
  }

  const staff = Object.entries(staffMap).map(([id, data]) => ({
    id: Number(id),
    name: data.name,
    role: data.role,
    totalSales: data.salesCount,
    revenue: data.totalRevenue,
    avgOrderValue: data.salesCount > 0 ? data.totalRevenue / data.salesCount : 0,
  }));

  res.json(staff);
};

export const getSalesSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { from, to, storeId } = req.query;

  const where: Record<string, unknown> = {
    companyId,
    status: 'COMPLETED',
    createdAt: {
      gte: from ? new Date(String(from)) : new Date(new Date().setHours(0, 0, 0, 0)),
      lte: to ? new Date(String(to)) : new Date(),
    },
  };
  if (storeId) where.storeId = Number(storeId);

  const [sales, totalResult] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { payments: true, items: true },
    }),
    prisma.sale.aggregate({
      where,
      _sum: { total: true, taxAmount: true, discountAmount: true },
      _count: { id: true },
    }),
  ]);

  const paymentBreakdown = sales.reduce(
    (acc, sale) => {
      sale.payments.forEach((p) => {
        acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  res.json({
    totalSales: totalResult._count.id,
    totalRevenue: totalResult._sum.total || 0,
    totalTax: totalResult._sum.taxAmount || 0,
    totalDiscount: totalResult._sum.discountAmount || 0,
    paymentBreakdown,
  });
};

export const downloadExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  const companyId = req.user!.companyId!;
  const { from, to, type = 'sales' } = req.query;

  const where: Record<string, unknown> = {
    companyId,
    status: 'COMPLETED',
    createdAt: {
      gte: from ? new Date(String(from)) : new Date(new Date().setDate(new Date().getDate() - 30)),
      lte: to ? new Date(String(to)) : new Date(),
    },
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');

  if (type === 'sales') {
    sheet.columns = [
      { header: 'Receipt No', key: 'receiptNo', width: 20 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Cashier', key: 'cashier', width: 20 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Discount', key: 'discount', width: 15 },
      { header: 'Tax', key: 'tax', width: 15 },
      { header: 'Total', key: 'total', width: 15 },
    ];

    const sales = await prisma.sale.findMany({
      where,
      include: { cashier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    sales.forEach((sale) => {
      sheet.addRow({
        receiptNo: sale.receiptNo,
        date: sale.createdAt.toISOString(),
        cashier: sale.cashier.name,
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discountAmount),
        tax: Number(sale.taxAmount),
        total: Number(sale.total),
      });
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${Date.now()}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
};
