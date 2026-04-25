import { Router } from 'express';
import authRoutes from './auth.routes';
import companyRoutes from './companies.routes';
import planRoutes from './plans.routes';
import storeRoutes from './stores.routes';
import userRoutes from './users.routes';
import subscriptionRoutes from './subscriptions.routes';
import productRoutes from './products.routes';
import salesRoutes from './sales.routes';
import reportRoutes from './reports.routes';
import customerRoutes from './customers.routes';
import supplierRoutes from './suppliers.routes';
import purchaseOrderRoutes from './purchaseOrders.routes';
import taxRateRoutes from './taxRates.routes';
import discountRuleRoutes from './discountRules.routes';
import stockManagementRoutes from './stockManagement.routes';
import shiftRoutes from './shifts.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/companies', companyRoutes);
router.use('/plans', planRoutes);
router.use('/stores', storeRoutes);
router.use('/users', userRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/products', productRoutes);
router.use('/sales', salesRoutes);
router.use('/reports', reportRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/tax-rates', taxRateRoutes);
router.use('/discount-rules', discountRuleRoutes);
router.use('/stock-management', stockManagementRoutes);
router.use('/shifts', shiftRoutes);

export default router;
