import { Router } from 'express';
import { createSale, getSales, getSaleById, syncOfflineSales, refundSale, voidSale } from '../controllers/sales.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', requireCashier, createSale);
router.post('/sync', requireCashier, syncOfflineSales);
router.get('/', requireManager, getSales);
router.get('/:id', requireCashier, getSaleById);
router.post('/:id/refund', requireManager, refundSale);
router.post('/:id/void', requireManager, voidSale);

export default router;
